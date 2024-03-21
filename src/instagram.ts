import hexToArrayBuffer from "hex-to-array-buffer";
import sealBox from "tweetnacl-sealedbox-js"

const crypto = globalThis.crypto
const encoder = new TextEncoder()

async function fetchVerification(): Promise<{ csrf: string, keyVersion: number, keyId: number, publicKey: string }> {
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
        keyId: parseInt(data.encryption.key_id, 10),
        publicKey: data.encryption.public_key,
        keyVersion: parseInt(data.encryption.version, 10),
    }
}

async function encryptPassword({time = new Date(), password, keyId, publicKey}: {
    time?: Date,
    password: string,
    keyId: number,
    publicKey: string,
}) {
    const passwordBuffer = encoder.encode(password)
    const timeString = (time.getTime() / 1000).toFixed(0)

    if (publicKey.length !== 64) throw new Error("Wrong public key hex.")
    const keyBuffer = new Uint8Array(hexToArrayBuffer(publicKey))

    const target = new Uint8Array(100 + passwordBuffer.length)
    target.set([1, keyId])

    const algorithmName = "AES-GCM"
    const rawKeys = await crypto.subtle.generateKey({
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

    return {time: parseInt(timeString, 10), encryptedPassword: btoa(converted.join(''))}
}

export async function login({user, password}: { user: string, password: string }): Promise<string> {
    const verification = await fetchVerification()
    const {time, encryptedPassword} = await encryptPassword({...verification, password})

    const data = new FormData()
    data.set("username", user)
    data.set(
        "enc_password",
        `#PWD_INSTAGRAM_BROWSER:${verification.keyVersion}:${time}:${encryptedPassword}`
    )

    const response = await fetch("https://www.instagram.com/api/v1/web/accounts/login/ajax/", {
        method: "POST",
        body: data,
        headers: {
            "X-CSRFToken": verification.csrf,
            "Sec-Fetch-Site": "same-origin"
        }
    })

    const identifier = "sessionid="
    const identify = (cookie: string) => cookie.startsWith(identifier)

    if (!response.ok) {
        if (response.headers.get("Content-Type").startsWith("application/json;")) {
            throw new Error((await response.json()).message ?? "Login attempted failed.")
        } else {
            throw new Error(await response.text())
        }
    }

    if ((await response.json())["authenticated"] !== true) {
        throw new Error("Authentication failed.")
    }

    return response.headers
        .getSetCookie().find(identify)
        .split(";").find(identify)
        .substring(identifier.length)
}
