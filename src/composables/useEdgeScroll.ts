import { watch, onScopeDispose } from 'vue'
import type { Ref } from 'vue'

const EDGE_SIZE = 60
const SPEED = 400 // px/sec
const TICK_MS = 16 // ~60fps

export function useEdgeScroll(scrollEl: Ref<HTMLElement | null>, active: Ref<boolean>) {
  let tickId = 0
  let mouseY = 0

  function getDelta(): number {
    const el = scrollEl.value
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const y = mouseY - rect.top
    const h = rect.height
    if (y < EDGE_SIZE) {
      return -(SPEED * TICK_MS / 1000) * (1 - y / EDGE_SIZE)
    }
    if (y > h - EDGE_SIZE) {
      return (SPEED * TICK_MS / 1000) * (1 - (h - y) / EDGE_SIZE)
    }
    return 0
  }

  function tick() {
    tickId = 0
    const el = scrollEl.value
    if (!el || !active.value) return
    const delta = getDelta()
    if (delta !== 0) {
      el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + delta))
      tickId = window.setTimeout(tick, TICK_MS)
    }
  }

  function onMouseMove(event: MouseEvent) {
    mouseY = event.clientY
    if (tickId) { clearTimeout(tickId); tickId = 0 }
    const delta = getDelta()
    if (delta !== 0) {
      tickId = window.setTimeout(tick, TICK_MS)
    }
  }

  function cleanup() {
    window.removeEventListener('mousemove', onMouseMove)
    if (tickId) { clearTimeout(tickId); tickId = 0 }
  }

  watch(active, (val) => {
    if (val) {
      window.addEventListener('mousemove', onMouseMove)
    } else {
      cleanup()
    }
  })

  onScopeDispose(cleanup)
}
