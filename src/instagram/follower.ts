import SessionData from "./session-data";

export interface User {
    pk: number,
    name: string,
    username: string,
    imageURL: URL | null,
    follower?: User[],
    private: boolean
}


export async function fetchUser(username: string, session: SessionData): Promise<User> {
    const response = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
        headers: {
            "Sec-Fetch-Site": "same-origin",
            "X-IG-App-ID": "936619743392459",
        }
    })
    console.dir(response);

    const user = (await response.json() as {
        data: {
            user: {
                id: number,
                full_name: string,
                username: string,
                profile_pic_url: string,
                is_private: boolean
            }
        }
    }).data.user

    console.dir({user});
    const fetchedFollower: User[] = await getFollower({targetUserId: user.id, session});
    return {
        pk: user.id,
        name: user.full_name,
        username: user.username,
        follower: fetchedFollower,
        imageURL: user.profile_pic_url ? new URL(user.profile_pic_url) : null,
        private: user.is_private,
    };
}

export async function getGenerations({gen, username, session}: {
    gen: number,
    username: string,
    session: SessionData
}): Promise<User> {
    const rootUser: User = await fetchUser(username, session);
    console.dir(rootUser);

    const isPrivate = (user: User, gen: number) => {
        console.dir({user, gen})

        return false;
    }

    let currentGeneration: User[] = [rootUser];
    for (let i = 0; i < gen; i++) {
        let nextGeneration: User[] = [];
        for (const parentUser of currentGeneration) {
            const follower = [...parentUser.follower];

            while(follower.length >= 0) {
                const batch = follower.slice(0, 10);
                (await Promise.all(batch.map(
                    async childUser => {
                        return {
                            ...childUser,
                            follower: isPrivate(parentUser, gen) ? [] : await getFollower({session, targetUserId: childUser.pk})
                        }
                    }
                ))).forEach(childUser => nextGeneration.push(childUser))
                await new Promise<void>(resolve => setTimeout(() => resolve(), 10 * 1000))
            }
        }
        currentGeneration = nextGeneration;
    }
    return rootUser;
}

async function getFollower({session, maxID, targetUserId}: {
    session: SessionData, targetUserId: number, maxID?: string
}): Promise<User[]> {
    const response = await fetch(`https://www.instagram.com/api/v1/friendships/${targetUserId}/followers/?max_id=${maxID != undefined ? maxID : ''}`, {
        headers: {
            "Sec-Fetch-Site": "same-origin",
            "X-IG-App-ID": "936619743392459",
            "Cookie": `sessionid=${session.id}; ds_user_id=${session.user.id}`,
        }
    })

    const followerList = (await response.json()) as {
        users: {
            id: string,
            full_name: string,
            username: string,
            profile_pic_url: string,
            is_private: boolean
        }[],
        next_max_id: string
    }
    console.dir(followerList.users[0].username);
    const users = followerList.users.map((user) => {
        return {
            pk: parseInt(user.id, 10),
            username: user.username,
            name: user.full_name,
            imageURL: new URL(user.profile_pic_url),
            private: user.is_private
        } as User
    });

    if (followerList.next_max_id != undefined) {
        const nextUsers = await getFollower({session, targetUserId, maxID: followerList.next_max_id});
        return users.concat(nextUsers);
    } else {
        return users;
    }
}



