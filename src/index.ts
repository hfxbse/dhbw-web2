import * as prompt from '@inquirer/prompts';
import {ExitPromptError} from '@inquirer/prompts';
import {
    encryptPassword,
    fetchVerification,
    login,
    TwoFactorInformation,
    TwoFactorRequired,
    VerificationData,
    verify2FA
} from "./instagram/login";
import {FollowerFetcherEventTypes, getFollowerGraph, printGraph} from "./instagram/follower";
import SessionData from "./instagram/session-data";
import {fetchUser, UserGraph} from "./instagram/user";


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


async function rootUser({session}) {
    while (true) {
        try {
            const rootUsername = await prompt.input({
                message: "Starting point account username:  ",
                default: session.user.username
            })

            const rootUser = await fetchUser(rootUsername.trim(), session);
            console.dir({...rootUser, profile: {...rootUser.profile, imageURL: rootUser.profile.imageURL.href}})

            if (await prompt.confirm({message: "Continue with this user?", default: true})) {
                return rootUser
            }
        } catch (e) {
            if ((e instanceof ExitPromptError)) throw e;

            console.error(`Error: ${e.message ?? e}\n\nCould not load user. Try again.`)
        }
    }
}

async function wholeNumberPrompt({message, defaultValue}: { message: string, defaultValue: number }) {
    return prompt.input({
        message,
        default: defaultValue.toString(10),
        validate: input => /^\d*$/.test(input)
    }).then(input => parseInt(input, 10))
}

let graph: UserGraph = {}

process.on('SIGINT', function() {
    console.log(JSON.stringify(graph))
    printGraph(graph)
    process.exit(0)
});

try {
    const existingSession = await prompt.confirm({message: "Use an existing session id?", default: false});

    const session: SessionData = await (!existingSession ? authenticate() : readExistingSessionId())

    if (await prompt.confirm({message: "Show session data?", default: false})) {
        console.dir({session})
    }

    const root = await rootUser({session})

    const generations = await wholeNumberPrompt({
        message: "Generations to include: ", defaultValue: 1
    })

    const followers = await wholeNumberPrompt({
        message: "Maximal follower count to include for each user: ", defaultValue: 250
    })

    const includeFollowing = await prompt.confirm({message: "Include following?", default: true})

    const reader = getFollowerGraph({
        includeFollowing,
        root,
        session,
        limits: {
            depth: {
                generations,
                followers,
            },
            rate: {
                batchSize: 100,
                batchCount: 2,
                delay: {
                    pages: {
                        upper: 5000,
                        lower: 3000
                    },
                    batches: {
                        upper: 35 * 60 * 1000,
                        lower: 25 * 60 * 1000
                    },
                    daily: {
                        upper: 30 * 60 * 60 * 1000,
                        lower: 25 * 60 * 60 * 1000
                    }
                }
            }
        }
    }).getReader()

    while (true) {
        const {done, value} = await reader.read()
        if (done) break;

        graph = value.graph

        const identifier = `(User: ${value.user.profile.username})`

        if (value.type === FollowerFetcherEventTypes.DEPTH_LIMIT_FOLLOWER) {
            console.log(`Reached the maximum amount of followers to include. Currently included are ${value.amount}. ${identifier}`)
        } else if (value.type === FollowerFetcherEventTypes.DEPTH_LIMIT_FOLLOWING) {
            console.log(`Reached the maximum amount of followed users to include. Currently included are ${value.amount}. ${identifier}`)
        } else if (value.type === FollowerFetcherEventTypes.RATE_LIMIT_BATCH) {
            printGraph(value.graph)
            console.log(`Reached follower batch limit. Resuming after ${value.delay} milliseconds. ${identifier}`)
        } else if (value.type === FollowerFetcherEventTypes.RATE_LIMIT_DAILY) {
            printGraph(value.graph)
            console.log(`Reached follower daily limit. Resuming after ${value.delay} milliseconds. ${identifier}`)
        } else if (value.type === FollowerFetcherEventTypes.UPDATE) {
            const total = Object.entries(value.graph).length
            const followers = value.added.followers.length;
            const users = value.added.users.length

            console.log(
                `Added ${followers > 0 ? followers : 'no'} follower${followers > 1 ? 's' : ''} to ${value.user.profile.username}. ` +
                `Discovered ${users > 0 ? users : 'no'} new user${users > 1 ? 's' : ''}. ` +
                `Total user count: ${total}, completely queried users ${value.added.progress.done}.`
            )
        }
    }

    printGraph(graph)
} catch (e) {
    if (!(e instanceof ExitPromptError)) {
        console.error(e)
    }
}

console.log(JSON.stringify(graph))
printGraph(graph)
