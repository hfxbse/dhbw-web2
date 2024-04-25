export default interface SessionData extends Record<string, any> {
    user: {
        id: number,
        username?: string
    },
    id: string
}
