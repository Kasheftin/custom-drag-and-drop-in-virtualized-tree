<template>
  <div class="poc-app">
    <div class="poc-app__header">
      <h2>Drag & Drop POC</h2>
      <div class="poc-app__controls">
        <label>Root items: <input v-model.number="opts.itemCount" type="number" min="1" max="1000" /></label>
        <label>Children probability: <input v-model.number="opts.childrenProbability" type="number" min="0" max="1" step="0.05" /></label>
        <label>Max children: <input v-model.number="opts.childrenToGenerate" type="number" min="1" max="20" /></label>
        <label>Max depth: <input v-model.number="opts.maxDepth" type="number" min="1" max="10" /></label>
        <button @click="regenerate">Regenerate</button>
        <span class="poc-app__stats">{{ flatItems.length }} rows total</span>
      </div>
    </div>
    <div class="poc-app__table-container">
      <DragContainer :scroll-el="stickyTableRef?.containerEl" @drop="applyDrop">
        <template #default="{ startDrag }">
          <StickyTable
            ref="stickyTableRef"
            :columns="columns"
            :entries="flatItems"
            :row-height="rowHeight"
            :animate="animateRows"
            @row-dragstart="(event, el, entry) => startDrag(event, el, getDragEntries(entry))"
          >
            <template #header-cell="{ column }">
              {{ column.title }}
            </template>
            <template #body-cell="{ entry, column }">
              <template v-if="column.key === 'name'">
                <div class="poc-name-cell" :style="{ paddingLeft: entry.depth * 20 + 'px' }">
                  <button
                    v-if="entry.childrenCount > 0"
                    class="poc-toggle-btn"
                    :class="{ 'poc-toggle-btn--expanded': !collapsedIds.has(entry.id) }"
                    @click.stop="toggleCollapse(entry.id)"
                  >▶</button>
                  <span v-else class="poc-toggle-placeholder" />
                  <span class="poc-name-text">{{ entry.name }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'rank'">
                <span class="poc-rank-text">{{ entry.rank }}</span>
              </template>
            </template>
          </StickyTable>
        </template>
        <template #ghost="{ entries }">
          <table
            class="poc-table__table"
            :style="{ '--row-height': rowHeight + 'px' }"
          >
            <tbody>
              <tr
                v-for="entry in (entries.length > maxGhostRows ? entries.slice(0, maxGhostRows - 1) : entries)"
                :key="entry.id"
                class="poc-table__row"
              >
                <td class="poc-table__col">
                  <div class="poc-table__cell">
                    <div class="poc-name-cell" :style="{ paddingLeft: entry.depth * 20 + 'px' }">
                      <span
                        v-if="entry.childrenCount > 0"
                        class="poc-toggle-btn"
                        :class="{ 'poc-toggle-btn--expanded': !collapsedIds.has(entry.id) }"
                      >▶</span>
                      <span v-else class="poc-toggle-placeholder" />
                      <span class="poc-name-text">{{ entry.name }}</span>
                    </div>
                  </div>
                </td>
                <td class="poc-table__col" style="width: 200px; min-width: 200px">
                  <div class="poc-table__cell">
                    <span class="poc-rank-text">{{ entry.rank }}</span>
                  </div>
                </td>
              </tr>
              <tr v-if="entries.length > maxGhostRows" class="poc-table__row poc-table__row--more">
                <td class="poc-table__col" :colspan="2">
                  <div class="poc-table__cell poc-ghost-more">
                    and {{ entries.length - (maxGhostRows - 1) }} more...
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </DragContainer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, shallowRef } from 'vue'
import StickyTable from './components/StickyTable.vue'
import DragContainer from './components/DragContainer.vue'
import type { TableColumn } from './components/StickyTable.vue'
import type { DropTarget } from './composables/useDropHighlight'
import { generateMockData, type MockDataFabricOptions } from './mockData'
import type { FlatItem, Item, ItemRelation } from './types'
import { LexoRank } from './lexirank/LexoRank'

const lexoRank = new LexoRank()
const rowHeight = 36
const maxGhostRows = 5

const stickyTableRef = ref<{ containerEl: HTMLElement | null } | null>(null)

const columns: TableColumn[] = [
  { key: 'name', title: 'Name' },
  { key: 'rank', title: 'Rank', width: 200 }
]

const opts = reactive<MockDataFabricOptions>({
  itemCount: 100,
  childrenProbability: 0.2,
  childrenToGenerate: 10,
  maxDepth: 5
})

const items = shallowRef<Item[]>([])
const itemRelations = shallowRef<ItemRelation[]>([])
const collapsedIds = shallowRef<Set<string>>(new Set())
const animateRows = ref(false)
const ANIMATE_DURATION = 300

function toggleCollapse(id: string) {
  animateRows.value = true
  const next = new Set(collapsedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedIds.value = next
  setTimeout(() => { animateRows.value = false }, ANIMATE_DURATION)
}

function regenerate() {
  const result = generateMockData({ ...opts })
  items.value = result.items
  itemRelations.value = result.itemRelations
  collapsedIds.value = new Set()
}

regenerate()

const childrenMap = computed<Record<string, string[]>>(() => {
  const map: Record<string, string[]> = {}
  for (const rel of itemRelations.value) {
    if (!map[rel.fromId]) map[rel.fromId] = []
    map[rel.fromId].push(rel.toId)
  }
  return map
})

const parentMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const rel of itemRelations.value) {
    map[rel.toId] = rel.fromId
  }
  return map
})

const itemById = computed(() => new Map<string, Item>(items.value.map(i => [i.id, i] as [string, Item])))

const flatItems = computed<FlatItem[]>(() => {
  const childrenByParentId = new Map<string, string[]>()
  const childIds = new Set<string>()

  for (const rel of itemRelations.value) {
    if (!childrenByParentId.has(rel.fromId)) {
      childrenByParentId.set(rel.fromId, [])
    }
    childrenByParentId.get(rel.fromId)!.push(rel.toId)
    childIds.add(rel.toId)
  }

  const rootItems = items.value.filter((i: Item) => !childIds.has(i.id))
  const sortedRoots = [...rootItems].sort((a, b) => lexoRank.compareRanks(a.rank, b.rank))
  const collapsed = collapsedIds.value

  const result: FlatItem[] = []

  function flatten(id: string, depth: number) {
    const item = itemById.value.get(id)
    if (!item) return
    const children = childrenByParentId.get(id) ?? []
    const childItems = children.map(cid => itemById.value.get(cid)).filter((c): c is Item => c != null)
    result.push({ ...item, depth, childrenCount: childItems.length })
    if (!collapsed.has(id)) {
      const sorted = [...childItems].sort((a, b) => lexoRank.compareRanks(a.rank, b.rank))
      for (const child of sorted) {
        flatten(child.id, depth + 1)
      }
    }
  }

  for (const root of sortedRoots) {
    flatten(root.id, 0)
  }
  return result
})

function getDragEntries(entry: FlatItem): FlatItem[] {
  const flat = flatItems.value
  const idx = flat.findIndex(i => i.id === entry.id)
  if (idx === -1) return [entry]
  const result: FlatItem[] = [entry]
  for (let i = idx + 1; i < flat.length; i++) {
    if (flat[i].depth <= entry.depth) break
    result.push(flat[i])
  }
  return result
}

function computeRank(prevSibling: FlatItem | null, nextSibling: FlatItem | null): string {
  if (!prevSibling && !nextSibling) return lexoRank.MID_CHAR
  if (!prevSibling) return lexoRank.getNextRank(nextSibling!.rank)
  if (!nextSibling) return lexoRank.getPrevRank(prevSibling.rank)
  return lexoRank.getMidRank(prevSibling.rank, nextSibling.rank)
}

function applyRelationAndRank(draggedId: string, parentId: string | null, newRank: string) {
  items.value = items.value.map(i => i.id === draggedId ? { ...i, rank: newRank } : i)
  const oldParentId = parentMap.value[draggedId] ?? null
  if (oldParentId !== parentId) {
    const newRelations = itemRelations.value.filter(r => r.toId !== draggedId)
    if (parentId) newRelations.push({ id: crypto.randomUUID(), fromId: parentId, toId: draggedId })
    itemRelations.value = newRelations
  }
}

function applyDropInto(draggedId: string, targetId: string) {
  const childIds = childrenMap.value[targetId] ?? []
  const children = childIds.map(id => itemById.value.get(id)).filter((i): i is Item => i != null)
  const firstByRank = children.sort((a, b) => lexoRank.compareRanks(a.rank, b.rank))[0] ?? null
  const newRank = firstByRank ? lexoRank.getNextRank(firstByRank.rank) : lexoRank.MID_CHAR
  applyRelationAndRank(draggedId, targetId, newRank)
}

function applyDrop(entries: FlatItem[], target: DropTarget) {
  const draggedId = entries[0].id
  const draggedItemIds = new Set(entries.map(e => e.id))

  if (target.position === 'into') {
    applyDropInto(draggedId, target.id)
    return
  }

  // Flat list excluding all dragged items
  const flat = flatItems.value.filter(i => !draggedItemIds.has(i.id))
  const targetIdx = flat.findIndex(i => i.id === target.id)
  if (targetIdx === -1) return

  const D = target.depth

  // Determine insertion index
  let insertIdx: number
  if (target.position === 'before') {
    insertIdx = targetIdx
  } else {
    // 'after': skip forward past all items deeper than D
    insertIdx = targetIdx + 1
    while (insertIdx < flat.length && flat[insertIdx].depth > D) insertIdx++
  }

  // Find parent: nearest item with depth D-1 before insertIdx
  let parentId: string | null = null
  if (D > 0) {
    for (let i = insertIdx - 1; i >= 0; i--) {
      if (flat[i].depth === D - 1) { parentId = flat[i].id; break }
      if (flat[i].depth < D - 1) break
    }
  }

  // Find prev sibling: nearest item with depth D before insertIdx
  let prevSibling: FlatItem | null = null
  for (let i = insertIdx - 1; i >= 0; i--) {
    if (flat[i].depth === D) { prevSibling = flat[i]; break }
    if (flat[i].depth < D) break
  }

  // Find next sibling: nearest item with depth D at or after insertIdx
  let nextSibling: FlatItem | null = null
  for (let i = insertIdx; i < flat.length; i++) {
    if (flat[i].depth === D) { nextSibling = flat[i]; break }
    if (flat[i].depth < D) break
  }

  applyRelationAndRank(draggedId, parentId, computeRank(prevSibling, nextSibling))
}
</script>
