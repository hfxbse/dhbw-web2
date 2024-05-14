export interface RandomDelayLimit {
    upper: number,
    lower: number
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
            daily: RandomDelayLimit,
            batches: RandomDelayLimit,
            pages: RandomDelayLimit
        }
    }
}
