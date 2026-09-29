import type { RangeDirection, RangePoint, RangeSelectionContext } from './context'
const pendingFocus=new WeakMap<HTMLElement,number>()

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
export function rangeKey(event: KeyboardEvent, surface: HTMLElement | undefined, context: RangeSelectionContext | undefined, report: (error: unknown) => void, reveal?: (point: RangePoint) => Promise<void>): boolean {
  if (!context?.enabled) return false
  const hit = point(event.target)
  if (!hit) return false
  const focusBeforeReveal=surface?.ownerDocument.activeElement
  const ticket=surface?(pendingFocus.get(surface)??0)+1:0
  if(surface)pendingFocus.set(surface,ticket)
  const directions: Record<string, RangeDirection> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
  if (event.key === 'Escape') context.clear()
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') void context.copy().catch(report)
  else if (directions[event.key]) {
    const next = context.move(hit.point, directions[event.key]!, event.shiftKey)
    const find = () => next && [...(surface?.querySelectorAll<HTMLElement>('[data-range-row][data-range-column]') ?? [])].find(element => element.dataset.rangeRow === next.rowId && element.dataset.rangeColumn === next.columnId && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
    const element = find()
    element?.focus({ preventScroll: true }); element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    if(!element&&next&&reveal){
      const current=()=>Boolean(surface?.isConnected&&pendingFocus.get(surface)===ticket&&context.enabled&&context.isSelected(next.rowId,next.columnId))
      void reveal(next).then(()=>{
        if(!current()||!surface)return
        const active=surface.ownerDocument.activeElement
        // Virtualization may remove the focused cell and leave focus on body.
        // A user moving focus to another control owns that newer focus choice.
        if(active!==focusBeforeReveal&&!(focusBeforeReveal&&!focusBeforeReveal.isConnected&&active===surface.ownerDocument.body))return
        find()?.focus({preventScroll:true})
      }).catch(cause=>{if(current())report(cause)})
    }
  } else return false
  event.preventDefault(); event.stopPropagation(); return true
}
