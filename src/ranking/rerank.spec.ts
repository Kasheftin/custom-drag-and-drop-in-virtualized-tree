import { describe, expect, it } from 'vitest'
import {
  bucketIdOfRank,
  compareRankStrings,
  generateBalancedRankStrings,
  migrationDirection,
  nextBucket,
  normalizeRank,
  rankForInsertion,
} from './lexorank'
import { planFullRerank, planPartialRerank, validateDomainRanks } from './rerank'
import type { RankedItem } from './types'

function rankedItems(count: number, bucket: 0 | 1 | 2 = 0): RankedItem[] {
  return generateBalancedRankStrings(count, bucket).map((rank, index) => ({
    id: String.fromCharCode(97 + index),
    rank,
  }))
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
