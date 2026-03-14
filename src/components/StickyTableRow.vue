<template>
  <tr ref="rowEl" class="poc-table__row" @mousedown="onMouseDown">
    <td
      v-for="col in columns"
      :key="col.key"
      class="poc-table__col"
      :data-row-id="entry.id"
      :data-row-depth="(entry as Record<string, unknown>).depth ?? 0"
    >
      <div class="poc-table__cell">
        <slot name="body-cell" :entry="entry" :column="col" />
      </div>
    </td>
  </tr>
</template>

<script setup lang="ts" generic="T extends { id: string }">
import { ref } from 'vue'
import type { TableColumn } from './StickyTable.vue'

const props = defineProps<{
  entry: T
  columns: TableColumn[]
}>()

const emit = defineEmits<{
  dragstart: [event: MouseEvent, el: HTMLElement, entry: T]
}>()

const rowEl = ref<HTMLElement | null>(null)

function onMouseDown(event: MouseEvent) {
  if (rowEl.value) {
    emit('dragstart', event, rowEl.value, props.entry)
  }
}
</script>
