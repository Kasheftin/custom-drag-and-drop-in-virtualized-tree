import {
  bucketIdOfRank,
  compareRankedItems,
  compareRankStrings,
  generateBalancedRankStrings,
  generateRanksBetween,
  isDenseRank,
  maximumRank,
  migrationDirection,
  minimumRank,
  nextBucket,
  parseRank,
} from './lexorank'
import type {
  BucketId,
  FullRerankPlan,
  PartialRerankPlan,
  RankedItem,
} from './types'

// A local repair must stay local. Once the dense region grows past this many rows, redistributing
// it is no longer a bounded operation and should escalate to a full rerank of the whole domain.
export const PARTIAL_RERANK_MAX_WINDOW = 256

// Thrown when the dense window exceeds PARTIAL_RERANK_MAX_WINDOW so callers can escalate to a full
// rerank instead of silently rewriting an unbounded slice.
export class PartialRerankTooLargeError extends Error {
  readonly windowSize: number

  constructor(windowSize: number) {
    super(
      `Dense region spans ${windowSize} rows (> ${PARTIAL_RERANK_MAX_WINDOW}); run a full rerank on this domain instead`,
    )
    this.name = 'PartialRerankTooLargeError'
    this.windowSize = windowSize
  }
}

export function planPartialRerank(
  siblings: RankedItem[],
  targetId: string,
  stableBucket: BucketId,
): PartialRerankPlan {
  if (siblings.length === 0) throw new Error('Cannot rerank an empty ordering domain')

  const ordered = [...siblings].sort(compareRankedItems)
  const targetIndex = ordered.findIndex(item => item.id === targetId)
  if (targetIndex < 0) throw new Error('Selected item is not part of this ordering domain')

  let startIndex = targetIndex
  let endIndex = targetIndex
  const targetRank = ordered[targetIndex].rank

  // 1. Absorb any exact-duplicate run sharing the target's rank (a manually created collision).
  while (startIndex > 0 && compareRankStrings(ordered[startIndex - 1].rank, targetRank) === 0) startIndex--
  while (
    endIndex + 1 < ordered.length
    && compareRankStrings(ordered[endIndex + 1].rank, targetRank) === 0
  ) endIndex++

  // 2. Walk the dense run: keep expanding while neighbouring rows have overlong bodies (the
  //    operational signal of a hot interval). This is what lets a repair rewrite an entire dense
  //    region rather than only the target's two neighbours.
  while (startIndex > 0 && isDenseRank(ordered[startIndex - 1].rank)) startIndex--
  while (endIndex + 1 < ordered.length && isDenseRank(ordered[endIndex + 1].rank)) endIndex++

  // 3. Pull in one healthy neighbour on each side so the fixed external anchors sit just outside the
  //    rewrite window. This also preserves the minimal 3-row repair for a healthy local edit.
  if (startIndex > 0) startIndex--
  if (endIndex + 1 < ordered.length) endIndex++

  // 4. A manually changed bucket can place corrupt rows next to a healthy window.
  //    Pull those rows into the repair until both fixed external anchors are in the stable bucket.
  while (startIndex > 0 && bucketIdOfRank(ordered[startIndex - 1].rank) !== stableBucket) startIndex--
  while (
    endIndex + 1 < ordered.length
    && bucketIdOfRank(ordered[endIndex + 1].rank) !== stableBucket
  ) endIndex++

  const windowSize = endIndex - startIndex + 1
  if (windowSize > PARTIAL_RERANK_MAX_WINDOW) throw new PartialRerankTooLargeError(windowSize)

  const leftAnchor = startIndex > 0 ? parseRank(ordered[startIndex - 1].rank) : minimumRank(stableBucket)
  const rightAnchor = endIndex + 1 < ordered.length
    ? parseRank(ordered[endIndex + 1].rank)
    : maximumRank(stableBucket)

  if (bucketIdOfRank(leftAnchor) !== stableBucket || bucketIdOfRank(rightAnchor) !== stableBucket) {
    throw new Error('Partial rerank could not find same-bucket external boundaries')
  }

  const affected = ordered.slice(startIndex, endIndex + 1)
  const targetRanks = generateRanksBetween(leftAnchor, rightAnchor, affected.length)
  const updates = affected.map((item, index) => ({ id: item.id, rank: targetRanks[index].toString() }))

  return {
    domainSize: ordered.length,
    startIndex,
    endIndex,
    firstAffectedId: affected[0].id,
    lastAffectedId: affected[affected.length - 1].id,
    updates,
  }
}

export function planFullRerank(
  siblings: RankedItem[],
  sourceBucket: BucketId,
): FullRerankPlan {
  const destinationBucket = nextBucket(sourceBucket)
  const direction = migrationDirection(sourceBucket, destinationBucket)
  const ordered = [...siblings].sort(compareRankedItems)
  const targets = generateBalancedRankStrings(ordered.length, destinationBucket)
  const updates = ordered.map((item, index) => ({ id: item.id, rank: targets[index] }))

  return {
    sourceBucket,
    destinationBucket,
    direction,
    updates,
    migrationUpdates: direction === 'tail-to-head' ? [...updates].reverse() : updates,
  }
}

export function validateDomainRanks(items: RankedItem[], expectedBucket: BucketId): void {
  const ordered = [...items].sort(compareRankedItems)
  const ids = new Set<string>()
  let previousRank: string | null = null

  for (const item of ordered) {
    if (ids.has(item.id)) throw new Error(`Duplicate item id in ordering domain: ${item.id}`)
    ids.add(item.id)
    if (bucketIdOfRank(item.rank) !== expectedBucket) {
      throw new Error(`Item ${item.id} is not in bucket ${expectedBucket}`)
    }
    if (previousRank && compareRankStrings(previousRank, item.rank) >= 0) {
      throw new Error('Ordering domain contains duplicate or descending ranks')
    }
    previousRank = item.rank
  }
}
