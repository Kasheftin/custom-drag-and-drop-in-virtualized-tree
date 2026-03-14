import { v4 as uuidv4 } from 'uuid'
import { LexoRank } from './lexirank/LexoRank'
import type { Item, ItemRelation } from './types'

export type MockDataFabricOptions = {
  itemCount: number
  childrenProbability: number  // 0..1
  childrenToGenerate: number   // max children per node
  maxDepth: number
}

const lexoRank = new LexoRank()

let nameCounter = 0
function nextName(): string {
  nameCounter++
  return `Item ${nameCounter}`
}

function generateRanks(count: number): string[] {
  if (count === 0) return []
  const ranks: string[] = []
  // Start from MID_CHAR and go backwards to have ascending ranks
  let current = lexoRank.MID_CHAR
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      ranks.push(current)
    } else {
      current = lexoRank.getPrevRank(current)
      ranks.unshift(current)
    }
  }
  return ranks
}

function generateChildren(
  parentId: string,
  items: Item[],
  relations: ItemRelation[],
  opts: MockDataFabricOptions,
  depth: number
): void {
  if (depth >= opts.maxDepth) return

  const childCount = Math.floor(Math.random() * opts.childrenToGenerate) + 1
  const childRanks = generateRanks(childCount)

  for (let i = 0; i < childCount; i++) {
    const childId = uuidv4()
    items.push({ id: childId, name: nextName(), rank: childRanks[i] })
    relations.push({ id: uuidv4(), fromId: parentId, toId: childId })

    if (Math.random() < opts.childrenProbability) {
      generateChildren(childId, items, relations, opts, depth + 1)
    }
  }
}

export function generateMockData(opts: MockDataFabricOptions): { items: Item[], itemRelations: ItemRelation[] } {
  nameCounter = 0
  const items: Item[] = []
  const itemRelations: ItemRelation[] = []

  const rootRanks = generateRanks(opts.itemCount)

  for (let i = 0; i < opts.itemCount; i++) {
    const id = uuidv4()
    items.push({ id, name: nextName(), rank: rootRanks[i] })

    if (Math.random() < opts.childrenProbability) {
      generateChildren(id, items, itemRelations, opts, 1)
    }
  }

  return { items, itemRelations }
}
