import { describe, expect, it } from 'vitest'
import {
  DENSITY_THRESHOLD,
  bucketIdOfRank,
  compareRankStrings,
  generateBalancedRankStrings,
  generateRanksBetween,
  isDenseRank,
  migrationDirection,
  nextBucket,
  normalizeRank,
  parseRank,
  rankBodyLength,
  rankForInsertion,
} from './lexorank'
import {
  PARTIAL_RERANK_MAX_WINDOW,
  PartialRerankTooLargeError,
  planFullRerank,
  planPartialRerank,
  validateDomainRanks,
} from './rerank'
import type { RankedItem } from './types'

function rankedItems(count: number, bucket: 0 | 1 | 2 = 0): RankedItem[] {
  return generateBalancedRankStrings(count, bucket).map((rank, index) => ({
    id: String.fromCharCode(97 + index),
    rank,
  }))
}

// Build a contiguous run of `count` dense (long-bodied) ranks strictly between two anchors, the way
// repeated insertion into one hot interval would. `between` stays inside the short integer body until
// its room is exhausted, so we descend toward the upper anchor until `lo` itself is dense — by then it
// is decimal-adjacent to the anchor, so every rank generated in the remaining interval is dense too.
function denseRunBetween(leftRank: string, rightRank: string, count: number): string[] {
  const hi = parseRank(rightRank)
  let lo = parseRank(leftRank)
  let guard = 0
  while (!isDenseRank(lo) && guard++ < 3000) lo = lo.between(hi)
  return generateRanksBetween(lo, hi, count).map(rank => rank.toString())
}

describe('LexoRank adapter', () => {
  it('normalizes, compares, and reads complete bucket-prefixed ranks', () => {
    const ranks = generateBalancedRankStrings(3, 1)
    expect(normalizeRank(`  ${ranks[0]}  `)).toBe(ranks[0])
    expect(bucketIdOfRank(ranks[0])).toBe(1)
    expect(compareRankStrings(ranks[0], ranks[1])).toBeLessThan(0)
  })

  it('generates unique ascending ranks before, between, and after neighbors', () => {
    const [left, right] = generateBalancedRankStrings(2, 0)
    const before = rankForInsertion(null, left, 0)
    const middle = rankForInsertion(left, right, 0)
    const after = rankForInsertion(right, null, 0)

    expect(compareRankStrings(before, left)).toBeLessThan(0)
    expect(compareRankStrings(left, middle)).toBeLessThan(0)
    expect(compareRankStrings(middle, right)).toBeLessThan(0)
    expect(compareRankStrings(right, after)).toBeLessThan(0)
  })

  it('cycles buckets and selects the contiguity-preserving direction', () => {
    expect([nextBucket(0), nextBucket(1), nextBucket(2)]).toEqual([1, 2, 0])
    expect(migrationDirection(0, 1)).toBe('tail-to-head')
    expect(migrationDirection(1, 2)).toBe('tail-to-head')
    expect(migrationDirection(2, 0)).toBe('head-to-tail')
  })
})

describe('partial rerank planning', () => {
  it('finds a duplicate run plus its inclusive boundary rows', () => {
    const items = rankedItems(5)
    items[2] = { ...items[2], rank: items[1].rank }

    const plan = planPartialRerank(items, items[2].id, 0)
    expect(plan.updates.map(update => update.id)).toEqual(['a', 'b', 'c', 'd'])

    const updated = items.map(item => {
      const replacement = plan.updates.find(update => update.id === item.id)
      return replacement ?? item
    })
    validateDomainRanks(updated, 0)
  })

  it('keeps unrelated rows outside a healthy local window unchanged', () => {
    const items = rankedItems(7)
    const plan = planPartialRerank(items, 'd', 0)
    expect(plan.updates.map(update => update.id)).toEqual(['c', 'd', 'e'])
    expect(plan.updates.some(update => update.id === 'a')).toBe(false)
    expect(plan.updates.some(update => update.id === 'g')).toBe(false)
  })

  it('walks an entire dense run plus its healthy boundary rows', () => {
    const base = rankedItems(5) // a..e, healthy 6-char bodies
    const run = denseRunBetween(base[1].rank, base[2].rank, 6).map((rank, index) => ({
      id: `dense-${index}`,
      rank,
    }))
    expect(run.every(item => isDenseRank(item.rank))).toBe(true)

    const items = [...base, ...run]
    const plan = planPartialRerank(items, 'dense-3', 0) // target a row inside the dense run

    const affectedIds = plan.updates.map(update => update.id)
    // the whole dense run and both boundary rows (b, c) are rewritten; a/d/e are not
    for (const item of run) expect(affectedIds).toContain(item.id)
    expect(affectedIds).toContain('b')
    expect(affectedIds).toContain('c')
    expect(affectedIds).not.toContain('a')
    expect(affectedIds).not.toContain('d')
    expect(plan.updates.length).toBeGreaterThan(3)

    const updated = items.map(item => plan.updates.find(update => update.id === item.id) ?? item)
    validateDomainRanks(updated, 0)
    // repair restores headroom: rewritten ranks are far shorter than the dense originals
    const repairedMax = Math.max(...plan.updates.map(update => rankBodyLength(update.rank)))
    const denseMax = Math.max(...run.map(item => rankBodyLength(item.rank)))
    expect(repairedMax).toBeLessThan(denseMax)
  })

  it('escalates to a full rerank when the dense region exceeds the window cap', () => {
    const base = rankedItems(2) // a, b
    const run = denseRunBetween(base[0].rank, base[1].rank, PARTIAL_RERANK_MAX_WINDOW + 5)
      .map((rank, index) => ({ id: `dense-${index}`, rank }))
    const items = [...base, ...run]

    expect(() => planPartialRerank(items, 'dense-10', 0)).toThrow(PartialRerankTooLargeError)
  })
})

describe('density metric', () => {
  it('measures the base-36 body length ignoring the decimal separator', () => {
    expect(rankBodyLength('0|0i0000:')).toBe(6)
    expect(rankBodyLength('1|abcdef:xyz')).toBe(9)
  })

  it('flags ranks whose body exceeds the density threshold', () => {
    expect(isDenseRank('0|000000:')).toBe(false)
    expect(isDenseRank(`0|${'0'.repeat(DENSITY_THRESHOLD + 1)}:`)).toBe(true)
  })
})

describe('full rerank planning', () => {
  it('preserves item order and moves all ranks into the next bucket', () => {
    const items = rankedItems(12, 0)
    const plan = planFullRerank(items, 0)
    const updated = items.map(item => plan.updates.find(update => update.id === item.id)!)

    expect(plan.destinationBucket).toBe(1)
    expect(plan.direction).toBe('tail-to-head')
    expect(plan.migrationUpdates[0].id).toBe(items.at(-1)!.id)
    expect(updated.map(item => item.id)).toEqual(items.map(item => item.id))
    validateDomainRanks(updated, 1)
  })

  it('uses head-to-tail migration for the 2 → 0 transition', () => {
    const items = rankedItems(4, 2)
    const plan = planFullRerank(items, 2)

    expect(plan.destinationBucket).toBe(0)
    expect(plan.direction).toBe('head-to-tail')
    expect(plan.migrationUpdates.map(update => update.id)).toEqual(items.map(item => item.id))
  })
})
