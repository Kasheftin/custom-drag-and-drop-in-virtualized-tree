import {
  bucketIdOfRank,
  compareRankedItems,
  compareRankStrings,
  generateBalancedRankStrings,
  generateRanksBetween,
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

  while (startIndex > 0 && compareRankStrings(ordered[startIndex - 1].rank, targetRank) === 0) startIndex--
  while (
    endIndex + 1 < ordered.length
    && compareRankStrings(ordered[endIndex + 1].rank, targetRank) === 0
  ) endIndex++

  if (startIndex > 0) startIndex--
  if (endIndex + 1 < ordered.length) endIndex++

  // A manually changed bucket can place corrupt rows next to a healthy window.
  // Pull those rows into the repair until both fixed external anchors are in the stable bucket.
  while (startIndex > 0 && bucketIdOfRank(ordered[startIndex - 1].rank) !== stableBucket) startIndex--
  while (
    endIndex + 1 < ordered.length
    && bucketIdOfRank(ordered[endIndex + 1].rank) !== stableBucket
  ) endIndex++

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
