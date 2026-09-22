import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue'

let locks = 0
let originalOverflow = ''
export function visibleControls(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')).filter(element => {
    if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[inert],[hidden]')) return false
    for (let current: HTMLElement | null = element; current && current !== root; current = current.parentElement) {
      const style = getComputedStyle(current)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  })
}
/** Reference-counted body lock; nested dialogs restore focus in closing order. */
export function useOverlay(root: Ref<HTMLElement | undefined>, close: () => void) {
  let previous: HTMLElement | null = null
  let acquired = false
  onMounted(async () => {
    previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (locks++ === 0) { originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    acquired = true
    await nextTick()
    const autofocus = root.value?.querySelector<HTMLElement>('[autofocus]')
    ;(autofocus ?? root.value)?.focus({ preventScroll: true })
  })
  onBeforeUnmount(() => {
    if (acquired && --locks === 0) document.body.style.overflow = originalOverflow
    if (previous?.isConnected) previous.focus({ preventScroll: true })
  })
  function keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || !root.value) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (event.key !== 'Tab') return
    const controls = visibleControls(root.value), first = controls[0], last = controls.at(-1)
    if (!first) { event.preventDefault(); root.value.focus(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === root.value)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.value)) { event.preventDefault(); first.focus() }
  }
  return { keydown }
}
