import { nextTick, onBeforeUnmount, onMounted, shallowRef, type Ref } from 'vue'

/** Preserve native region keyboard scrolling when an adapter owns the scrollable content. */
export function scrollViewportByKey(event: KeyboardEvent, content?: HTMLElement | null) {
  if (!content || event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -40], ArrowDown: [0, 40],
    PageUp: [0, -content.clientHeight], PageDown: [0, content.clientHeight],
    Home: [0, -content.scrollTop], End: [0, content.scrollHeight - content.scrollTop],
    ' ': [0, content.clientHeight * (event.shiftKey ? -1 : 1)],
  }
  const move = moves[event.key]
  if (!move) return
  event.preventDefault()
  content.scrollBy({ left: move[0], top: move[1], behavior: 'instant' })
}

/** Observe the frame, not the table content, so changing rows cannot change the available height. */
export function useTableViewport(element: Ref<HTMLElement | undefined>, afterResize?: () => void, widthElement?: () => HTMLElement | undefined) {
  const size = shallowRef({ width: 0, height: 0, frameWidth: 0 })
  let observer: ResizeObserver | undefined, frame: number | undefined, disposed = false
  const measure = () => {
    if (disposed || frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      const frameElement = element.value
      if (disposed || !frameElement) return
      // The adapter supplies its actual content box, including native/overlay scrollbar space.
      const frameWidth = frameElement.clientWidth
      const width = widthElement?.()?.clientWidth ?? frameWidth, height = frameElement.clientHeight
      if (width === size.value.width && height === size.value.height && frameWidth === size.value.frameWidth) return
      size.value = { width, height, frameWidth }
      void nextTick(() => { if (!disposed) afterResize?.() })
    })
  }
  onMounted(() => {
    measure()
    if (element.value && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure)
      observer.observe(element.value)
      const content = widthElement?.()
      if (content && content !== element.value) observer.observe(content)
    } else window.addEventListener('resize', measure)
  })
  onBeforeUnmount(() => {
    disposed = true
    observer?.disconnect()
    if (frame !== undefined) cancelAnimationFrame(frame)
    window.removeEventListener('resize', measure)
  })
  return size
}
