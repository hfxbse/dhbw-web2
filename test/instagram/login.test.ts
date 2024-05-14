import {beforeEach, describe, expect, test, jest} from "@jest/globals";
import {
    EncryptedPassword,
    encryptPassword,
    fetchVerification,
    InstagramEncryptionKey,
    login, TwoFactorInformation, TwoFactorRequired,
    VerificationData, verify2FA
} from "../../src/instagram/login";
import SessionData from "../../src/instagram/session-data";

interface PasswordEncryption {
    password: string,
    encryptionKey: InstagramEncryptionKey,
    symmetricKey: Uint8Array,
    time: Date,
    expected: {
        end: string
        start: string,
        length: number
    }
}

const instagramKey87: InstagramEncryptionKey = {
    public: "578e8e819de302cc5b6215db3a4ec84ba8630a1000d7434562a6d15d5530b571",
    id: 165,
    version: 9
}

describe("Password encryption", () => {
    const encryptionTestCases: PasswordEncryption[] = [
        {
            password: "12345678",
            encryptionKey: instagramKey87,
            symmetricKey: new Uint8Array([
                19, 168, 95, 134, 127, 20, 177, 171, 173, 63, 50, 209, 62, 47, 70, 86, 172, 99, 7, 217, 105, 78, 224,
                116, 97, 168, 255, 104, 110, 142, 39, 135,
            ]),
            time: new Date(1711324598 * 1000),
            expected: {
                end: "OlSw0xMJ1WF+NGfWt53DNQCdSXrCKESL",
                start: "AaVQA",
                length: 144
            }
        },
        {
            password: "abcdef",
            encryptionKey: instagramKey87,
            symmetricKey: new Uint8Array([
                43, 37, 50, 175, 12, 231, 99, 252, 209, 88, 153, 187, 95, 111, 192, 117, 68, 88, 250, 17, 87, 78, 82,
                172, 175, 8, 29, 206, 197, 153, 38, 18,
            ]),
            time: new Date(1711324912 * 1000),
            expected: {
                start: "AaVQA",
                end: "f0xKaa/DTViB9x3JJ2Ynj0G+hMXbDA==",
                length: 144
            }
        },
        {
            password: "a-vary-long-password-with-$*+@-to-make-sure-it-won't-fail",
            encryptionKey: instagramKey87,
            time: new Date(1711326293 * 1000),
            symmetricKey: new Uint8Array([
                78, 254, 81, 197, 106, 5, 68, 95, 239, 197, 9, 173, 62, 13, 168, 119, 237, 110, 29, 197, 133, 84, 163,
                61, 105, 236, 57, 206, 96, 244, 52, 62,
            ]),
            expected: {
                start: "AaVQA",
                end: "8bMu0OFgsFELZ+vKlSBEj8oYDWNUNpZZzBhawzQB+j/Y/KmJw4ck/IsOIlWnGqjKZnVYiAwQDtvpVgE1ZtKZLsHTgNafSIl4fw==",
                length: 212
            }
        }
    ]

    describe("Matches Instagram's web app", () => {
        test.each(encryptionTestCases)("$password", async ({password, time, expected, symmetricKey, encryptionKey}) => {
            const cryptoKeys = await crypto.subtle.importKey(
                "raw",
                symmetricKey,
                "AES-GCM",
                true,
                ['encrypt', 'decrypt']
            )

            const {cipher} = await encryptPassword({
                password,
                time,
                providedKey: cryptoKeys,
                key: {
                    id: encryptionKey.id,
                    public: encryptionKey.public
                } as InstagramEncryptionKey
            })

            // Only the surrounding bits and the length of the encrypted password match every time,
            // the remaining characters are random and therefore cannot be checked.
            // I might be missing something here though
            expect(cipher.length).toStrictEqual(expected.length)
            expect(cipher.substring(0, expected.start.length)).toStrictEqual(expected.start)
            expect(cipher.substring(expected.length - expected.end.length)).toStrictEqual(expected.end)
        })
    })

    test("Consecutive runs generate different encrypted passwords", async () => {
        const password = "12345678"
        const time = new Date()

        const encryptionConfig = {
            password,
            time,
            key: {
                id: instagramKey87.id,
                public: instagramKey87.public,
            } as InstagramEncryptionKey
        }

        const [first, second] = await Promise.all([
            encryptPassword(encryptionConfig),
            encryptPassword(encryptionConfig)
        ])

        expect(first).not.toStrictEqual(second)
    })
})

describe("Verification data fetcher", () => {
    const sharedData = {
        encryption: {
            key_id: "87",
            public_key: "8dd9aad29d9a614c338cff479f850d3ec57c525c33b3f702ab65e9e057fc087e",
            version: "9"
        },
        config: {
            csrf_token: "KdiF63JpmmBdeXp2Bs2LT7t8vlwWXXXX",
        }
    }

    beforeEach(() => {
        jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve(sharedData)
        } as Response))
    })

    test("Returns CSRF token", async () => {
        const {csrf} = await fetchVerification()
        expect(csrf).toStrictEqual(sharedData.config.csrf_token)
    })

    test("Returns public key", async () => {
        const {key} = await fetchVerification()
        expect(key.public).toStrictEqual(sharedData.encryption.public_key)
    })

    test("Returns key id", async () => {
        const {key} = await fetchVerification()
        expect(key.id).toStrictEqual(parseInt(sharedData.encryption.key_id, 10))
    })

    test("Returns key version", async () => {
        const {key} = await fetchVerification()
        expect(key.version).toStrictEqual(parseInt(sharedData.encryption.version, 10))
    })
})

function getJsonHeaders() {
    const headers = new Headers()
    headers.set("Content-Type", "application/json; charset=utf-8")

    return headers
}

function getSessionHeaders() {
    const id = "a-super-secret-session-id"

    const headers = getJsonHeaders()
    headers.set(
        "set-cookie",
        `sessionid=${id}; Domain=.instagram.com; expires=Tue, 25-Mar-2025 12:23:08 GMT; HttpOnly; Max-Age=31536000; Path=/; Secure`
    )

    return {id, headers}
}

function expectThrowsErrorWithMessage(request: Promise<any>, message: string | undefined = undefined) {
    return Promise.all([
        expect(request).rejects.toBeInstanceOf(Error),
        expect(request).rejects.toStrictEqual(expect.objectContaining({message: message ?? expect.any(String)}))
    ])
}

describe("Login request handler", () => {
    const loginData = {
        user: "user",
        password: {
            cipher: btoa("cipher-text-as-base64"),
            timestamp: 1234567890
        } as EncryptedPassword,
        verification: {
            key: instagramKey87,
            csrf: "random-csrf-value"
        } as VerificationData
    }

    test("Returns session data on success", async () => {
        const {id, headers} = getSessionHeaders()
        const response = {authenticated: true, userId: 1}
        const sessionData: SessionData = {
            id,
            user: {
                id: response.userId
            }
        }

        jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve(response),
            headers
        } as Response))

        return expect(login(loginData)).resolves.toStrictEqual(expect.objectContaining(sessionData))
    })

    describe("Throws on failed login", () => {
        test.each([undefined, "Received error description"])("Message: %s", (message) => {
            jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
                ok: false,
                json: () => Promise.resolve({authenticated: false, message}),
                headers: getJsonHeaders()
            } as Response))

            return expectThrowsErrorWithMessage(login(loginData), message)
        })
    })

    test("Throws if not authenticated", () => {
        jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({authenticated: false}),
        } as Response))

        return expectThrowsErrorWithMessage(login(loginData))
    })

    test("Throws on failed request", () => {
        const message = "Error message"

        const headers = new Headers()
        headers.set("Content-Type", "text/plain; charset=utf-8")

        jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
            ok: false,
            text: () => Promise.resolve(message),
            headers
        } as Response))

        return expectThrowsErrorWithMessage(login(loginData), message)
    })

    test("Throws if 2FA is required", () => {
        const info: TwoFactorInformation = {
            device: "device-id",
            identifier: "2fa-id",
            user: {
                id: 1,
                username: "user"
            }
        }

        jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
            ok: false,
            json: () => Promise.resolve({
                two_factor_required: true, two_factor_info: {
                    device_id: info.device,
                    two_factor_identifier: info.identifier,
                    username: info.user.username,
                    pk: info.user.id
                }
            }),
            headers: getJsonHeaders()
        } as Response))

        const loginResult = login(loginData)

        return Promise.all([
            expect(loginResult).rejects.toBeInstanceOf(TwoFactorRequired),
            expect(loginResult).rejects.toStrictEqual(expect.objectContaining({info}))
        ])
    })
})

describe("Two factor authentication handler", () => {
    const requestData = {
        verification: {} as VerificationData,
        info: {
            user: {
                id: 1,
                username: "user"
            }
        } as TwoFactorInformation,
        code: "123456"
    }

    test("Returns session data on success", () => {
        const {id, headers} = getSessionHeaders()
        const sessionData: SessionData = {
            id,
            user: {
                id: requestData.info.user.id,
                username: requestData.info.user.username
            }
        }

        jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
            ok: true,
            headers
        } as Response))

        return expect(verify2FA(requestData)).resolves.toStrictEqual(expect.objectContaining(sessionData));
    });

    describe("Throws on failed authentication", () => {
        test.each([undefined, "Received error description"])("Message: %s", (message) => {
            jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
                ok: false,
                json: () => Promise.resolve({authenticated: false, message}),
                headers: getJsonHeaders()
            } as Response))

            const verificationResult = verify2FA(requestData)

            return expectThrowsErrorWithMessage(verificationResult, message)
        })
    })
})
