import SessionData, {sessionToCookie} from "./session-data";
import {RandomDelayLimit, Limits} from "./limits";
import {downloadProfilePicture, User, UserGraph} from "./user";
import {ReadableStream} from "node:stream/web";
import {hasJsonBody} from "./request";

export enum FollowerFetcherEventTypes {
    UPDATE, RATE_LIMIT_BATCH, RATE_LIMIT_DAILY, DEPTH_LIMIT_FOLLOWER, DEPTH_LIMIT_FOLLOWING
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

function addFollowingToGraph({graph, following, done, task, controller}: {
    graph: UserGraph,
    following: User[],
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
    root: User,
    session: SessionData,
    includeFollowing: boolean,
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

                controller.close()
                return
            }

            await createFollowerGraph({limits, graph, session, controller, includeFollowing});
            return controller.close();
        },
    })
}

function excess(current: number, limit: number, addition: any[]) {
    return addition.slice(addition.length - (current - limit))
}

async function createFollowerGraph({controller, limits, graph, session, includeFollowing}: {
    controller: ReadableStreamDefaultController<FollowerFetcherEvent>,
    graph: UserGraph,
    limits: Limits,
    session: SessionData,
    includeFollowing: boolean,
}) {
    const done: Set<number> = new Set()
    let phase = 0

    for (let i = 0; i <= limits.depth.generations; i++) {
        const open = Object.values(graph)
            .filter(user => !done.has(user.id))
            .map(user => user.id)

        if (open.length < 1) break;  // no open task, skip remaining generations

        while (open.length > 0) {
            const batchSize = Math.floor(limits.rate.batchSize / 100)
            const batch = open.splice(0, batchSize < 1 ? 1 : batchSize).map(async task => {
                graph[task].followerIds = graph[task].followerIds ?? []

                const followers = async () => {
                    let nextPage = undefined

                    while (nextPage !== null) {
                        const followers = await fetchFollowers({
                            session,
                            targetUser: graph[task],
                            nextPage,
                            limits,
                            direction: FollowerDirection.FOLLOWER
                        })

                        addFollowerToGraph({graph, followers: followers.page, done, target: task, controller})

                        nextPage = followers.nextPage

                        phase = await rateLimiter({
                            graph,
                            user: graph[task],
                            phase,
                            limits: limits,
                            batchCount: batch.length,
                            controller,
                        })

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

                    while (nextPage !== null) {
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


                        phase = await rateLimiter({
                            graph,
                            user: graph[task],
                            phase,
                            batchCount: batch.length,
                            limits,
                            controller
                        })

                        followingCount += following.page.length

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

                await Promise.all([followers(), (includeFollowing ? following() : Promise.resolve())])

                done.add(task);
            });

            await Promise.all(batch)
        }
    }

    return graph
}

enum FollowerDirection {
    FOLLOWER, FOLLOWING
}

async function fetchFollowers({session, targetUser, nextPage, direction, limits}: {
    session: SessionData, targetUser: User, nextPage?: string, direction: FollowerDirection, limits: Limits
}): Promise<{ page: User[], nextPage: string }> {
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
