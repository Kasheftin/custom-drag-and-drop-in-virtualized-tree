<template>
  <slot :start-drag="handleStartDrag" />
  <Teleport to="body">
    <div
      v-if="drag?.active"
      class="poc-drag-ghost"
      :style="{
        left: drag.left + 'px',
        top: drag.top + 'px',
        width: drag.width + 'px',
      }"
    >
      <slot name="ghost" :entries="ghostEntries" :drag="drag" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDrag } from '../composables/useDrag'
import { useEdgeScroll } from '../composables/useEdgeScroll'
import { useDropHighlight } from '../composables/useDropHighlight'
import type { DropTarget } from '../composables/useDropHighlight'
import type { FlatItem } from '../types'

const props = defineProps<{ scrollEl?: HTMLElement | null }>()

const emit = defineEmits<{
  drop: [entries: FlatItem[], target: DropTarget]
}>()

const { drag, start, stop } = useDrag()
const ghostEntries = ref<FlatItem[]>([])

const scrollElRef = computed(() => props.scrollEl ?? null)
const dragActive = computed(() => !!drag.value?.active)
const dragStartX = computed(() => drag.value?.startX ?? 0)
const draggedIds = computed(() => new Set(ghostEntries.value.map(e => e.id)))
useEdgeScroll(scrollElRef, dragActive)
useDropHighlight(scrollElRef, dragActive, dragStartX, draggedIds, (target) => {
  emit('drop', ghostEntries.value, target)
})

function handleStartDrag(event: MouseEvent, el: HTMLElement, entries: FlatItem[]) {
  ghostEntries.value = entries
  start(event, el)
}

defineExpose({ stop })
</script>
