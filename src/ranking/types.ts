export type BucketId = 0 | 1 | 2

export type RerankDirection = 'head-to-tail' | 'tail-to-head'

export type FullRerankOperation = {
  type: 'full-rerank'
  sourceBucket: BucketId
  destinationBucket: BucketId
  direction: RerankDirection
  processed: number
  total: number
}

export type OrderingState = {
  domainId: string
  stableBucket: BucketId
  operation: FullRerankOperation | null
  version: number
}

export type RankedItem = {
  id: string
  rank: string
}

export type RankUpdate = {
  id: string
  rank: string
}

export type PartialRerankPlan = {
  domainSize: number
  startIndex: number
  endIndex: number
  firstAffectedId: string
  lastAffectedId: string
  updates: RankUpdate[]
}

export type FullRerankPlan = {
  sourceBucket: BucketId
  destinationBucket: BucketId
  direction: RerankDirection
  updates: RankUpdate[]
  migrationUpdates: RankUpdate[]
}
