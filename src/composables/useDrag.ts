import { ref, onScopeDispose } from 'vue'

export type DragState = {
  active: boolean
  startX: number
  startY: number
  initialLeft: number
  initialTop: number
  left: number
  top: number
  width: number
  height: number
}

const THRESHOLD = 5

export function useDrag() {
  const drag = ref<DragState | null>(null)

  function start(event: MouseEvent, el: HTMLElement) {
    event.preventDefault()
    const box = el.getBoundingClientRect()
    drag.value = {
      active: false,
      startX: event.clientX,
      startY: event.clientY,
      initialLeft: box.left,
      initialTop: box.top,
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onStop)
    window.addEventListener('contextmenu', onContextMenu)
  }

  function onMove(event: MouseEvent) {
    if (!drag.value) return
    const dx = event.clientX - drag.value.startX
    const dy = event.clientY - drag.value.startY
    if (!drag.value.active && Math.hypot(dx, dy) < THRESHOLD) return
    drag.value = {
      ...drag.value,
      active: true,
      left: drag.value.initialLeft + dx,
      top: drag.value.initialTop + dy,
    }
  }

  function onStop() {
    cleanup()
    drag.value = null
  }

  function onContextMenu(event: Event) {
    if (drag.value?.active) event.preventDefault()
  }

  function cleanup() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onStop)
    window.removeEventListener('contextmenu', onContextMenu)
  }

  onScopeDispose(cleanup)

  return { drag, start, stop: onStop }
}
