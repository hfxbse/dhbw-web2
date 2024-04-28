export interface User {
    id: number,
    profile: {
        name: string,
        username: string,
        imageURL: URL | null,
    }
    followerIds?: number[],
    private?: boolean,
    public: boolean,
    personal?: boolean
}

export type UserGraph = Record<number, User>;
