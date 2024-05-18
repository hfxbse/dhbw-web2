export interface RandomDelayLimit {
    max: number,
    min: number
}

export interface Limits {
    depth: {
        generations: number,
        followers: number,
    }
    rate: {
        batch: {
            size: number,
            count: number,
        }
        parallelTasks: number
        delay: {
            images: RandomDelayLimit,
            daily: RandomDelayLimit,
            batches: RandomDelayLimit,
            pages: RandomDelayLimit
        }
    }
}
