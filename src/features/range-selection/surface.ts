import type { RangeDirection, RangePoint, RangeSelectionContext } from './context'

function point(target: EventTarget | null): { element: HTMLElement; point: RangePoint } | undefined {
  if (!(target instanceof Element) || target.closest('button,a,input,select,textarea,[contenteditable="true"],[role="button"],[role="separator"]')) return
  const selector = '[data-range-row][data-range-column]'
  const element = target.closest<HTMLElement>(selector) ?? target.closest('.vxe-body--column')?.querySelector<HTMLElement>(selector)
  return element ? { element, point: { rowId: element.dataset.rangeRow!, columnId: element.dataset.rangeColumn! } } : undefined
}
export function rangePointer(event: PointerEvent, context: RangeSelectionContext | undefined, phase: 'start' | 'extend') {
  if (!context?.enabled || phase === 'start' && event.button !== 0) return
  const hit = point(event.target)
  if (!hit) return
  if (phase === 'start') { event.preventDefault(); context.begin(hit.point); hit.element.focus({ preventScroll: true }) }
  else context.extend(hit.point)
}
export function rangeKey(event: KeyboardEvent, surface: HTMLElement | undefined, context: RangeSelectionContext | undefined, report: (error: unknown) => void): boolean {
  if (!context?.enabled) return false
  const hit = point(event.target)
  if (!hit) return false
  const directions: Record<string, RangeDirection> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
  if (event.key === 'Escape') context.clear()
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') void context.copy().catch(report)
  else if (directions[event.key]) {
    const next = context.move(hit.point, directions[event.key]!, event.shiftKey)
    const element = next && [...(surface?.querySelectorAll<HTMLElement>('[data-range-row][data-range-column]') ?? [])].find(element => element.dataset.rangeRow === next.rowId && element.dataset.rangeColumn === next.columnId && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
    element?.focus({ preventScroll: true }); element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  } else return false
  event.preventDefault(); event.stopPropagation(); return true
}
