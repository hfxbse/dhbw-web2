import example from "./example.js";

export const d3graph = Object.values(example).reduce((d3graph, user) => {
    d3graph.nodes.push(user)

    user.followerIds?.map(followerId => {
        return {source: user.id, target: followerId}
    })?.forEach(link => d3graph.links.push(link))

    return d3graph
}, {nodes: [], links: []})
