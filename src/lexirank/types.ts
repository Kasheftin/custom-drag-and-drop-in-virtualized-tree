export type LexoRankOptions = {
  charset: string
  gap: number
}

export type Item = {
  id: string
}

export type RankableItem = Item & {
  rank: string
}
