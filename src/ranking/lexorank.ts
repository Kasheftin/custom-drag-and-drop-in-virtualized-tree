import { LexoRank } from 'lexorank'
import type { BucketId, RankedItem, RerankDirection } from './types'

const RANK_PATTERN = /^[012]\|[0-9a-z]+(?::[0-9a-z]*)?$/

export function minimumRank(bucket: BucketId): LexoRank {
  let rank = LexoRank.min()
  for (let index = 0; index < bucket; index++) rank = rank.inNextBucket()
  return rank
}

export function maximumRank(bucket: BucketId): LexoRank {
  return LexoRank.max(minimumRank(bucket).getBucket())
}

export function parseRank(value: string): LexoRank {
  const trimmed = value.trim()
  if (!RANK_PATTERN.test(trimmed)) {
    throw new Error('Expected bucket|rank, for example 0|0i0000:')
  }

  const parsed = LexoRank.parse(trimmed)
  const bucket = bucketIdOfRank(parsed)
  if (
    parsed.getDecimal().compareTo(minimumRank(bucket).getDecimal()) < 0
    || parsed.getDecimal().compareTo(maximumRank(bucket).getDecimal()) > 0
  ) {
    throw new Error('Rank body is outside the supported LexoRank range')
  }

  return parsed
}

export function normalizeRank(value: string): string {
  return parseRank(value).toString()
}

export function bucketIdOfRank(rank: LexoRank | string): BucketId {
  const value = typeof rank === 'string' ? rank.trim() : rank.toString()
  const bucket = Number(value.split('|', 1)[0])
  if (bucket !== 0 && bucket !== 1 && bucket !== 2) {
    throw new Error(`Unsupported LexoRank bucket: ${value}`)
  }
  return bucket
}

export function rankInBucket(rank: LexoRank, bucket: BucketId): LexoRank {
  return LexoRank.from(minimumRank(bucket).getBucket(), rank.getDecimal())
}

export function compareRankStrings(left: string, right: string): number {
  return parseRank(left).compareTo(parseRank(right))
}

export function compareRankedItems(left: RankedItem, right: RankedItem): number {
  return compareRankStrings(left.rank, right.rank) || left.id.localeCompare(right.id)
}

export function generateRanksBetween(left: LexoRank, right: LexoRank, count: number): LexoRank[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Rank count must be a non-negative integer')
  if (count === 0) return []
  if (bucketIdOfRank(left) !== bucketIdOfRank(right)) {
    throw new Error('Balanced ranks require anchors from the same bucket')
  }
  if (left.compareTo(right) >= 0) throw new Error('Left rank must be smaller than right rank')

  const result = new Array<LexoRank>(count)

  function fill(start: number, end: number, lower: LexoRank, upper: LexoRank) {
    if (start >= end) return
    const middleIndex = Math.floor((start + end) / 2)
    const middleRank = lower.between(upper)
    result[middleIndex] = middleRank
    fill(start, middleIndex, lower, middleRank)
    fill(middleIndex + 1, end, middleRank, upper)
  }

  fill(0, count, left, right)
  return result
}

export function generateBalancedRankStrings(count: number, bucket: BucketId): string[] {
  return generateRanksBetween(minimumRank(bucket), maximumRank(bucket), count).map(rank => rank.toString())
}

export function rankForInsertion(
  previousRank: string | null,
  nextRank: string | null,
  stableBucket: BucketId,
): string {
  const previous = previousRank ? parseRank(previousRank) : null
  const next = nextRank ? parseRank(nextRank) : null

  if (previous && bucketIdOfRank(previous) !== stableBucket) {
    throw new Error('Previous neighbor is outside the domain stable bucket')
  }
  if (next && bucketIdOfRank(next) !== stableBucket) {
    throw new Error('Next neighbor is outside the domain stable bucket')
  }

  if (!previous && !next) {
    return minimumRank(stableBucket).between(maximumRank(stableBucket)).toString()
  }
  if (!previous) return next!.genPrev().toString()
  if (!next) return previous.genNext().toString()
  return previous.between(next).toString()
}

export function nextBucket(bucket: BucketId): BucketId {
  return ((bucket + 1) % 3) as BucketId
}

export function migrationDirection(source: BucketId, destination: BucketId): RerankDirection {
  if (destination !== nextBucket(source)) throw new Error('Buckets must follow the 0 → 1 → 2 → 0 cycle')
  return source === 2 ? 'head-to-tail' : 'tail-to-head'
}
