import * as prompt from '@inquirer/prompts';
import {ExitPromptError} from '@inquirer/prompts';
import {FollowerFetcherEvent, FollowerFetcherEventTypes, fetchFollowerGraph} from "./instagram/follower";
import SessionData from "./instagram/session-data";
import {UnsettledUser, UnsettledUserGraph, UserGraph} from "./instagram/user";
import {PathOrFileDescriptor, writeFileSync} from "node:fs";
import {ReadableStream} from "node:stream/web";
import {authenticate, readExistingSessionId, rootUser, wholeNumberPrompt} from "./cli/promps";
import {settleGraph} from "./cli/graph";
import {readFileSync} from "fs";


async function writeGraphToFile(filename: string, graph: UserGraph) {
    try {
        writeFileSync(filename, JSON.stringify(graph, null, 2))
        console.log(`Wrote graph into ${filename}.`)
    } catch (error) {
        console.error({message: `Cannot write graph into ${filename}. Using stdout instead.`, error})
        await new Promise(resolve => setTimeout(() => {
            console.log(JSON.stringify(graph));
            resolve(undefined);
        }, 500))
    }

    return filename
}

async function generateVisualization({template, output, graph, title}: {
    template: PathOrFileDescriptor,
    output: string,
    title: string
    graph: UserGraph | string
}) {
    if (typeof graph !== 'string') {
        graph = JSON.stringify(graph);
    }

    const result = readFileSync(template, {encoding: 'utf-8'})
        .replace('REPLACE-ME-WITH-TITLE', title)
        .replace('REPLACE-ME-WITH-USER-GRAPH', btoa(encodeURIComponent(graph)));

    writeFileSync(output, result)
    console.log(`Created visualization for graph in ${output}.`)
}


async function streamGraph(root: UnsettledUser, filename: string, stream: ReadableStream<FollowerFetcherEvent>) {
    let graph: UnsettledUserGraph = {}
    let cancellation: Promise<void>

    const updatesSaveFiles = async (graph: UnsettledUserGraph) => {
        console.log('Waiting for profile pictures to be downloaded.')
        const result = await settleGraph(graph)

        console.log('Writing current graph to disk.')
        return Promise.all([
            writeGraphToFile(`${filename}.json`, result),
            generateVisualization({
                template: 'dist/index.html',
                graph: result,
                output: `${filename}.html`,
                title: `${root.profile.name} @${root.profile.username} - ${new Date().toISOString()}`,
            })])
    }

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

            const identifier = `(${value.user.profile.username})`
            const time = `[${new Date().toISOString()}]`

            if (value.type === FollowerFetcherEventTypes.DEPTH_LIMIT_FOLLOWER) {
                console.log(`${time} Reached the maximum amount of followers to include. Currently included are ${value.amount}. ${identifier}`)
            } else if (value.type === FollowerFetcherEventTypes.DEPTH_LIMIT_FOLLOWING) {
                console.log(`${time} Reached the maximum amount of followed users to include. Currently included are ${value.amount}. ${identifier}`)
            } else if (value.type === FollowerFetcherEventTypes.RATE_LIMIT_BATCH) {
                console.log(`${time} Reached follower batch limit. Resuming after ${value.delay} milliseconds. ${identifier}`)
                await updatesSaveFiles(value.graph)
            } else if (value.type === FollowerFetcherEventTypes.RATE_LIMIT_DAILY) {
                console.log(`${time} Reached follower daily limit. Resuming after ${value.delay} milliseconds. ${identifier}`)
                await updatesSaveFiles(value.graph)
            } else if (value.type === FollowerFetcherEventTypes.UPDATE) {
                const total = Object.entries(value.graph).length
                const followers = value.added.followers.ids.length;
                const users = value.added.users.length
                const targetUsername = value.added.followers.target.profile.username;


                console.log(
                    `${time} Added ${followers > 0 ? followers : 'no'} follower${followers > 1 ? 's' : ''} to ${targetUsername}. ` +
                    `Discovered ${users > 0 ? users : 'no'} new user${users > 1 ? 's' : ''}. ` +
                    `Total user count: ${total}, completely queried users ${value.added.progress.done}. ${identifier}`
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

function environmentVariableOrDefault(envVarName: string, defaultValue: number) {
    const env = process.env[envVarName]
    if ((env?.length ?? 0) < 1) return defaultValue

    const errorMessage = `Failed to read ${envVarName}, expected a positive whole number, ` +
        `got "${env}". Falling back to the default value ${defaultValue}`

    try {
        const value = parseInt(env, 10)

        if (value >= 0) return value

        console.error(errorMessage)
    } catch (e) {
        console.error(errorMessage)
    }

    return defaultValue
}


try {
    const existingSession = await prompt.confirm({message: "Use an existing session id?", default: true});

    const session: SessionData = await (!existingSession ? authenticate() : readExistingSessionId())

    if (await prompt.confirm({message: "Show session data?", default: false})) {
        console.dir({session})
    }

    const root = await rootUser({session})
    const filename = `${root.id}:${root.profile.username}:${new Date().toISOString()}`

    const generations = await wholeNumberPrompt({
        message: "Generations to include: ", defaultValue: 1
    })

    const followers = await wholeNumberPrompt({
        message: "Maximal follower count to include for each user: ", defaultValue: 250
    })

    const includeFollowing = await prompt.confirm({message: "Include following?", default: true})

    const stream = fetchFollowerGraph({
        includeFollowing,
        root,
        session,
        limits: {
            depth: {
                generations,
                followers,
            },
            rate: {
                batch: {
                    size: environmentVariableOrDefault("RATE_BATCH_SIZE", 3000),
                    count: environmentVariableOrDefault("RATE_BATCH_COUNT", 15)
                },
                parallelTasks: environmentVariableOrDefault("RATE_PARALLEL_TASKS", 3),
                delay: {
                    images: {
                        max: environmentVariableOrDefault("RATE_DELAY_IMAGES_MAX", 5) * 1000,
                        min: environmentVariableOrDefault("RATE_DELAY_IMAGES_MIN", 1) * 1000
                    },
                    pages: {
                        max: environmentVariableOrDefault("RATE_DELAY_PAGES_MAX", 60) * 1000,
                        min: environmentVariableOrDefault("RATE_DELAY_PAGES_MIN", 30) * 1000
                    },
                    batches: {
                        max: environmentVariableOrDefault("RATE_DELAY_BATCHES_MAX", 60) * 60 * 1000,
                        min: environmentVariableOrDefault("RATE_DELAY_BATCHES_MIN", 30) * 60 * 1000
                    },
                    daily: {
                        max: environmentVariableOrDefault("RATE_DELAY_DAILY_MAX", 30) * 60 * 60 * 1000,
                        min: environmentVariableOrDefault("RATE_DELAY_DAILY_MIN", 25) * 60 * 60 * 1000
                    }
                }
            }
        }
    })

    const {graph: unsettledGraph, cancellation} = await streamGraph(root, filename, stream)

    console.log('Waiting for profile pictures to be downloaded.')
    const graph = await settleGraph(unsettledGraph)

    const fileWriters = Promise.allSettled([
        writeGraphToFile(`${filename}.json`, graph),
        generateVisualization({
            template: 'dist/index.html',
            graph,
            title: `${root.profile.name} @${root.profile.username} - ${new Date().toISOString()}`,
            output: `${filename}.html`
        })
    ])

    await Promise.all([
        fileWriters.then(() => {
            console.info(
                "The process may still needs to wait on the rate limiting timeouts to exit cleanly. " +
                "Killing it should not cause any data lose."
            )
        }),
        cancellation
    ])
} catch (e) {
    if (!(e instanceof ExitPromptError)) {
        console.error(e)
    }
}
