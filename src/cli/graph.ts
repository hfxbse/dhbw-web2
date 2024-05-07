import {UnsettledUserGraph, User, UserGraph} from "../instagram/user";

export async function blobToDataUrl(blob: Blob) {
    const buffer = Buffer.from(await blob.arrayBuffer());
    return new URL("data:" + blob.type + ';base64,' + buffer.toString('base64'));
}

export async function settleGraph(graph: UnsettledUserGraph) {
    delete graph["canceled"]

    const downloads: Promise<User>[] = Object.values(graph).map(async user => {
        return {
            ...user,
            profile: {
                ...user.profile,
                image: await user.profile.image
                    .then((image: Blob | null) => {
                        if (!image) {
                            console.error(`Failed to download profile picture. (${user.profile.username})`)
                            return null;
                        }

                        return blobToDataUrl(image)
                    })
            }
        }
    })

    const settled: UserGraph = (await Promise.all(downloads)).reduce((graph, user) => {
        graph[user.id] = user
        return graph
    }, {})

    return settled
}
