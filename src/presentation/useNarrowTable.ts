import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import './narrow-table.css'

const narrowWidth = 700

/** Presentation only: never rewrite saved column pins when a container shrinks. */
export function useNarrowTable(element: Ref<HTMLElement | undefined>) {
  const narrow = ref(false)
  let observer: ResizeObserver | undefined
  const update = (width: number) => { if (width > 0) narrow.value = width <= narrowWidth }
  const measure = () => { if (element.value) update(element.value.getBoundingClientRect().width) }
  onMounted(() => {
    measure()
    if (!element.value) return
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(entries => {
        for (const entry of entries) if (entry.target === element.value) update(entry.contentRect.width)
      })
      observer.observe(element.value)
    } else window.addEventListener('resize', measure)
  })
  onBeforeUnmount(() => { observer?.disconnect(); window.removeEventListener('resize', measure) })
  return narrow
}
