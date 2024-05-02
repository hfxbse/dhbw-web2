import * as prompt from '@inquirer/prompts';
import {ExitPromptError} from '@inquirer/prompts';
import {FollowerFetcherEvent, FollowerFetcherEventTypes, getFollowerGraph, printGraph} from "./instagram/follower";
import SessionData from "./instagram/session-data";
import {UnsettledUser, UnsettledUserGraph} from "./instagram/user";
import {writeFileSync} from "node:fs";
import {ReadableStream} from "node:stream/web";
import {authenticate, readExistingSessionId, rootUser, wholeNumberPrompt} from "./cli/promps";
import {settleGraph} from "./cli/graph";


const writeGraphToFile = async (root: UnsettledUser, graph: UnsettledUserGraph) => {
    const filename = `${root.id}:${root.profile.username}:${new Date().toISOString()}.json`
    const data = await settleGraph(graph)

    try {
        writeFileSync(filename, JSON.stringify(data, null, 2))
        console.log(`Wrote graph into ${filename}.`)
    } catch (error) {
        console.error({message: `Cannot write graph into ${filename}. Using stdout instead.`, error})
        await new Promise(resolve => setTimeout(() => {
            console.log(JSON.stringify(data));
            resolve(undefined);
        }, 500))
    }

    return filename
}

async function streamGraph(stream: ReadableStream<FollowerFetcherEvent>) {
    let graph: UnsettledUserGraph = {}
    let cancellation: Promise<void>

    const reader = stream.getReader()

    process.on('SIGINT', () => {
        console.info("Process will terminate as soon as it is cleanly possible.")
        reader.releaseLock()
        stream.cancel();
    });

    try {
        while (stream.locked) {
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
    } catch (e) {
        if (stream.locked) {
            reader.releaseLock()
            cancellation = stream.cancel()
            console.error(e)
        }
    }

    return {graph, cancellation}
}


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

    const stream = getFollowerGraph({
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
    })

    const {graph, cancellation} = await streamGraph(stream)
    await Promise.all([writeGraphToFile(root, graph).then(() => {
        console.info(
            "The may process still needs to wait on the rate limiting timeouts to exit cleanly. " +
            "Killing it should not cause any data lose."
        )
    }), cancellation])
} catch (e) {
    if (!(e instanceof ExitPromptError)) {
        console.error(e)
    }
}
