<template>
  <div class="poc-app">
    <div class="poc-app__header">
      <div class="poc-app__title-row">
        <div>
          <h2>Drag & Drop + LexoRank Laboratory</h2>
          <p>Root items and every parent's children are independent ordering domains.</p>
        </div>
        <div class="poc-app__root-state">
          <span>Root bucket</span>
          <strong :class="`poc-bucket--${rootStableBucket}`">{{ rootStableBucket }}</strong>
        </div>
      </div>

      <div class="poc-app__controls">
        <label>Root items: <input v-model.number="opts.itemCount" :disabled="fullProgress.active" type="number" min="1" max="100000" /></label>
        <label>Children probability: <input v-model.number="opts.childrenProbability" :disabled="fullProgress.active" type="number" min="0" max="1" step="0.05" /></label>
        <label>Max children: <input v-model.number="opts.childrenToGenerate" :disabled="fullProgress.active" type="number" min="1" max="20" /></label>
        <label>Max depth: <input v-model.number="opts.maxDepth" :disabled="fullProgress.active" type="number" min="1" max="10" /></label>
        <button :disabled="fullProgress.active" @click="regenerate">Regenerate</button>
        <button class="poc-primary-btn" :disabled="fullProgress.active || rootItems.length === 0" @click="triggerFullRerank">
          {{ fullProgress.active ? `Reranking ${fullProgress.processed}/${fullProgress.total}` : 'Full rerank (root)' }}
        </button>
        <span class="poc-app__stats">{{ flatItems.length }} visible / {{ items.length }} total</span>
      </div>

      <div v-if="fullProgress.active" class="poc-progress" aria-live="polite">
        <progress :max="fullProgress.total" :value="fullProgress.processed" />
        <span>{{ fullProgress.direction }} migration into bucket {{ fullProgress.destinationBucket }}</span>
      </div>

      <div v-if="notice" class="poc-notice" :class="`poc-notice--${notice.kind}`" role="status">
        {{ notice.message }}
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
                    :aria-label="`${collapsedIds.has(entry.id) ? 'Expand' : 'Collapse'} ${entry.name}`"
                    @click.stop="toggleCollapse(entry.id)"
                  >▶</button>
                  <span v-else class="poc-toggle-placeholder" />
                  <span class="poc-name-text">{{ entry.name }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'rank'">
                <div class="poc-rank-cell">
                  <input
                    v-if="editingRankId === entry.id"
                    v-model="editingRankValue"
                    class="poc-rank-input"
                    :class="{ 'poc-rank-input--invalid': !!rankEditError }"
                    :aria-label="`Rank for ${entry.name}`"
                    :aria-invalid="!!rankEditError"
                    :title="rankEditError || 'Enter a complete LexoRank value'"
                    autofocus
                    @keydown.enter.prevent="commitRankEdit(entry)"
                    @keydown.esc.prevent="cancelRankEdit"
                    @blur="commitRankEdit(entry)"
                  />
                  <button
                    v-else
                    class="poc-rank-btn"
                    :class="`poc-rank-btn--bucket-${rankBucket(entry.rank)}`"
                    :disabled="fullProgress.active"
                    :aria-label="`Edit rank for ${entry.name}`"
                    title="Click to edit the complete rank"
                    @click.stop="startRankEdit(entry)"
                  >
                    <span class="poc-bucket-pill">{{ rankBucket(entry.rank) }}</span>
                    <span class="poc-rank-text">{{ entry.rank }}</span>
                  </button>
                </div>
              </template>
              <template v-else-if="column.key === 'actions'">
                <button
                  class="poc-row-action"
                  :disabled="fullProgress.active"
                  :aria-label="`Partial rerank around ${entry.name}`"
                  @click.stop="triggerPartialRerank(entry)"
                >Partial rerank</button>
              </template>
            </template>
          </StickyTable>
        </template>
        <template #ghost="{ entries }">
          <table class="poc-table__table" :style="{ '--row-height': rowHeight + 'px' }">
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
                <td class="poc-table__col" style="width: 280px; min-width: 280px">
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
import { computed, reactive, ref, shallowRef } from 'vue'
import StickyTable from './components/StickyTable.vue'
import DragContainer from './components/DragContainer.vue'
import type { TableColumn } from './components/StickyTable.vue'
import type { DropTarget } from './composables/useDropHighlight'
import { generateMockData, type MockDataFabricOptions } from './mockData'
import { ROOT_DOMAIN_ID, type FlatItem, type Item, type ItemRelation } from './types'
import {
  bucketIdOfRank,
  compareRankedItems,
  normalizeRank,
  rankForInsertion,
} from './ranking/lexorank'
import { planFullRerank, planPartialRerank, validateDomainRanks } from './ranking/rerank'
import type { BucketId, OrderingState, RankUpdate } from './ranking/types'

const rowHeight = 36
const maxGhostRows = 5
const FULL_RERANK_BATCH_SIZE = 1000
const ANIMATE_DURATION = 300

const stickyTableRef = ref<{ containerEl: HTMLElement | null } | null>(null)

const columns: TableColumn[] = [
  { key: 'name', title: 'Name' },
  { key: 'rank', title: 'Rank (click to edit)', width: 280 },
  { key: 'actions', title: 'Maintenance', width: 150 },
]

const opts = reactive<MockDataFabricOptions>({
  itemCount: 20000,
  childrenProbability: 0.2,
  childrenToGenerate: 10,
  maxDepth: 5,
})

const items = shallowRef<Item[]>([])
const itemRelations = shallowRef<ItemRelation[]>([])
const orderingStates = shallowRef<Map<string, OrderingState>>(new Map())
const collapsedIds = shallowRef<Set<string>>(new Set())
const animateRows = ref(false)
const editingRankId = ref<string | null>(null)
const editingRankValue = ref('')
const rankEditError = ref('')
const notice = ref<{ kind: 'info' | 'success' | 'error'; message: string } | null>(null)
const fullProgress = reactive({
  active: false,
  processed: 0,
  total: 0,
  destinationBucket: 0 as BucketId,
  direction: '' as '' | 'head-to-tail' | 'tail-to-head',
})

function domainId(parentId: string | null): string {
  return parentId ?? ROOT_DOMAIN_ID
}

function makeOrderingState(id: string, stableBucket: BucketId = 0): OrderingState {
  return { domainId: id, stableBucket, operation: null, version: 1 }
}

function explicitOrderingState(parentId: string | null): OrderingState | undefined {
  return orderingStates.value.get(domainId(parentId))
}

function effectiveStableBucket(parentId: string | null): BucketId {
  return explicitOrderingState(parentId)?.stableBucket ?? 0
}

function replaceOrderingState(state: OrderingState) {
  const next = new Map(orderingStates.value)
  next.set(state.domainId, state)
  orderingStates.value = next
}

function deleteOrderingState(parentId: string | null) {
  const id = domainId(parentId)
  if (!orderingStates.value.has(id)) return
  const next = new Map(orderingStates.value)
  next.delete(id)
  orderingStates.value = next
}

function setNotice(kind: 'info' | 'success' | 'error', message: string) {
  notice.value = { kind, message }
}

function toggleCollapse(id: string) {
  animateRows.value = true
  const next = new Set(collapsedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedIds.value = next
  setTimeout(() => { animateRows.value = false }, ANIMATE_DURATION)
}

function regenerate() {
  if (fullProgress.active) return
  const result = generateMockData({ ...opts })
  items.value = result.items
  itemRelations.value = result.itemRelations
  orderingStates.value = new Map()
  collapsedIds.value = new Set()
  cancelRankEdit()
  setNotice('info', 'Generated fresh bucket-0 ranks for every sibling domain.')
}

const childrenMap = computed<Record<string, string[]>>(() => {
  const map: Record<string, string[]> = {}
  for (const relation of itemRelations.value) {
    if (!map[relation.fromId]) map[relation.fromId] = []
    map[relation.fromId].push(relation.toId)
  }
  return map
})

const parentMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const relation of itemRelations.value) map[relation.toId] = relation.fromId
  return map
})

const itemById = computed(() => new Map<string, Item>(items.value.map(item => [item.id, item])))

const rootItems = computed(() => items.value
  .filter(item => !parentMap.value[item.id])
  .sort(compareRankedItems))

const rootStableBucket = computed(() => orderingStates.value.get(ROOT_DOMAIN_ID)?.stableBucket ?? 0)

const flatItems = computed<FlatItem[]>(() => {
  const childrenByParentId = new Map<string, string[]>()
  const childIds = new Set<string>()

  for (const relation of itemRelations.value) {
    if (!childrenByParentId.has(relation.fromId)) childrenByParentId.set(relation.fromId, [])
    childrenByParentId.get(relation.fromId)!.push(relation.toId)
    childIds.add(relation.toId)
  }

  const roots = items.value.filter(item => !childIds.has(item.id)).sort(compareRankedItems)
  const collapsed = collapsedIds.value
  const result: FlatItem[] = []

  function flatten(id: string, depth: number) {
    const item = itemById.value.get(id)
    if (!item) return
    const children = (childrenByParentId.get(id) ?? [])
      .map(childId => itemById.value.get(childId))
      .filter((child): child is Item => child != null)
      .sort(compareRankedItems)

    result.push({ ...item, depth, childrenCount: children.length })
    if (!collapsed.has(id)) {
      for (const child of children) flatten(child.id, depth + 1)
    }
  }

  for (const root of roots) flatten(root.id, 0)
  return result
})

regenerate()

function getDragEntries(entry: FlatItem): FlatItem[] {
  const flat = flatItems.value
  const index = flat.findIndex(item => item.id === entry.id)
  if (index === -1) return [entry]
  const result: FlatItem[] = [entry]
  for (let cursor = index + 1; cursor < flat.length; cursor++) {
    if (flat[cursor].depth <= entry.depth) break
    result.push(flat[cursor])
  }
  return result
}

function siblingsForParent(parentId: string | null, excludedIds = new Set<string>()): Item[] {
  return items.value.filter(item => {
    const itemParentId = parentMap.value[item.id] ?? null
    return itemParentId === parentId && !excludedIds.has(item.id)
  })
}

function computeRank(previous: FlatItem | Item | null, next: FlatItem | Item | null, parentId: string | null): string {
  return rankForInsertion(previous?.rank ?? null, next?.rank ?? null, effectiveStableBucket(parentId))
}

function applyItemUpdates(updates: RankUpdate[]) {
  const byId = new Map(updates.map(update => [update.id, update.rank]))
  items.value = items.value.map(item => {
    const rank = byId.get(item.id)
    return rank == null ? item : { ...item, rank }
  })
}

function applyRelationAndRank(draggedId: string, parentId: string | null, newRank: string) {
  const oldParentId = parentMap.value[draggedId] ?? null
  applyItemUpdates([{ id: draggedId, rank: newRank }])
  if (oldParentId !== parentId) {
    const nextRelations = itemRelations.value.filter(relation => relation.toId !== draggedId)
    if (parentId) nextRelations.push({ id: crypto.randomUUID(), fromId: parentId, toId: draggedId })
    itemRelations.value = nextRelations
  }
  if (oldParentId !== parentId && siblingsForParent(oldParentId).length === 0) deleteOrderingState(oldParentId)
}

function applyDropInto(draggedId: string, targetId: string) {
  const children = (childrenMap.value[targetId] ?? [])
    .filter(id => id !== draggedId)
    .map(id => itemById.value.get(id))
    .filter((item): item is Item => item != null)
    .sort(compareRankedItems)
  applyRelationAndRank(draggedId, targetId, computeRank(null, children[0] ?? null, targetId))
}

function applyDrop(entries: FlatItem[], target: DropTarget) {
  if (fullProgress.active) {
    setNotice('error', 'Wait for the root full rerank to finish before moving items.')
    return
  }

  try {
    const draggedId = entries[0].id
    const draggedItemIds = new Set(entries.map(entry => entry.id))

    if (target.position === 'into') {
      applyDropInto(draggedId, target.id)
      setNotice('success', 'Moved item and generated a rank from its destination child domain.')
      return
    }

    const flat = flatItems.value.filter(item => !draggedItemIds.has(item.id))
    const targetIndex = flat.findIndex(item => item.id === target.id)
    if (targetIndex === -1) return

    const depth = target.depth
    let insertIndex = target.position === 'before' ? targetIndex : targetIndex + 1
    if (target.position === 'after') {
      while (insertIndex < flat.length && flat[insertIndex].depth > depth) insertIndex++
    }

    let parentId: string | null = null
    if (depth > 0) {
      for (let index = insertIndex - 1; index >= 0; index--) {
        if (flat[index].depth === depth - 1) { parentId = flat[index].id; break }
        if (flat[index].depth < depth - 1) break
      }
    }

    let previousSibling: FlatItem | null = null
    for (let index = insertIndex - 1; index >= 0; index--) {
      if (flat[index].depth === depth) { previousSibling = flat[index]; break }
      if (flat[index].depth < depth) break
    }

    let nextSibling: FlatItem | null = null
    for (let index = insertIndex; index < flat.length; index++) {
      if (flat[index].depth === depth) { nextSibling = flat[index]; break }
      if (flat[index].depth < depth) break
    }

    applyRelationAndRank(draggedId, parentId, computeRank(previousSibling, nextSibling, parentId))
    setNotice('success', 'Moved item and generated a rank from the destination sibling interval.')
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : 'The drop could not generate a valid rank.')
  }
}

function startRankEdit(entry: FlatItem) {
  if (fullProgress.active) return
  editingRankId.value = entry.id
  editingRankValue.value = entry.rank
  rankEditError.value = ''
}

function cancelRankEdit() {
  editingRankId.value = null
  editingRankValue.value = ''
  rankEditError.value = ''
}

function commitRankEdit(entry: FlatItem) {
  if (editingRankId.value !== entry.id) return
  try {
    const rank = normalizeRank(editingRankValue.value)
    applyItemUpdates([{ id: entry.id, rank }])
    cancelRankEdit()
    setNotice('info', `Saved ${rank}. Duplicate and cross-bucket values are allowed for repair experiments.`)
  } catch (error) {
    rankEditError.value = error instanceof Error ? error.message : 'Invalid LexoRank value'
  }
}

function rankBucket(rank: string): BucketId | '?' {
  try {
    return bucketIdOfRank(rank)
  } catch {
    return '?'
  }
}

function triggerPartialRerank(entry: FlatItem) {
  if (fullProgress.active) {
    setNotice('error', 'Partial rerank is disabled while a full rerank is running.')
    return
  }

  try {
    const parentId = parentMap.value[entry.id] ?? null
    const state = explicitOrderingState(parentId)
    if (state?.operation) throw new Error('This ordering domain already has an active operation')
    const stableBucket = state?.stableBucket ?? 0
    const plan = planPartialRerank(siblingsForParent(parentId), entry.id, stableBucket)
    applyItemUpdates(plan.updates)
    if (state) replaceOrderingState({ ...state, version: state.version + 1 })
    setNotice(
      'success',
      `Partial rerank rewrote ${plan.updates.length} of ${plan.domainSize} siblings (positions ${plan.startIndex + 1}–${plan.endIndex + 1}) in bucket ${stableBucket}.`,
    )
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : 'Partial rerank failed')
  }
}

function nextAnimationFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

async function triggerFullRerank() {
  if (fullProgress.active || rootItems.value.length === 0) return
  cancelRankEdit()

  const state = explicitOrderingState(null) ?? makeOrderingState(ROOT_DOMAIN_ID)
  if (state.operation) {
    setNotice('error', 'The root ordering domain already has an active operation.')
    return
  }

  try {
    const plan = planFullRerank(rootItems.value, state.stableBucket)
    fullProgress.active = true
    fullProgress.processed = 0
    fullProgress.total = plan.updates.length
    fullProgress.destinationBucket = plan.destinationBucket
    fullProgress.direction = plan.direction
    replaceOrderingState({
      ...state,
      operation: {
        type: 'full-rerank',
        sourceBucket: plan.sourceBucket,
        destinationBucket: plan.destinationBucket,
        direction: plan.direction,
        processed: 0,
        total: plan.updates.length,
      },
    })
    setNotice('info', `Migrating root ranks ${plan.sourceBucket} → ${plan.destinationBucket}; child domains are unchanged.`)

    for (let start = 0; start < plan.migrationUpdates.length; start += FULL_RERANK_BATCH_SIZE) {
      const batch = plan.migrationUpdates.slice(start, start + FULL_RERANK_BATCH_SIZE)
      applyItemUpdates(batch)
      fullProgress.processed += batch.length
      const current = orderingStates.value.get(ROOT_DOMAIN_ID)!
      replaceOrderingState({
        ...current,
        operation: current.operation ? { ...current.operation, processed: fullProgress.processed } : null,
      })
      await nextAnimationFrame()
    }

    validateDomainRanks(rootItems.value, plan.destinationBucket)
    const completedState = orderingStates.value.get(ROOT_DOMAIN_ID)!
    const nextState = {
      ...completedState,
      stableBucket: plan.destinationBucket,
      operation: null,
      version: completedState.version + 1,
    }
    if (plan.destinationBucket === 0) deleteOrderingState(null)
    else replaceOrderingState(nextState)
    setNotice(
      'success',
      `Full root rerank completed: ${plan.updates.length} ranks migrated into bucket ${plan.destinationBucket}. Child buckets did not change.`,
    )
  } catch (error) {
    const current = orderingStates.value.get(ROOT_DOMAIN_ID)
    if (current?.stableBucket === 0) deleteOrderingState(null)
    else if (current) replaceOrderingState({ ...current, operation: null })
    setNotice('error', error instanceof Error ? error.message : 'Full rerank failed')
  } finally {
    fullProgress.active = false
    fullProgress.direction = ''
  }
}
</script>
