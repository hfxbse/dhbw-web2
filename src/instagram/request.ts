export function hasJsonBody(response: Response): boolean {
    return response.headers.get("Content-Type").startsWith("application/json;")
}
