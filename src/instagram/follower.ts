import SessionData, {sessionToCookie} from "./session-data";
import {RandomDelayLimit, Limits} from "./limits";
import {downloadProfilePicture, UnsettledUser, UnsettledUserGraph} from "./user";
import {ReadableStream} from "node:stream/web";
import {hasJsonBody} from "./request";

export enum FollowerFetcherEventTypes {
    UPDATE, RATE_LIMIT_BATCH, RATE_LIMIT_DAILY, DEPTH_LIMIT_FOLLOWER, DEPTH_LIMIT_FOLLOWING
}

export interface FollowerFetcherAddition {
    followers: number[],
    users: UnsettledUser[],
    progress: {
        done: number
    }
}

export interface FollowerFetcherEvent {
    type: FollowerFetcherEventTypes,
    user: UnsettledUser,
    graph: UnsettledUserGraph
    added?: FollowerFetcherAddition,
    delay?: number,
    amount?: number
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


async function rateLimiter({graph, user, phase, taskCount, limits, controller}: {
    graph: UnsettledUserGraph,
    user: UnsettledUser,
    phase: number,
    taskCount: number
    limits: Limits,
    controller: ReadableStreamDefaultController<FollowerFetcherEvent>
}) {
    const phaseProgression = Math.floor(
        Object.entries(graph).length / (limits.rate.batch.size - taskCount * 25)
    )

    if (phase < phaseProgression) {
        if (phaseProgression > limits.rate.batch.count) {
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
            const delay = randomDelay(limits.rate.delay.batches)
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

function addFollowerToGraph({graph, followers, done, target, controller}: {
    graph: UnsettledUserGraph,
    followers: UnsettledUser[],
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

function addFollowingToGraph({graph, following, done, task, controller}: {
    graph: UnsettledUserGraph,
    following: UnsettledUser[],
    done: Set<number>,
    task: number,
    controller: ReadableStreamDefaultController<FollowerFetcherEvent>
},) {
    following.filter(following => graph[following.id] !== undefined).forEach(user => addFollowerToGraph({
        graph,
        followers: [graph[task]],
        done,
        controller,
        target: user.id
    }))

    following.filter(following => graph[following.id] === undefined).forEach(user => {
        graph[user.id] = {
            ...user,
            followerIds: [task]
        };

        controller.enqueue({
            graph: {...graph},
            type: FollowerFetcherEventTypes.UPDATE,
            user,
            added: {users: [user], progress: {done: done.size}, followers: [task]}
        })
    })
}

export function getFollowerGraph({root, session, limits, includeFollowing}: {
    root: UnsettledUser,
    session: SessionData,
    includeFollowing: boolean,
    limits: Limits
}): ReadableStream<FollowerFetcherEvent> {
    const graph: UnsettledUserGraph = {[root.id]: root}

    let controller: ReadableStreamDefaultController<FollowerFetcherEvent>

    return new ReadableStream<FollowerFetcherEvent>({
        start: async (c: ReadableStreamDefaultController<FollowerFetcherEvent>) => {
            controller = c

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

                controller.close()
                return
            }

            try {
                await createFollowerGraph({limits, graph, session, controller, includeFollowing});
            } catch (e) {
                controller.error(e)
                return
            }

            controller.close();
        },
        cancel: async () => {
            graph.canceled = true
        }
    })
}

function excess(current: number, limit: number, addition: any[]) {
    return addition.slice(addition.length - (current - limit))
}

async function createFollowerGraph({controller, limits, graph, session, includeFollowing}: {
    controller: ReadableStreamDefaultController<FollowerFetcherEvent>,
    graph: UnsettledUserGraph,
    limits: Limits,
    session: SessionData,
    includeFollowing: boolean,
}) {
    const done: Set<number> = new Set()
    let phase = 0

    for (let gen = 0; gen <= limits.depth.generations && !graph.canceled; ++gen) {
        const open = Object.values(graph)
            .filter(user => !done.has(user.id))
            .map(user => user.id)

        if (open.length < 1 || graph.canceled) break;  // no open task, skip remaining generations

        while (open.length > 0 && !graph.canceled) {
            const taskCount = Math.min(Math.floor(limits.rate.batch.size / 100), limits.rate.parallelTasks)
            const tasks = open.splice(0, taskCount < 1 ? 1 : taskCount).map(async task => {
                graph[task].followerIds = graph[task].followerIds ?? []

                const followers = async () => {
                    let nextPage = undefined

                    while (nextPage !== null && !graph.canceled) {
                        const newPhase = gen === 0 ? 0 : await rateLimiter({
                            graph,
                            user: graph[task],
                            phase,
                            limits: limits,
                            taskCount: taskCount,
                            controller,
                        })

                        const followers = await fetchFollowers({
                            session,
                            targetUser: graph[task],
                            nextPage,
                            limits,
                            direction: FollowerDirection.FOLLOWER
                        })

                        addFollowerToGraph({graph, followers: followers.page, done, target: task, controller})

                        nextPage = followers.nextPage
                        phase = newPhase

                        const userFollowerCount = graph[task].followerIds.length;
                        if (limits.depth.followers > 0 && userFollowerCount >= limits.depth.followers) {
                            excess(userFollowerCount, limits.depth.followers, followers.page)
                                .forEach(user => done.add(user.id))

                            controller.enqueue({
                                type: FollowerFetcherEventTypes.DEPTH_LIMIT_FOLLOWER,
                                user: graph[task],
                                graph,
                                amount: userFollowerCount
                            })
                            break;
                        }
                    }
                }

                const following = async () => {
                    let nextPage = undefined
                    let followingCount = 0

                    while (nextPage !== null && !graph.canceled) {
                        const newPhase = gen === 0 ? 0 : await rateLimiter({
                            graph,
                            user: graph[task],
                            phase,
                            taskCount: taskCount,
                            limits,
                            controller
                        })

                        const following = await fetchFollowers({
                            session,
                            targetUser: graph[task],
                            nextPage,
                            limits,
                            direction: FollowerDirection.FOLLOWING
                        })

                        addFollowingToGraph({
                            graph,
                            following: following.page,
                            done,
                            controller,
                            task: graph[task].id
                        })

                        followingCount += following.page.length
                        phase = newPhase

                        if (limits.depth.followers > 0 && followingCount >= limits.depth.followers) {
                            excess(followingCount, limits.depth.followers, following.page)
                                .forEach(user => done.add(user.id))

                            controller.enqueue({
                                type: FollowerFetcherEventTypes.DEPTH_LIMIT_FOLLOWING,
                                user: graph[task],
                                graph: {...graph},
                                amount: followingCount
                            })
                            break;
                        }

                        nextPage = following.nextPage;
                    }
                }

                try {
                    await Promise.all([followers(), (includeFollowing ? following() : Promise.resolve())])
                } catch (e) {
                    controller.error(e)
                }

                done.add(task);
            });

            await Promise.all(tasks)
        }
    }

    return graph
}

enum FollowerDirection {
    FOLLOWER, FOLLOWING
}

async function fetchFollowers({session, targetUser, nextPage, direction, limits}: {
    session: SessionData, targetUser: UnsettledUser, nextPage?: string, direction: FollowerDirection, limits: Limits
}): Promise<{ page: UnsettledUser[], nextPage: string }> {
    const query = nextPage ? `?max_id=${nextPage}` : '';
    const directionPath = direction === FollowerDirection.FOLLOWING ? 'following' : 'followers'

    const response = await fetch(`https://www.instagram.com/api/v1/friendships/${targetUser.id}/${directionPath}/${query}`, {
        headers: {
            "Sec-Fetch-Site": "same-origin",
            "X-IG-App-ID": "936619743392459",
            "Cookie": sessionToCookie(session),
        }
    })

    if (!response.ok) {
        if (hasJsonBody(response)) {
            const data = (await response.json()) as {
                message?: string,
                require_login?: boolean
            }

            if (data.require_login) throw Error("Authentication failure while querying followers. Check your session id again.")

            throw Error(
                data.message ??
                `Received status code ${response.status} (${response.statusText}) while querying followers. ` +
                `The response contained the following: ${data}`)
        } else {
            throw Error(await response.text() ?? 'Failed to load followers.')
        }
    }

    const page = (await response.json()) as {
        users: {
            id: string,
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
                id: parseInt(user.id, 10),
                profile: {
                    username: user.username,
                    name: user.full_name,
                    image: randomDelay({
                        lower: 0,
                        upper: limits.rate.delay.pages.upper
                    }).delay.then(() => downloadProfilePicture(user.profile_pic_url))
                },
                public: !user.is_private,
                private: user.is_private && targetUser.id != session.user.id
            }
        }),
        nextPage: page.next_max_id ?? null
    }
}
