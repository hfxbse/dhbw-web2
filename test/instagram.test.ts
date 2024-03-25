import {beforeEach, describe, expect, test, jest} from "@jest/globals";
import {
    EncryptedPassword,
    encryptPassword,
    fetchVerification,
    InstagramEncryptionKey,
    login, TwoFactorRequired,
    VerificationData
} from "../src/instagram";

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

describe("Login request handler", () => {
    const encryptedPassword: EncryptedPassword = {
        cipher: btoa("cipher-text-as-base64"),
        timestamp: 1234567890
    }

    const verification: VerificationData = {
        key: instagramKey87,
        csrf: "random-csrf-value"
    }

    test("Returns session id on success", async () => {
        const sessionId = "a-super-secret-session-id"

        const headers = new Headers()
        headers.set(
            "set-cookie",
            `sessionid=${sessionId}; Domain=.instagram.com; expires=Tue, 25-Mar-2025 12:23:08 GMT; HttpOnly; Max-Age=31536000; Path=/; Secure`
        )

        jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({authenticated: true}),
            headers
        } as Response))

        const result = await login({
            user: "user",
            password: encryptedPassword,
            verification
        })

        expect(result).toStrictEqual(sessionId)
    })

    describe("Throws on failed login", () => {
        test.each([undefined, "Received error description"])("Message: %s", async (message) => {
            const headers = new Headers()
            headers.set("Content-Type", "application/json; charset=utf-8")

            jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
                ok: false,
                json: () => Promise.resolve({authenticated: false, message}),
                headers
            } as Response))

            try {
                await login({
                    user: "user",
                    password: encryptedPassword,
                    verification
                })
            } catch (e) {
                expect(e.message).toStrictEqual(message ?? expect.any(String))
            }

            expect.assertions(1)
        })
    })

    test("Throws if not authenticated", async () => {
        jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({authenticated: false}),
        } as Response))

        try {
            await login({user: "user", password: encryptedPassword, verification})
        } catch (e) {
            expect(e.message).toStrictEqual(expect.any(String))
        }

        expect.assertions(1)
    })

    test("Throws on failed request", async () => {
        const message = "Error message"

        const headers = new Headers()
        headers.set("Content-Type", "text/plain; charset=utf-8")

        jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
            ok: false,
            text: () => Promise.resolve(message),
            headers
        } as Response))


        try {
            await login({user: "user", password: encryptedPassword, verification})
        } catch (e) {
            expect(e.message).toStrictEqual(message)
        }

        expect.assertions(1)
    })

    test("Throws if 2FA is required", async () => {
        const headers = new Headers()
        headers.set("Content-Type", "application/json; charset=utf-8")

        jest.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({
            ok: false,
            json: () => Promise.resolve({two_factor_required: true}),
            headers
        } as Response))

        try {
            await login({user: "user", password: encryptedPassword, verification})
        } catch (e) {
            expect(e).toBeInstanceOf(TwoFactorRequired)
        }

        expect.assertions(1)
    })
})
