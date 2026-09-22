import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useNarrowTable } from '../src/presentation/useNarrowTable'

let wrapper: VueWrapper | undefined
const callbacks = new Map<number, FrameRequestCallback>()
let nextFrame = 0
let observed: Element | undefined
let notify: ResizeObserverCallback
const disconnect = vi.fn()
function send(width: number) {
  notify([{ target: observed, contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver)
}
async function frame() {
  const queued = [...callbacks.values()]
  callbacks.clear()
  for (const callback of queued) callback(0)
  await nextTick()
}
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.unstubAllGlobals(); callbacks.clear(); disconnect.mockClear() })

it('defers resize-driven presentation until a frame and coalesces repeated notifications', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++nextFrame, callback); return nextFrame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
  class Observer {
    constructor(callback: ResizeObserverCallback) { notify = callback }
    observe(element: Element) { observed = element }
    disconnect = disconnect
  }
  vi.stubGlobal('ResizeObserver', Observer)
  let state = ref(false)
  const Subject = defineComponent({
    setup() {
      const element = ref<HTMLElement>()
      state = useNarrowTable(element)
      return () => h('div', { ref: element }, state.value ? 'narrow' : 'wide')
    },
  })
  wrapper = mount(Subject)
  send(390)
  expect(state.value, 'do not alter layout inside a ResizeObserver delivery').toBe(false)
  send(380)
  expect(callbacks.size, 'one pending frame for a burst of observations').toBe(1)
  await frame()
  expect(state.value).toBe(true)
  send(380)
  expect(callbacks.size, 'height-only or duplicate width notifications do not recalculate').toBe(0)
  send(1440)
  expect(callbacks.size).toBe(1)
  wrapper.unmount(); wrapper = undefined
  expect(callbacks.size, 'dispose cancels the queued frame').toBe(0)
  expect(disconnect).toHaveBeenCalledOnce()
  await frame()
  expect(state.value).toBe(true)
})
