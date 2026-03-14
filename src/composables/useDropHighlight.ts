import { watch, onScopeDispose } from 'vue'
import type { Ref } from 'vue'

const EDGE_SIZE = 10
const COLOR = '#3b82f6'

export type DropPosition = 'before' | 'after' | 'into'

export type DropTarget = {
  id: string
  position: DropPosition
  depth: number
}

export function useDropHighlight(
  scrollEl: Ref<HTMLElement | null>,
  active: Ref<boolean>,
  dragStartX: Ref<number>,
  draggedIds: Ref<Set<string>>,
  onDrop?: (target: DropTarget) => void,
  onTargetChange?: (target: DropTarget | null) => void
) {
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:9998;display:none;'
  document.body.appendChild(overlay)

  let currentTarget: DropTarget | null = null
  let currentMouseX = 0

  const DEPTH_INDENT = 20

  type HoveredRow = { id: string; depth: number; rowEl: HTMLElement }

  function getHoveredRow(x: number, y: number): HoveredRow | null {
    const el = scrollEl.value
    if (!el) return null
    const elements = document.elementsFromPoint(x, y)
    const cell = elements.find(node =>
      node instanceof HTMLElement &&
      el.contains(node) &&
      !!node.dataset.rowId &&
      !draggedIds.value.has(node.dataset.rowId!)
    ) as HTMLElement | undefined
    if (!cell) return null
    const rowEl = cell.closest('tr') as HTMLElement | null
    if (!rowEl) return null
    return { id: cell.dataset.rowId!, depth: Number(cell.dataset.rowDepth ?? 0), rowEl }
  }

  function getSiblingRowDepth(rowEl: HTMLElement, direction: 'next' | 'prev'): number | null {
    let sibling = (direction === 'next' ? rowEl.nextElementSibling : rowEl.previousElementSibling) as HTMLElement | null
    while (sibling) {
      const cell = sibling.querySelector('[data-row-id]') as HTMLElement | null
      if (cell) return Number(cell.dataset.rowDepth ?? 0)
      sibling = (direction === 'next' ? sibling.nextElementSibling : sibling.previousElementSibling) as HTMLElement | null
    }
    return null
  }

  function getEffectiveDepth(rowEl: HTMLElement, rowDepth: number, position: DropPosition): number {
    const depthAdjust = () => Math.round((currentMouseX - dragStartX.value) / DEPTH_INDENT)

    if (position === 'after') {
      const nextDepth = getSiblingRowDepth(rowEl, 'next')
      if (nextDepth === null || nextDepth >= rowDepth) {
        return nextDepth !== null && nextDepth > rowDepth ? rowDepth + 1 : rowDepth
      }
      // Next row is shallower: ambiguous range [nextDepth..rowDepth]
      return Math.max(nextDepth, Math.min(rowDepth, rowDepth + depthAdjust()))
    }

    if (position === 'before') {
      const prevDepth = getSiblingRowDepth(rowEl, 'prev')
      if (prevDepth === null || prevDepth <= rowDepth) {
        return rowDepth
      }
      // Prev row is deeper: ambiguous range [rowDepth..prevDepth]
      return Math.max(rowDepth, Math.min(prevDepth, rowDepth + depthAdjust()))
    }

    return rowDepth
  }

  function getPosition(rowEl: HTMLElement, y: number): DropPosition {
    const rect = rowEl.getBoundingClientRect()
    if (y - rect.top < EDGE_SIZE) return 'before'
    if (rect.bottom - y < EDGE_SIZE) return 'after'
    return 'into'
  }

  function applyOverlay(rowEl: HTMLElement, position: DropPosition, depth: number) {
    const rect = rowEl.getBoundingClientRect()
    overlay.style.display = 'block'
    const offset = depth * DEPTH_INDENT

    if (position === 'into') {
      overlay.style.left = (rect.left + offset) + 'px'
      overlay.style.width = (rect.width - offset) + 'px'
      overlay.style.top = rect.top + 'px'
      overlay.style.height = rect.height + 'px'
      overlay.style.border = `2px solid ${COLOR}`
      overlay.style.borderRadius = '2px'
      overlay.style.background = 'rgba(59, 130, 246, 0.06)'
    } else {
      overlay.style.left = (rect.left + offset) + 'px'
      overlay.style.width = (rect.width - offset) + 'px'
      const lineY = position === 'before' ? rect.top : rect.bottom
      overlay.style.top = (lineY - 1.5) + 'px'
      overlay.style.height = '3px'
      overlay.style.border = 'none'
      overlay.style.borderRadius = '2px'
      overlay.style.background = COLOR
    }
  }

  function hideOverlay() {
    overlay.style.display = 'none'
    if (currentTarget !== null) {
      currentTarget = null
      onTargetChange?.(null)
    }
  }

  function onMouseMove(event: MouseEvent) {
    if (!active.value) return
    currentMouseX = event.clientX
    const hovered = getHoveredRow(event.clientX, event.clientY)
    if (!hovered) { hideOverlay(); return }
    const position = getPosition(hovered.rowEl, event.clientY)
    const depth = getEffectiveDepth(hovered.rowEl, hovered.depth, position)
    applyOverlay(hovered.rowEl, position, depth)
    if (currentTarget?.id !== hovered.id || currentTarget?.position !== position || currentTarget?.depth !== depth) {
      currentTarget = { id: hovered.id, position, depth }
      onTargetChange?.(currentTarget)
    }
  }

  function onMouseUp() {
    if (currentTarget) {
      onDrop?.(currentTarget)
    }
    hideOverlay()
  }

  watch(active, (val) => {
    if (!val) hideOverlay()
  })

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)

  onScopeDispose(() => {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    overlay.remove()
  })
}
