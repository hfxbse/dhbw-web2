import hexToArrayBuffer from "hex-to-array-buffer";
import sealBox from "tweetnacl-sealedbox-js";
import SessionData from "./session-data";

const crypto = globalThis.crypto
const encoder = new TextEncoder()

export class TwoFactorRequired extends Error {
    info: TwoFactorInformation

    constructor(info: TwoFactorInformation) {
        super("Two factor authentication is enabled for this account.");
        this.info = info
    }
}

export interface TwoFactorInformation {
    identifier: string,
    user: {
        username: string,
        id: number
    },
    device: string,
}

export interface InstagramEncryptionKey {
    public: string,
    id: number,
    version: number
}

export interface VerificationData {
    csrf: string
    key: InstagramEncryptionKey
}

export interface EncryptedPassword {
    timestamp: number,
    cipher: string
}

export async function fetchVerification(): Promise<VerificationData> {
    const response = await fetch("https://www.instagram.com/api/v1/web/data/shared_data/", {
        headers: {
            "Sec-Fetch-Site": "same-origin"
        }
    })

    const data = await response.json() as {
        config: {
            csrf_token: string
        },
        encryption: {
            key_id: string,
            public_key: string,
            version: string
        }
    }

    return {
        csrf: data.config.csrf_token,
        key: {
            id: parseInt(data.encryption.key_id, 10),
            public: data.encryption.public_key,
            version: parseInt(data.encryption.version, 10),
        }
    }
}

export async function encryptPassword({time, password, key, providedKey}: {
    time?: Date | undefined,
    providedKey?: CryptoKey | undefined,
    password: string,
    key: InstagramEncryptionKey
}): Promise<EncryptedPassword> {
    const passwordBuffer = encoder.encode(password)
    const timeString = ((time ?? new Date()).getTime() / 1000).toFixed(0)

    if (key.public.length !== 64) throw new Error("Wrong public key hex.")
    const keyBuffer = new Uint8Array(hexToArrayBuffer(key.public))

    const target = new Uint8Array(100 + passwordBuffer.length)
    target.set([1, key.id])

    const algorithmName = "AES-GCM"
    const rawKeys = providedKey ?? await crypto.subtle.generateKey({
        length: keyBuffer.byteLength * 8,
        name: algorithmName
    }, true, ['encrypt', 'decrypt'])

    const iv = new Uint8Array(12)

    const exportedKeys = await crypto.subtle.exportKey("raw", rawKeys)
    const cipher = new Uint8Array(await crypto.subtle.encrypt({
        additionalData: encoder.encode(timeString),
        iv,
        name: algorithmName,
        tagLength: 16 * 8
    }, rawKeys, passwordBuffer.buffer))

    const box = sealBox.seal(new Uint8Array(exportedKeys), keyBuffer)
    if (box.length !== 48 + 32) throw new Error('Encrypted key is the wrong length');

    target.set([box.length, box.length >> 8 & 255], 2)
    target.set(box, 4)

    target.set(cipher.slice(-16), 84)
    target.set(cipher.slice(0, -16), 100)

    const converted = []
    target.forEach(element => converted.push(String.fromCharCode(element)))

    return {timestamp: parseInt(timeString, 10), cipher: btoa(converted.join(''))}
}

function getSessionId(response: Response): string {
    const identifier = "sessionid="
    const identify = (cookie: string) => cookie.startsWith(identifier)

    return response.headers
        .getSetCookie().find(identify)
        .split(";").find(identify)
        .substring(identifier.length)
}

function hasJsonBody(response: Response): boolean {
    return response.headers.get("Content-Type").startsWith("application/json;")
}

export async function login({user, password, verification}: {
    user: string,
    password: EncryptedPassword,
    verification: VerificationData
}): Promise<SessionData> {
    const data = new FormData()
    data.set("username", user)
    data.set(
        "enc_password",
        `#PWD_INSTAGRAM_BROWSER:${verification.key.version}:${password.timestamp}:${password.cipher}`
    )

    const response = await fetch("https://www.instagram.com/api/v1/web/accounts/login/ajax/", {
        method: "POST",
        body: data,
        headers: {
            "X-CSRFToken": verification.csrf,
            "Sec-Fetch-Site": "same-origin"
        }
    })

    if (!response.ok) {
        if (hasJsonBody(response)) {
            const data = await response.json() as {
                message?: string,
                two_factor_required?: boolean,
                two_factor_info?: {
                    pk: number,
                    username: string,
                    two_factor_identifier: string,
                    device_id: string
                }
            }

            if (data.two_factor_required) {
                throw new TwoFactorRequired({
                    user: {
                        id: data.two_factor_info.pk,
                        username: data.two_factor_info.username
                    },
                    identifier: data.two_factor_info.two_factor_identifier,
                    device: data.two_factor_info.device_id
                })
            }

            throw new Error(data.message ?? "Login attempted failed.")
        } else {
            throw new Error(await response.text())
        }
    }

    const result = (await response.json()) as {
        authenticated: boolean,
        userId: number
    }

    if (result.authenticated !== true) {
        throw new Error("Authentication failed. Check your credentials.")
    }

    return {
        id: getSessionId(response),
        user: {
            id: result.userId
        }
    }
}

export async function verify2FA({verification, info, code}: {
    info: TwoFactorInformation,
    verification: VerificationData,
    code: string
}): Promise<SessionData> {
    const body = new FormData()
    body.set("username", info.user.username)
    body.set("identifier", info.identifier)
    body.set("verificationCode", code)

    const response = await fetch("https://www.instagram.com/api/v1/web/accounts/login/ajax/two_factor/", {
        method: "POST",
        headers: {
            "X-CSRFToken": verification.csrf,
            "Sec-Fetch-Site": "same-origin",
            "X-Mid": info.device,
        },
        body
    })

    if (!response.ok) {
        const message = hasJsonBody(response) ? (await response.json()).message : await response.text()
        throw Error(message ?? "Two factor authentication failed.")
    }

    return {
        id: getSessionId(response),
        user: {
            id: info.user.id,
            username: info.user.username
        },
    }
}
