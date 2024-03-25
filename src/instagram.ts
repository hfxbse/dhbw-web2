import hexToArrayBuffer from "hex-to-array-buffer";
import sealBox from "tweetnacl-sealedbox-js";

const crypto = globalThis.crypto
const encoder = new TextEncoder()

export class TwoFactorRequired extends Error {
    constructor() {
        super("Two factor authentication is enabled for this account.");
    }
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

export async function login({user, password, verification}: {
    user: string,
    password: EncryptedPassword,
    verification: VerificationData
}): Promise<string> {
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
        if (response.headers.get("Content-Type").startsWith("application/json;")) {
            const data = await response.json() as {
                message?: string,
                two_factor_required?: boolean
            }

            if (data.two_factor_required) {
                throw new TwoFactorRequired()
            }

            throw new Error(data.message ?? "Login attempted failed.")
        } else {
            throw new Error(await response.text())
        }
    }

    if ((await response.json())["authenticated"] !== true) {
        throw new Error("Authentication failed.")
    }

    const identifier = "sessionid="
    const identify = (cookie: string) => cookie.startsWith(identifier)

    return response.headers
        .getSetCookie().find(identify)
        .split(";").find(identify)
        .substring(identifier.length)
}

export async function verify2FA({}: { user: string, verification: VerificationData, code: string }) {
    throw Error("Not implemented.")
}
