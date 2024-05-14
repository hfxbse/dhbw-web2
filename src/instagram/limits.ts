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
        batchSize: number,
        batchCount: number,
        delay: {
            daily: RandomDelayLimit,
            batches: RandomDelayLimit,
            pages: RandomDelayLimit
        }
    }
}
