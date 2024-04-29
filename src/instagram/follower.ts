import SessionData, {sessionToCookie} from "./session-data";
import {RandomDelayLimit, Limits} from "./limits";
import {User, UserGraph} from "./user";
import {ReadableStream} from "node:stream/web";

export enum FollowerFetcherEventTypes {
    UPDATE, RATE_LIMIT_BATCH, RATE_LIMIT_DAILY, DEPTH_LIMIT
}

export interface FollowerFetcherAddition {
    followers: number[],
    users: User[],
    progress: {
        done: number
    }
}

export interface FollowerFetcherEvent {
    type: FollowerFetcherEventTypes,
    user: User,
    graph: UserGraph
    added?: FollowerFetcherAddition,
    delay?: number
}

function randomDelay(limit: RandomDelayLimit) {
    if (limit.lower > limit.upper) {
        const temp = limit.lower;
        limit.lower = limit.upper;
        limit.upper = temp
    }

    const time = Math.floor(Math.random() * (limit.upper - limit.lower) + limit.lower);
    return {time, delay: new Promise(resolve => setTimeout(resolve, time))}
}


async function rateLimiter({graph, user, phase, batchCount, limits, controller}: {
    graph: UserGraph,
    user: User,
    phase: number,
    batchCount: number
    limits: Limits,
    controller: ReadableStreamDefaultController<FollowerFetcherEvent>
}) {
    const phaseProgression = Math.floor(
        Object.entries(graph).length / (limits.rate.batchSize - batchCount * 25)
    )

    if (phase < phaseProgression) {
        printGraph(graph)

        if (phaseProgression > limits.rate.batchCount) {
            const delay = randomDelay(limits.rate.delay.daily)
            controller.enqueue({
                type: FollowerFetcherEventTypes.RATE_LIMIT_DAILY,
                user: user,
                delay: delay.time,
                graph
            })

            await delay.delay
            return 0
        } else {
            const delay = randomDelay(limits.rate.delay.daily)
            controller.enqueue({
                type: FollowerFetcherEventTypes.RATE_LIMIT_BATCH,
                user: user,
                delay: delay.time,
                graph
            })

            await delay.delay
            return phase
        }
    }

    // delay between retrieving the next follower page
    await randomDelay(limits.rate.delay.pages).delay

    return phase
}

export function printGraph(graph: UserGraph) {
    console.table(Object.values(graph).map(user => {
        return {
            id: user.id,
            username: user.profile.username,
            private: user.private,
            followerCount: user.followerIds?.length,
            followers: user.followerIds?.map(id => graph[id].profile.username),
        }
    }))
}

function addFollowerToGraph({graph, followers, done, target, controller}: {
    graph: UserGraph,
    followers: User[],
    done: Set<number>,
    target: number,
    controller: ReadableStreamDefaultController<FollowerFetcherEvent>
},) {
    const followerIds = new Set(graph[target].followerIds)
    const additionalFollowers = followers
        .map(follower => follower.id)
        .filter(id => !followerIds.has(id))

    graph[target].followerIds = [...followerIds, ...additionalFollowers]
    const additionalUsers = followers.filter(follower => graph[follower.id] === undefined)
    additionalUsers.forEach(user => graph[user.id] = user)

    additionalUsers.filter(follower => follower.private)
        .map(follower => follower.id)
        .forEach(id => done.add(id))

    controller.enqueue({
        type: FollowerFetcherEventTypes.UPDATE,
        user: graph[target],
        added: {
            followers: additionalFollowers,
            users: additionalUsers,
            progress: {
                done: done.size
            }
        },
        graph
    })
}

export function getFollowerGraph({root, session, limits}: {
    root: User,
    session: SessionData,
    limits: Limits
}): ReadableStream<FollowerFetcherEvent> {
    const graph: UserGraph = {[root.id]: root}

    return new ReadableStream<FollowerFetcherEvent>({
        async start(controller: ReadableStreamDefaultController<FollowerFetcherEvent>) {
            if (root.private) {
                controller.enqueue({
                    type: FollowerFetcherEventTypes.UPDATE,
                    user: root,
                    added: {
                        followers: [],
                        users: [root],
                        progress: {
                            done: 1
                        }
                    },
                    graph
                })

                return Promise.resolve(() => controller.close())
            }

            await createFollowerGraph({limits, graph, session, controller});
            return controller.close();
        },
    })
}

async function createFollowerGraph({controller, limits, graph, session}: {
    controller: ReadableStreamDefaultController<FollowerFetcherEvent>,
    graph: UserGraph,
    limits: Limits,
    session: SessionData
}) {
    const done: Set<number> = new Set()
    let phase = 0

    for (let i = 0; i <= limits.depth.generations; i++) {
        const open = Object.values(graph)
            .filter(user => !done.has(user.id))
            .map(user => user.id)

        if (open.length < 1) break;  // no open task, skip remaining generations

        while (open.length > 0) {
            const batch = open.splice(0, Math.floor(limits.rate.batchSize / 100)).map(async task => {
                let nextPage = undefined
                graph[task].followerIds = graph[task].followerIds ?? []

                while (nextPage !== null) {
                    const followers = await fetchFollowers({
                        session,
                        targetUser: graph[task],
                        nextPage
                    })

                    addFollowerToGraph({graph, followers: followers.page, done, target: task, controller})

                    nextPage = followers.nextPage

                    const userFollowerCount = graph[task].followerIds.length;
                    if (limits.depth.followers > 0 && userFollowerCount >= limits.depth.followers) {
                        controller.enqueue({type: FollowerFetcherEventTypes.DEPTH_LIMIT, user: graph[task], graph})
                        break;
                    }

                    phase = await rateLimiter({
                        graph,
                        user: graph[task],
                        phase,
                        limits: limits,
                        batchCount: batch.length,
                        controller,
                    })
                }

                done.add(task);
            });

            await Promise.all(batch)
        }
    }

    return graph
}

async function fetchFollowers({session, targetUser, nextPage}: {
    session: SessionData, targetUser: User, nextPage?: string
}): Promise<{ page: User[], nextPage: string }> {
    const query = nextPage ? `?max_id=${nextPage}` : '';
    const response = await fetch(`https://www.instagram.com/api/v1/friendships/${targetUser.id}/followers/${query}`, {
        headers: {
            "Sec-Fetch-Site": "same-origin",
            "X-IG-App-ID": "936619743392459",
            "Cookie": sessionToCookie(session),
        }
    })

    const page = (await response.json()) as {
        users: {
            id: number,
            full_name: string,
            username: string,
            profile_pic_url: string,
            is_private: boolean
        }[],
        next_max_id?: string | null
    }

    return {
        page: page.users.map((user) => {
            return {
                id: user.id,
                profile: {
                    username: user.username,
                    name: user.full_name,
                    imageURL: new URL(user.profile_pic_url)
                },
                public: !user.is_private,
                private: user.is_private && targetUser.id != session.user.id
            }
        }),
        nextPage: page.next_max_id ?? null
    }
}
