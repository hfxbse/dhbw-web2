import {describe, expect, test} from "@jest/globals";
import {encryptPassword} from "../src/instagram";

interface InstagramEncryptionKey {
    public: string,
    id: number,
}

interface PasswordEncryption {
    password: string,
    encryptionKey: InstagramEncryptionKey,
    providedKey: Uint8Array,
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
}

const encryptionTestCases: PasswordEncryption[] = [
    {
        password: "12345678",
        encryptionKey: instagramKey87,
        providedKey: new Uint8Array([
            19, 168, 95, 134, 127, 20, 177, 171, 173, 63, 50, 209, 62, 47, 70, 86, 172, 99, 7, 217, 105, 78, 224, 116,
            97, 168, 255, 104, 110, 142, 39, 135,
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
        providedKey: new Uint8Array([
            43, 37, 50, 175, 12, 231, 99, 252, 209, 88, 153, 187, 95, 111, 192, 117, 68, 88, 250, 17, 87, 78, 82, 172,
            175, 8, 29, 206, 197, 153, 38, 18,
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
        providedKey: new Uint8Array([
            78, 254, 81, 197, 106, 5, 68, 95, 239, 197, 9, 173, 62, 13, 168, 119, 237, 110, 29, 197, 133, 84, 163, 61,
            105, 236, 57, 206, 96, 244, 52, 62,
        ]),
        expected: {
            start: "AaVQA",
            end: "8bMu0OFgsFELZ+vKlSBEj8oYDWNUNpZZzBhawzQB+j/Y/KmJw4ck/IsOIlWnGqjKZnVYiAwQDtvpVgE1ZtKZLsHTgNafSIl4fw==",
            length: 212
        }
    }
]

describe("Password encryption", () => {
    describe("Matches Instagram's web app", () => {
        test.each(encryptionTestCases)("$password", async ({password, time, expected, providedKey, encryptionKey}) => {
            const cryptoKeys = await crypto.subtle.importKey(
                "raw",
                providedKey,
                "AES-GCM",
                true,
                ['encrypt', 'decrypt']
            )

            const {encryptedPassword} = await encryptPassword({
                password,
                time,
                providedKey: cryptoKeys,
                keyId: encryptionKey.id,
                publicKey: encryptionKey.public
            })

            // Only the surrounding bits and the length of the encrypted password match every time,
            // the remaining characters are random and therefore cannot be checked.
            // I might be missing something here though
            expect(encryptedPassword.length).toStrictEqual(expected.length)
            expect(encryptedPassword.substring(0, expected.start.length)).toStrictEqual(expected.start)
            expect(encryptedPassword.substring(expected.length - expected.end.length)).toStrictEqual(expected.end)
        })
    })


    test("Consecutive runs generate different encrypted passwords", async () => {
        const password = "12345678"
        const time = new Date()

        const encryptionConfig = {
            password,
            time,
            keyId: instagramKey87.id,
            publicKey: instagramKey87.public
        }

        const [first, second] = await Promise.all([
            encryptPassword(encryptionConfig),
            encryptPassword(encryptionConfig)
        ])

        expect(first).not.toStrictEqual(second)
    })
})
