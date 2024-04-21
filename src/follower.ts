export interface User {
    pk: string,
    name: string,
    username: string,
    imageURL: URL | null,
    follower?: User[],
    private: boolean
}


export async function fetchUser(username: string, sessionID: string): Promise<User> {
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
                id: string,
                full_name: string,
                username: string,
                profile_pic_url: string,
                is_private: boolean
            }
        }
    }).data.user

    console.dir({user});
    const fetchedFollower: User[] = await getFollower({pk: user.id, sessionID});
    return {
        pk: user.id,
        name: user.full_name,
        username: user.username,
        follower: fetchedFollower,
        imageURL: user.profile_pic_url ? new URL(user.profile_pic_url) : null,
        private: user.is_private,
    };
}

async function getFollower({pk, sessionID, maxID}: {
    pk: string, sessionID: string, maxID?: string
}): Promise<User[]> {
    const response = await fetch(`https://www.instagram.com/api/v1/friendships/${pk}/followers/?max_id=${maxID != undefined ? maxID : ''}`, {
        headers: {
            "Sec-Fetch-Site": "same-origin",
            "X-IG-App-ID": "936619743392459",
            "Cookie": `sessionid=${sessionID}; ds_user_id=${pk}`,
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
    const users = followerList.users.map((user) => {
        return {
            pk: user.id,
            username: user.username,
            name: user.full_name,
            imageURL: new URL(user.profile_pic_url),
            private: user.is_private
        } as User
    });

    if (followerList.next_max_id != undefined) {
        const nextUsers = await getFollower({ pk, sessionID, maxID : followerList.next_max_id});
        return users.concat(nextUsers);
    } else {
        return users;
    }
}



