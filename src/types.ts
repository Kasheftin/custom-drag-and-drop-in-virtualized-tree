export type Item = {
  id: string
  name: string
  rank: string
}

export type ItemRelation = {
  id: string
  fromId: string
  toId: string
}

// Flat display row used by the table
export type FlatItem = Item & {
  depth: number
  childrenCount: number
}
