export type Item = {
  id: string
  name: string
  rank: string
}

export const ROOT_DOMAIN_ID = '__root__'

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
