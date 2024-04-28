import * as prompt from '@inquirer/prompts';
import {
    encryptPassword,
    fetchVerification,
    login,
    TwoFactorInformation,
    TwoFactorRequired,
    VerificationData,
    verify2FA
} from "./instagram/login";
import {ExitPromptError} from "@inquirer/prompts";
import {getFollowerGraph, printGraph} from "./instagram/follower";
import SessionData from "./instagram/session-data";
import {fetchUser} from "./instagram/user";


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


try {
    const existingSession = await prompt.confirm({message: "Use an existing session id?", default: false});

    const session: SessionData = await (!existingSession ? authenticate() : readExistingSessionId())

    if (await prompt.confirm({message: "Show session data?", default: false})) {
        console.dir({session})
    }

    const rootUsername = await prompt.input({
        message: "Starting point account username:  ",
        default: session.user.username
    })

    const rootUser = await fetchUser(rootUsername.trim(), session);
    console.dir(rootUser)

    const graph = await getFollowerGraph({
        gen: 0, root: rootUser, session, rateLimit: {
            batchSize: 2000,
            batchCount: 15,
            delay: {
                pages: {
                    upper: 2500,
                    lower: 500
                },
                batches: {
                    upper: 30 * 60 * 1000,
                    lower: 20 * 60 * 1000
                },
                daily: {
                    upper: 30 * 60 * 60 * 1000,
                    lower: 25 * 60 * 60 * 1000
                }
            }
        }
    })

    printGraph(graph)
} catch (e) {
    if (!(e instanceof ExitPromptError)) {
        console.error(e)
    }
}
