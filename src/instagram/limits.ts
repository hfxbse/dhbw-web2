export interface RandomDelayLimit {
    upper: number,
    lower: number
}

export interface RateLimits {
    batchSize: number,
    batchCount: number,
    delay: {
        daily: RandomDelayLimit,
        batches: RandomDelayLimit,
        pages: RandomDelayLimit
    }
}
