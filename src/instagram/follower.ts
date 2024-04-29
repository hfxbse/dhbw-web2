import SessionData, {sessionToCookie} from "./session-data";
import {RandomDelayLimit, Limits} from "./limits";
import {User, UserGraph} from "./user";


function randomDelay(limit: RandomDelayLimit, details?: string): Promise<void> {
    if (limit.lower > limit.upper) {
        const temp = limit.lower;
        limit.lower = limit.upper;
        limit.upper = temp
    }

    const delay = Math.floor(Math.random() * (limit.upper - limit.lower) + limit.lower);

    if (details) {
        console.log(`[RATE LIMITING]: Waiting for ${delay} milliseconds. ${details}`)
    }

    return new Promise(resolve => setTimeout(resolve, delay))
}


async function rateLimiter({graph, user, phase, batchCount, limits}: {
    graph: UserGraph,
    user: User,
    phase: number,
    batchCount: number
    limits: Limits
}) {
    const phaseProgression = Math.floor(
        Object.entries(graph).length / (limits.rate.batchSize - batchCount * 25)
    )

    if (phase < phaseProgression) {
        printGraph(graph)

        const task = `(Task: ${user.profile.username})`

        if (phaseProgression > limits.rate.batchCount) {
            await randomDelay(
                limits.rate.delay.daily,
                `Reached daily limit. ${task}`
            )

            return 0
        } else {    // Delay after
            await randomDelay(
                limits.rate.delay.batches,
                `Batch limit reached. ${task}.`
            )

            return phaseProgression
        }
    }

    // delay between retrieving the next follower page
    await randomDelay(limits.rate.delay.pages)

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

function addFollowerToGraph({graph, followers, done, target}: {
    graph: UserGraph,
    followers: User[],
    done: Set<number>,
    target: number
},) {
    const followerIds = new Set(graph[target].followerIds)
    followers.forEach(follower => followerIds.add(follower.id))

    graph[target].followerIds = [...followerIds]
    followers.forEach(follower => {
        if (!graph[follower.id]) graph[follower.id] = follower;
    })

    followers.filter(follower => follower.private)
        .map(follower => follower.id)
        .forEach(id => done.add(id))
}

export async function getFollowerGraph({root, session, limits}: {
    root: User,
    session: SessionData,
    limits: Limits
}): Promise<UserGraph> {
    const graph: UserGraph = {[root.id]: root}

    if (root.private) {
        return graph
    }

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

                    addFollowerToGraph({graph, followers: followers.page, done, target: task})

                    nextPage = followers.nextPage

                    const userCount = Object.keys(graph).length;
                    console.dir({user: userCount, open: userCount - done.size, done: done.size})

                    const userFollowerCount = graph[task].followerIds.length;
                    if (limits.depth.followers > 0 && userFollowerCount >= limits.depth.followers) {
                        console.log(`[DEPTH LIMITING]: Reached maximal follower count to include. (Task: ${graph[task].profile.username}).`)
                        break;
                    }

                    phase = await rateLimiter({
                        graph,
                        user: graph[task],
                        phase,
                        limits: limits,
                        batchCount: batch.length
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
