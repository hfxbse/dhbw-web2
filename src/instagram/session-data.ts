export default interface SessionData extends Record<string, any> {
    user: {
        id: number,
        username?: string
    },
    id: string
}

export function sessionToCookie(session?: SessionData | undefined) {
    return session ? `sessionid=${session.id}; ds_user_id=${session.user.id}` : ''
}
