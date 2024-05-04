import SessionData, {sessionToCookie} from "./session-data";
import {Limits, RandomDelayLimit} from "./limits";
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
            return phaseProgression
        }
    }

    await randomDelay(limits.rate.delay.pages).delay

    return phase
}

interface Task {
    job: () => Promise<FollowerPage>,
    user: UnsettledUser,
    noWait?: boolean,
    previousResults?: TaskResult[],
    stop?: boolean
    direction: FollowerDirection
}

interface TaskResult {
    additionalUsers: UnsettledUser[],
    additionalFollowers: number[],
    completedUsers: number[],
    graph: UnsettledUserGraph
}

function addFollowerToGraph({graph, followers, target}: {
    graph: UnsettledUserGraph,
    followers: UnsettledUser[],
    target: number,
},): TaskResult {
    const followerIds = new Set(graph[target].followerIds)
    const additionalFollowers = followers
        .map(follower => follower.id)
        .filter(id => !followerIds.has(id))

    graph[target].followerIds = [...followerIds, ...additionalFollowers]
    const additionalUsers = followers.filter(follower => graph[follower.id] === undefined)
    additionalUsers.forEach(user => graph[user.id] = user)

    const done = additionalUsers.filter(follower => follower.private)
        .map(follower => follower.id)

    return {additionalFollowers, additionalUsers, completedUsers: done, graph: {...graph}}
}

function addFollowingToGraph({graph, following, target}: {
    graph: UnsettledUserGraph,
    following: UnsettledUser[],
    target: number,
}): TaskResult[] {
    if (!graph[target].followingCount) graph[target].followingCount = 0
    graph[target].followingCount += following.length

    const results: TaskResult[] = following
        .filter(following => graph[following.id] !== undefined)
        .map(user => addFollowerToGraph({
            graph,
            followers: [graph[target]],
            target: user.id
        }))

    return results.concat(following.filter(following => graph[following.id] === undefined).map(user => {
        graph[user.id] = {...user, followerIds: [target]};

        return {
            completedUsers: results.reduce((done: number[], result) => done.concat(result.completedUsers), []),
            additionalUsers: [user],
            additionalFollowers: [target],
            graph: {...graph}
        }
    }))
}

export function getFollowerGraph({root, session, limits, includeFollowing}: {
    root: UnsettledUser,
    session: SessionData,
    includeFollowing: boolean,
    limits: Limits
}): ReadableStream<FollowerFetcherEvent> {
    const graph: UnsettledUserGraph = {[root.id]: root}

    return new ReadableStream<FollowerFetcherEvent>({
        start: async (controller: ReadableStreamDefaultController<FollowerFetcherEvent>) => {
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

async function taskRunner(graph: UnsettledUserGraph, task: Task, limits: Limits): Promise<Task | null> {
    const result = await task.job()
    const user = graph[task.user.id]

    let additions: TaskResult[] = []

    if (result.direction === FollowerDirection.FOLLOWER) {
        additions = [addFollowerToGraph({graph, followers: result.page, target: task.user.id})]

        if (!limits.depth.followers || user.followerIds.length <= limits.depth.followers) {
            return {user, job: result.next, previousResults: additions, direction: result.direction}
        }
    } else if (result.direction === FollowerDirection.FOLLOWING) {
        additions = addFollowingToGraph({graph, following: result.page, target: task.user.id})

        if (!limits.depth.followers || (user.followingCount ?? 0) <= limits.depth.followers) {
            return {user, job: result.next, previousResults: additions, direction: result.direction}
        }
    }

    const followers = result.direction === FollowerDirection.FOLLOWER;
    const amount = followers ? user.followerIds.length : user.followingCount

    return {
        job: null,
        stop: true,
        direction: result.direction,
        user,
        previousResults: [...additions, {
            completedUsers: excess(amount, limits.depth.followers, result.page),
            additionalUsers: [],
            additionalFollowers: [],
            graph: {...graph}
        }]
    }
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
        // create tasks for each uncompleted user, and put new jobs at the end of the queue, creating a more
        // meaning full breath first algorithm
        const taskQueue: Task[] = Object.values(graph)
            .filter(user => !done.has(user.id))
            .reduce((tasks, user): Task[] => {
                tasks.push({
                    job: () => fetchFollowers({session, user, limits, direction: FollowerDirection.FOLLOWER}),
                    user,
                    noWait: true,
                })

                if (includeFollowing) {
                    tasks.push({
                        job: () => fetchFollowers({session, user, limits, direction: FollowerDirection.FOLLOWING}),
                        user,
                        noWait: true
                    })
                }

                return tasks
            }, [])

        if (taskQueue.length < 1) break;  // no open task, skip remaining generations

        // Users per response: followers = 25, following = 200
        const maxParallel = Math.min(
            Math.floor(limits.rate.batch.size / (25 + (includeFollowing ? 200 : 0))),
            limits.rate.parallelTasks
        )

        const runners = new Array(Math.max(maxParallel, 1)).fill(async () => {
            while (taskQueue.length > 0 && !graph.canceled) {
                const task = taskQueue.pop()
                if (!task.job) {
                    done.add(task.user.id)
                    continue
                }

                if (!task.noWait) phase = await rateLimiter({
                    graph,
                    user: task.user,
                    phase,
                    limits,
                    controller,
                    taskCount: taskQueue.length
                })

                const next = await taskRunner(graph, task, limits)

                next.previousResults.forEach(result => {
                    result.completedUsers.forEach((id) => done.add(id))

                    controller.enqueue({
                        type: FollowerFetcherEventTypes.UPDATE,
                        user: task.user,
                        graph: {...result.graph},
                        added: {
                            followers: result.additionalFollowers,
                            users: result.additionalUsers,
                            progress: {
                                done: done.size
                            }
                        }
                    })
                })

                if (next.stop) {
                    const followers = task.direction === FollowerDirection.FOLLOWER;
                    const amount = followers ? graph[task.user.id].followerIds.length : graph[task.user.id].followingCount

                    controller.enqueue({
                        type: followers ? FollowerFetcherEventTypes.DEPTH_LIMIT_FOLLOWER : FollowerFetcherEventTypes.DEPTH_LIMIT_FOLLOWING,
                        user: task.user,
                        graph: {...graph},
                        amount
                    })
                } else {
                    taskQueue.push(next)
                }
            }
        }).map(runner => runner())

        await Promise.all(runners).catch((e) => controller.error(e))
    }

    return graph
}

enum FollowerDirection {
    FOLLOWER, FOLLOWING
}

type FollowerPage = { page: UnsettledUser[], next: null | (() => Promise<FollowerPage>), direction: FollowerDirection }

async function fetchFollowers({session, user, page, direction, limits}: {
    session: SessionData,
    user: UnsettledUser,
    page?: undefined | string | null,
    direction: FollowerDirection,
    limits: Limits
}): Promise<FollowerPage> {
    const query = page ? `?max_id=${page}` : '';
    const directionPath = direction === FollowerDirection.FOLLOWING ? 'following' : 'followers'

    const response = await fetch(`https://www.instagram.com/api/v1/friendships/${user.id}/${directionPath}/${query}`, {
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

    const result = (await response.json()) as {
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
        direction,
        page: result.users.map((user) => {
            const id = parseInt(user.id, 10)

            return {
                id,
                profile: {
                    username: user.username,
                    name: user.full_name,
                    image: randomDelay(limits.rate.delay.images).delay.then(() => downloadProfilePicture(user.profile_pic_url))
                },
                public: !user.is_private,
                private: user.is_private && id != session.user.id
            }
        }),
        next: result.next_max_id ? () => fetchFollowers({
            session,
            user: user,
            page: result.next_max_id,
            direction,
            limits
        }) : null
    }
}
