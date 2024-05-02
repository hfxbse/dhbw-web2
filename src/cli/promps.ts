import SessionData from "../instagram/session-data";
import {
    encryptPassword,
    fetchVerification,
    login,
    TwoFactorInformation,
    TwoFactorRequired,
    VerificationData, verify2FA
} from "../instagram/login";
import * as prompt from "@inquirer/prompts";
import {fetchUser} from "../instagram/user";
import {ExitPromptError} from "@inquirer/prompts";
import {blobToDataUrl} from "./graph";

export async function authenticate(): Promise<SessionData> {
    const verification = await fetchVerification()

    while (true) {
        const user = await prompt.input({message: "Instagram username, phone number, or email: "})
        const password = await prompt.password({message: "Password: "})

        const encryptedPassword = await encryptPassword({password, key: verification.key})

        try {
            return await login({user, password: encryptedPassword, verification})
        } catch (e) {
            if (!(e instanceof TwoFactorRequired)) {
                console.error((e as Error).message)
                continue
            }

            return await twoFactor({info: (e as TwoFactorRequired).info, verification})
        }
    }
}

export async function twoFactor({verification, info}: {
    verification: VerificationData,
    info: TwoFactorInformation
}): Promise<SessionData> {
    while (true) {
        const code = await prompt.input({message: "Two factor authentication code: "})

        try {
            return await verify2FA({verification, code, info})
        } catch (e) {
            console.error(e.message)
        }
    }
}

export async function readExistingSessionId(): Promise<SessionData> {
    while (true) {
        const sessionId = await prompt.password({message: "Session id: "})
        const userId = parseInt(sessionId.split("%")[0], 10)

        if(isNaN(userId)) {
            console.log("Session id seems to be invalid. Try again.")
            continue
        }

        return {
            id: sessionId,
            user: {
                id: parseInt(sessionId.split("%")[0], 10)
            }
        }
    }
}

export async function rootUser({session}) {
    while (true) {
        try {
            const rootUsername = await prompt.input({
                message: "Starting point account username:  ",
                default: session.user.username
            })

            const rootUser = await fetchUser(rootUsername.trim(), session);
            console.dir({
                ...rootUser,
                profile: {
                    ...rootUser.profile,
                    image: await rootUser.profile.image.then(blobToDataUrl).then(url => url.href)
                }
            })

            if (await prompt.confirm({message: "Continue with this user?", default: true})) {
                return rootUser
            }
        } catch (e) {
            if ((e instanceof ExitPromptError)) throw e;

            console.error(`Error: ${e.message ?? e}\n\nCould not load user. Try again.`)
        }
    }
}

export async function wholeNumberPrompt({message, defaultValue}: { message: string, defaultValue: number }) {
    return prompt.input({
        message,
        default: defaultValue.toString(10),
        validate: input => /^\d*$/.test(input)
    }).then(input => parseInt(input, 10))
}
