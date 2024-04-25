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

try {
    console.dir(await authenticate())
} catch (e) {
    if (!(e instanceof ExitPromptError)) {
        console.error(e)
    }
}
