import type { Item, LexoRankOptions, RankableItem } from './types'

const defaultOptions: LexoRankOptions = {
  charset: 'abcdefghijklmnopqrstuvwxyz',
  gap: 16
}

export class LexoRank {
  CHARSET: string
  CHARSET_MAP: Record<string, number>
  BASE: number
  FIRST_CHAR: string
  MID_CHAR: string
  LAST_CHAR: string
  GAP: number
  constructor(options: Partial<LexoRankOptions> = {}) {
    const opts = { ...defaultOptions, ...options }
    this.CHARSET = opts.charset
    this.CHARSET_MAP = Object.fromEntries([...this.CHARSET].map((ch, i) => [ch, i]))
    this.BASE = this.CHARSET.length
    this.FIRST_CHAR = this.CHARSET[0]
    this.MID_CHAR = this.CHARSET[Math.floor(this.BASE / 2)]
    this.LAST_CHAR = this.CHARSET[this.BASE - 1]
    this.GAP = opts.gap || 1
  }

  rankToDigits(rank: string): number[] {
    return rank.split('').map(ch => this.CHARSET_MAP[ch])
  }

  digitsToRank(digits: number[]): string {
    return digits.map(d => this.CHARSET[d]).join('')
  }

  numberToRank(num: number) {
    let rank = ''
    while (num) {
      rank = this.CHARSET[num % this.BASE] + rank
      num = Math.floor(num / this.BASE)
    }
    return rank
  }

  // compareRanks(smallerRank, biggerRank) = 1
  compareRanks(smallerRank: string, biggerRank: string): -1 | 0 | 1 {
    if (smallerRank === biggerRank) {
      return 0
    }
    const maxLength = Math.max(smallerRank.length, biggerRank.length)
    for (let i = 0; i < maxLength; i++) {
      if (i >= smallerRank.length && i >= biggerRank.length) {
        return 0
      }
      if (i >= smallerRank.length) {
        return 1
      }
      if (i >= biggerRank.length) {
        return -1
      }
      const diff = this.CHARSET_MAP[biggerRank[i]] - this.CHARSET_MAP[smallerRank[i]]
      if (diff !== 0) return diff > 0 ? 1 : -1
    }
    return 0
  }

  getStartAt(rank: string, addon = 0, index = 0, multiplier = Math.log2(1.6)): number {
    if (index >= rank.length) {
      return addon
    }
    const distanceToStart = this.CHARSET_MAP[rank[index]]
    const distanceToEnd = this.BASE - this.CHARSET_MAP[rank[index]] - 1
    if (distanceToStart < distanceToEnd) {
      if (distanceToStart) {
        return Math.floor(Math.log2((this.BASE / distanceToStart)) / multiplier) + addon
      } else {
        return this.getStartAt(rank, Math.floor(Math.log2(this.BASE) / multiplier) + addon + 1, index + 1, multiplier)
      }
    } else {
      if (distanceToEnd) {
        return Math.floor(Math.log2((this.BASE / distanceToEnd)) / multiplier) + addon
      } else {
        return this.getStartAt(rank, Math.floor(Math.log2(this.BASE) / multiplier) + addon + 1, index + 1, multiplier)
      }
    }
  }

  getRankWithGap(rank: string, gap: number): string {
    if (!gap) {
      return rank
    }
    const rankDigits = this.rankToDigits(rank)
    if (gap < 0 && rankDigits.every(d => d === 0)) {
      throw new Error(`Cannot decrese rank ${rank} with gap ${gap}`)
    }
    let carry = gap
    for (let i = rankDigits.length - 1; (i >= 0) && (carry !== 0); i--) {
      let step = rankDigits[i] + carry
      carry = 0
      while (step < 0) {
        step += this.BASE
        carry--
      }
      while (step >= this.BASE) {
        step -= this.BASE
        carry++
      }
      rankDigits[i] = step
    }
    if (carry !== 0) {
      return this.getRankWithGap(rank + this.FIRST_CHAR, gap)
    }
    return this.digitsToRank(rankDigits)
  }

  getNextRank(rank: string, appendChar = this.FIRST_CHAR): string {
    const startAt = this.getStartAt(rank)
    if (startAt + 1 > rank.length) {
      rank += appendChar.repeat(startAt + 1 - rank.length)
    }
    const nextRank = this.getRankWithGap(rank, this.GAP)
    if (nextRank.endsWith(this.CHARSET[0])) {
      return nextRank.slice(0, -1) + this.CHARSET[1]
    }
    return nextRank
  }

  getPrevRank(rank: string, appendChar = this.LAST_CHAR): string {
    const rankDigits = this.rankToDigits(rank)
    if (!rank || rankDigits.every(d => d === 0)) {
      throw new Error(`Cannot get prev (smaller) rank for ${rank}`)
    }
    let newRank = this.getRankWithGap(rank, -this.GAP)
    if (newRank.endsWith(this.CHARSET[0])) {
      newRank = this.getRankWithGap(newRank, -1)
    }
    const startAt = this.getStartAt(newRank)
    if (startAt + 1 > newRank.length) {
      newRank += appendChar.repeat(startAt + 1 - newRank.length)
    }
    return newRank
  }

  getMidRank(smallerRank: string, biggerRank: string): string {
    if (smallerRank === biggerRank) {
      throw new Error(`Cannot get mid rank for equal ranks: ${smallerRank}`)
    }
    if (this.compareRanks(smallerRank, biggerRank) < 0) {
      [smallerRank, biggerRank] = [biggerRank, smallerRank]
    }

    // Strip common prefix to keep BigInt values small
    let p = 0
    while (p < smallerRank.length && p < biggerRank.length && smallerRank[p] === biggerRank[p]) p++
    const prefix = smallerRank.slice(0, p)
    const suf1 = smallerRank.slice(p)
    const suf2 = biggerRank.slice(p)

    const base = BigInt(this.BASE)

    const toNum = (s: string, len: number): bigint => {
      let n = 0n
      for (let i = 0; i < len; i++) {
        n = n * base + BigInt(i < s.length ? this.CHARSET_MAP[s[i]] : 0)
      }
      return n
    }

    const fromNum = (n: bigint, len: number): string => {
      const digits: number[] = []
      for (let i = 0; i < len; i++) {
        digits.unshift(Number(n % base))
        n /= base
      }
      // Strip trailing FIRST_CHAR (= 0, trailing zeros) to normalize
      let s = digits.map(d => this.CHARSET[d]).join('')
      let end = s.length
      while (end > 1 && s[end - 1] === this.FIRST_CHAR) end--
      return s.slice(0, end)
    }

    // Start at the minimum length to keep ranks as short as possible.
    // If the two values are consecutive at this length (mid rounds down to a), grow by one digit.
    let len = Math.max(suf1.length, suf2.length, 1)
    let mid: bigint
    while (true) {
      const a = toNum(suf1, len)
      const b = toNum(suf2, len)
      mid = (a + b) / 2n
      if (mid > a) break
      len++
    }

    return prefix + fromNum(mid, len)
  }

  getRank(items: RankableItem[], _item: Item, index: number): string {
    const itemBefore = items[index - 1] || null
    const itemAfter = items[index] || null
    if (!itemBefore && !itemAfter) {
      return this.MID_CHAR
    } else if (!itemBefore) {
      return this.getNextRank(itemAfter!.rank)
    } else if (!itemAfter) {
      return this.getPrevRank(itemBefore.rank)
    } else {
      return this.getMidRank(itemBefore.rank, itemAfter.rank)
    }
  }

  // Generate a sequence of N initial ranks spread evenly
  generateInitialRanks(count: number): string[] {
    if (count === 0) return []
    const ranks: string[] = []
    let current = this.MID_CHAR
    ranks.push(current)
    for (let i = 1; i < count; i++) {
      current = this.getPrevRank(current)
      ranks.unshift(current)
    }
    return ranks
  }
}
