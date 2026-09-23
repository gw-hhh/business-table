import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { scrollViewportByKey, useTableViewport } from '../src/presentation/useTableViewport'

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.unstubAllGlobals() })

it('forwards region scrolling without consuming keys from a focused child control', () => {
  const region = document.createElement('div'), button = document.createElement('button'), content = document.createElement('div')
  region.append(button, content)
  Object.defineProperty(content, 'clientHeight', { value: 240 })
  content.scrollBy = vi.fn()
  region.addEventListener('keydown', event => scrollViewportByKey(event, content))
  const pageDown = new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true })
  region.dispatchEvent(pageDown)
  expect(pageDown.defaultPrevented).toBe(true)
  expect(content.scrollBy).toHaveBeenCalledWith({ left: 0, top: 240, behavior: 'instant' })
  const childArrow = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
  button.dispatchEvent(childArrow)
  expect(childArrow.defaultPrevented).toBe(false)
  expect(content.scrollBy).toHaveBeenCalledOnce()
})

it('tracks height-only and content scrollbar changes, coalesces frames, and disconnects on disposal', async () => {
  let observerCallback: ResizeObserverCallback = () => undefined
  const observed: Element[] = [], frames = new Map<number, FrameRequestCallback>()
  let sequence = 0
  const disconnect = vi.fn(), recalculated = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { observerCallback = callback }
    observe(element: Element) { observed.push(element) }
    disconnect = disconnect
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  let state: ReturnType<typeof useTableViewport>
  const Subject = defineComponent({ setup() {
    const frame = ref<HTMLElement>(), content = ref<HTMLElement>()
    state = useTableViewport(frame, recalculated, () => content.value)
    return () => h('div', { ref: frame }, h('div', { ref: content }))
  } })
  wrapper = mount(Subject)
  let contentWidth = 985, frameHeight = 500
  Object.defineProperty(observed[0], 'clientWidth', { get: () => 1000 })
  Object.defineProperty(observed[0], 'clientHeight', { get: () => frameHeight })
  Object.defineProperty(observed[1], 'clientWidth', { get: () => contentWidth })
  const notify = () => observerCallback([], {} as ResizeObserver)
  const flush = async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); await nextTick() }
  await flush()
  expect(state!.value).toEqual({ width: 985, height: 500, frameWidth: 1000 })
  expect(recalculated).toHaveBeenCalledOnce()
  frameHeight = 240
  notify(); notify()
  expect(frames.size).toBe(1)
  expect(state!.value.height, 'ResizeObserver delivery must not synchronously change VXE layout').toBe(500)
  await flush()
  expect(state!.value.height).toBe(240)
  contentWidth = 1000
  notify(); await flush()
  expect(state!.value.width, 'the adapter content width accounts for scrollbar modes without assumed pixel widths').toBe(1000)
  notify(); await flush()
  expect(recalculated).toHaveBeenCalledTimes(3)
  notify()
  wrapper.unmount(); wrapper = undefined
  expect(frames.size).toBe(0)
  expect(disconnect).toHaveBeenCalledOnce()
  await flush()
  expect(recalculated).toHaveBeenCalledTimes(3)
})
