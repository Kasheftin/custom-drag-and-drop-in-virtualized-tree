<template>
  <div
    ref="containerEl"
    class="poc-table"
    :style="{ '--total-height': totalHeight + 'px', '--row-height': rowHeight + 'px' }"
    @scroll.passive="onScroll"
  >
    <div class="poc-table__sizer" />
    <div class="poc-table__layer">
      <table class="poc-table__table">
        <thead class="poc-table__header">
          <tr class="poc-table__row">
            <th
              v-for="col in columns"
              :key="col.key"
              class="poc-table__col poc-table__col--header"
              :style="col.width ? { width: col.width + 'px', minWidth: col.width + 'px' } : {}"
            >
              <div class="poc-table__cell">
                <slot name="header-cell" :column="col">{{ col.title }}</slot>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            class="poc-table__row poc-table__row--spacer"
            :style="{ '--row-height': topSpacerHeight + 'px' }"
          >
            <td :colspan="columns.length" class="poc-table__spacer-cell" />
          </tr>
        </tbody>
        <TransitionGroup tag="tbody" :css="false" class="poc-table__body" @enter="onRowEnter" @leave="onRowLeave">
          <StickyTableRow
            v-for="entry in visibleEntries"
            :key="entry.id"
            :entry="entry"
            :columns="columns"
            @dragstart="(event, el, e) => emit('row-dragstart', event, el, e)"
          >
            <template #body-cell="slotProps">
              <slot name="body-cell" v-bind="slotProps" />
            </template>
          </StickyTableRow>
        </TransitionGroup>
        <tbody>
          <tr
            class="poc-table__row poc-table__row--spacer"
            :style="{ '--row-height': bottomSpacerHeight + 'px' }"
          >
            <td :colspan="columns.length" class="poc-table__spacer-cell" />
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends { id: string }">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import StickyTableRow from './StickyTableRow.vue'
import { runAnimation } from '../utils/animation'
import type { AnimationInstance } from '../utils/animation'

export type TableColumn = {
  key: string
  title: string
  width?: number
}

type Props = {
  columns: TableColumn[]
  entries: T[]
  rowHeight?: number
  overscan?: number
  animate?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  rowHeight: 40,
  overscan: 5
})

const emit = defineEmits<{
  'row-dragstart': [event: MouseEvent, el: HTMLElement, entry: T]
}>()

const containerEl = ref<HTMLElement | null>(null)
const scrollTop = ref(0)

const totalHeight = computed(() => props.entries.length * props.rowHeight)

const firstIndex = computed(() => {
  const raw = Math.floor(scrollTop.value / props.rowHeight) - props.overscan
  return Math.max(0, raw)
})

const containerHeight = ref(0)

const visibleCount = computed(() => {
  const perPage = Math.ceil(containerHeight.value / props.rowHeight)
  return perPage + props.overscan * 2
})

const visibleEntries = computed(() => {
  return props.entries.slice(firstIndex.value, firstIndex.value + visibleCount.value)
})

const topSpacerHeight = computed(() => firstIndex.value * props.rowHeight)

const bottomSpacerHeight = computed(() => {
  const renderedEnd = firstIndex.value + visibleEntries.value.length
  return Math.max(0, (props.entries.length - renderedEnd) * props.rowHeight)
})

function onScroll(e: Event) {
  scrollTop.value = (e.target as HTMLElement).scrollTop
}

onMounted(() => {
  if (containerEl.value) {
    containerHeight.value = containerEl.value.clientHeight
    const ro = new ResizeObserver(() => {
      containerHeight.value = containerEl.value?.clientHeight ?? 0
    })
    ro.observe(containerEl.value)
    onUnmounted(() => ro.disconnect())
  }
})

const ANIM_DURATION = 300
const rowAnims = new WeakMap<Element, AnimationInstance>()

function animateRow(el: Element, fromHeight: number, toHeight: number, done: () => void) {
  rowAnims.get(el)?.destroy()
  const tr = el as HTMLElement
  tr.querySelectorAll<HTMLElement>('td').forEach(td => { td.style.overflow = 'hidden' })
  const anim = runAnimation(ANIM_DURATION, (percent) => {
    const h = fromHeight + (toHeight - fromHeight) * (percent / 100)
    tr.style.setProperty('--row-height', `${h}px`)
    tr.style.opacity = String(toHeight === 0 ? 1 - percent / 100 : percent / 100)
    if (percent >= 100) {
      tr.style.removeProperty('--row-height')
      tr.style.removeProperty('opacity')
      tr.querySelectorAll<HTMLElement>('td').forEach(td => { td.style.overflow = '' })
      done()
    }
  })
  rowAnims.set(el, anim)
}

function onRowEnter(el: Element, done: () => void) {
  if (!props.animate) { done(); return }
  animateRow(el, 0, props.rowHeight, done)
}

function onRowLeave(el: Element, done: () => void) {
  if (!props.animate) { done(); return }
  // During expand, rows that were in the viewport get pushed outside the virtual window
  // and trigger a leave. But they're still in props.entries — only scroll-out, not removed.
  // Skip animation for those; only animate rows that were truly removed (collapsed).
  const rowId = (el as HTMLElement).querySelector('[data-row-id]')?.getAttribute('data-row-id')
  if (rowId && props.entries.some(e => e.id === rowId)) { done(); return }
  animateRow(el, props.rowHeight, 0, done)
}

defineExpose({ containerEl })
</script>
