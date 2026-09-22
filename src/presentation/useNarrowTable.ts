import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import './narrow-table.css'

const narrowWidth = 700

/** Width-only, frame-scheduled presentation; saved column pins never change. */
export function useNarrowTable(element: Ref<HTMLElement | undefined>, afterResize?: () => void) {
  const narrow = ref(false)
  let observer: ResizeObserver | undefined
  let pendingFrame: number | undefined
  let pendingWidth = 0
  let appliedWidth = 0
  let disposed = false
  const schedule = (width: number) => {
    if (disposed || width <= 0 || !Number.isFinite(width)) return
    pendingWidth = width
    if (pendingFrame !== undefined || width === appliedWidth) return
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = undefined
      if (disposed || pendingWidth === appliedWidth) return
      appliedWidth = pendingWidth
      narrow.value = appliedWidth <= narrowWidth
      // Vue must finish removing/adding fixed columns before VXE measures them.
      void nextTick(() => { if (!disposed) afterResize?.() })
    })
  }
  const measure = () => { if (element.value) schedule(element.value.getBoundingClientRect().width) }
  onMounted(() => {
    measure()
    if (!element.value) return
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          if (entry.target === element.value) schedule(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width)
        }
      })
      observer.observe(element.value)
    } else window.addEventListener('resize', measure)
  })
  onBeforeUnmount(() => {
    disposed = true
    observer?.disconnect()
    if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame)
    window.removeEventListener('resize', measure)
  })
  return narrow
}
