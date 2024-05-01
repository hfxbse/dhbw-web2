import SessionData, {sessionToCookie} from "./session-data";

export interface User {
    id: number,
    profile: {
        name: string,
        username: string,
        image: Promise<Blob> | null,
    }
    followerIds?: number[],
    private?: boolean,
    public: boolean,
    personal?: boolean
}

export type UserGraph = Record<number, User>;

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
                id: string,
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
        id: parseInt(user.id, 10),
        profile: {
            name: user.full_name,
            username: user.username,
            image: downloadProfilePicture(user.profile_pic_url)
        },
        personal: !user.is_business_account && !user.is_professional_account,
        public: !user.is_private
    };

    if (session) mapped["private"] = mapped.id !== session.user.id && !user.followed_by_viewer && user.is_private;

    return mapped;
}

export async function downloadProfilePicture(source: string | undefined): Promise<Blob> | null {
    if (!source) return null

    const response = await fetch(source, {
        headers: {
            "Sec-Fetch-Site": "same-origin",
        }
    })

    if (!response.ok) {
        throw Error(await response.text())
    }

    return await response.blob()
}
