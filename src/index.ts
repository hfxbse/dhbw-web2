import * as prompt from '@inquirer/prompts';
import {
    encryptPassword,
    fetchVerification,
    login, SessionData,
    TwoFactorInformation,
    TwoFactorRequired,
    VerificationData,
    verify2FA
} from "./instagram";
import {ExitPromptError} from "@inquirer/prompts";


async function authenticate(): Promise<SessionData> {
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

async function twoFactor({verification, info}: {
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

async function readExistingSessionId(): Promise<SessionData> {
    const sessionId = await prompt.password({message: "Session id: "})

    return {
        id: sessionId,
        user: {
            id: parseInt(sessionId.split("%")[0], 10)
        }
    }
}


try {
    const existingSession = await prompt.confirm({message: "Use an existing session id?", default: false});

    const session: SessionData = await (!existingSession ? authenticate() : readExistingSessionId())

    if (await prompt.confirm({message: "Show session data?", default: false})) {
        console.dir({session})
    }
} catch (e) {
    if (!(e instanceof ExitPromptError)) {
        console.error(e)
    }
}
