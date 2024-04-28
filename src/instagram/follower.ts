import SessionData from "./session-data";
import {RandomDelayLimit, RateLimits} from "./limits";
import {User, UserGraph} from "./user";


function sessionToCookie(session?: SessionData | undefined) {
    return session ? `sessionid=${session.id}; ds_user_id=${session.user.id}` : ''
}

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

export async function fetchUser(username: string, session?: SessionData): Promise<User> {
    const response = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
        headers: {
            "Sec-Fetch-Site": "same-origin",
            "X-IG-App-ID": "936619743392459",
            "Cookie": sessionToCookie(session)
        }
    })

    const user = (await response.json() as {
        data: {
            user: {
                id: number,
                full_name: string,
                username: string,
                profile_pic_url: string,
                is_private: boolean,
                followed_by_viewer: boolean,
                is_business_account: boolean,
                is_professional_account: boolean
            }
        }
    }).data.user

    const mapped = {
        id: user.id,
        profile: {
            name: user.full_name,
            username: user.username,
            imageURL: user.profile_pic_url ? new URL(user.profile_pic_url) : null,
        },
        personal: !user.is_business_account && !user.is_professional_account,
        public: !user.is_private
    };

    if (session) mapped["private"] = !user.followed_by_viewer && user.is_private;

    return mapped;
}

async function rateLimiter({graph, user, phase, batchCount, rateLimit}: {
    graph: UserGraph,
    user: User,
    phase: number,
    batchCount: number
    rateLimit: RateLimits
}) {
    const phaseProgression = Math.floor(Object.entries(graph).length / (rateLimit.batchSize - batchCount * 25))

    if (phase < phaseProgression) {
        printGraph(graph)

        const task = `(Task: ${user.profile.username})`

        if (phaseProgression > rateLimit.batchCount) {
            await randomDelay(
                rateLimit.delay.daily,
                `Reached daily limit. ${task}`
            )

            return 0
        } else {    // Delay after
            await randomDelay(
                rateLimit.delay.batches,
                `Batch limit reached. ${task}.`
            )

            return phaseProgression
        }
    }

    // delay between retrieving the next follower page
    await randomDelay(rateLimit.delay.pages)

    return phase
}

export function printGraph(graph: UserGraph) {
    console.table(Object.values(graph).map(user => {
        return {
            id: user.id,
            username: user.profile.username,
            private: user.private,
            followerCount: user.followerIds?.length,
            firstFollowers: user.followerIds?.map(id => graph[id].profile.username)
        }
    }))
}

export async function getFollowerGraph({gen, root, session, rateLimit}: {
    gen: number,
    root: User,
    session: SessionData,
    rateLimit: RateLimits
}): Promise<UserGraph> {
    const graph: UserGraph = {[root.id]: root}

    if (root.private) {
        return graph
    }

    const done: Set<number> = new Set()

    for (let i = 0; i <= gen; i++) {
        const open = Object.keys(graph)
            .filter(userId => !done.has(parseInt(userId, 10)))
            .map(openIds => parseInt(openIds, 10))

        if (open.length < 1) break;  // no open task, skip remaining generations

        while (open.length > 0) {
            let phase = 0

            const batch = open.splice(0, Math.floor(rateLimit.batchSize / 100)).map(async task => {
                let nextPage = undefined
                graph[task].followerIds = graph[task].followerIds ?? []

                while (nextPage !== null) {
                    const followers = await fetchFollowers({
                        session,
                        targetUser: graph[task],
                        nextPage
                    })

                    graph[task].followerIds.push(...followers.page.map(follower => follower.id))
                    followers.page.forEach(follower => {
                        if (!graph[follower.id]) graph[follower.id] = follower;
                    })

                    followers.page.filter(follower => follower.private)
                        .map(follower => follower.id)
                        .forEach(id => done.add(id))

                    nextPage = followers.nextPage

                    const userCount = Object.keys(graph).length;
                    console.dir({user: userCount, open: userCount - done.size, done: done.size})

                    phase = await rateLimiter({
                        graph,
                        user: graph[task],
                        phase,
                        rateLimit,
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
