import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'

const observations: { callback: ResizeObserverCallback; elements: Set<Element>; disconnect: ReturnType<typeof vi.fn> }[] = []
const Grid = defineComponent({ methods: { recalculate: async () => {} }, template: '<div><slot /></div>' })
const Column = defineComponent({ name: 'ColumnStub', props: ['field', 'fixed'], template: '<div><slot name="header" /></div>' })
let wrapper: VueWrapper | undefined
async function resize(width: number) {
  const container = wrapper!.element
  for (const observation of observations.filter(observation => observation.elements.has(container))) {
    observation.callback([{ target: container, contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver)
  }
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await flushPromises()
}
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.unstubAllGlobals(); observations.splice(0) })

describe('narrow table presentation', () => {
  it('unfixes all columns in a narrow container, restores desktop pins, and never saves these presentation changes', async () => {
    class Observer {
      elements = new Set<Element>()
      disconnect = vi.fn(() => this.elements.clear())
      constructor(callback: ResizeObserverCallback) { observations.push({ callback, elements: this.elements, disconnect: this.disconnect }) }
      observe(element: Element) { this.elements.add(element) }
      unobserve(element: Element) { this.elements.delete(element) }
    }
    vi.stubGlobal('ResizeObserver', Observer)
    const save = vi.fn(async () => {})
    wrapper = mount(BusinessTable, {
      props: {
        tableKey: 'narrow', rowKey: 'id', selection: true,
        columns: [{ id: 'id', field: 'id', title: '编号', width: 194, fixed: 'left' }, { id: 'name', field: 'name', title: '名称', width: 280 }],
        data: [{ id: '1', name: '项目' }], actions: [{ id: 'view', label: '查看', handler() {} }],
        persistence: { load: async () => null, save },
      },
      global: { stubs: { 'vxe-table': Grid, 'vxe-column': Column } },
    }) as VueWrapper
    await flushPromises()
    // Row actions are lazy-loaded; wait for the real feature before inspecting its VXE column.
    await vi.waitFor(() => expect(wrapper!.findAllComponents(Column)).toHaveLength(4))
    expect(observations.some(observation => observation.elements.has(wrapper!.element)), 'observe the actual table container, not only the browser width').toBe(true)
    await resize(390)
    const columns = () => wrapper!.findAllComponents(Column)
    expect(columns().every(column => !column.props('fixed'))).toBe(true)
    expect(wrapper.emitted('configChange')).toBeUndefined()
    expect(save).not.toHaveBeenCalled()
    await resize(1440)
    expect(columns().filter(column => column.props('fixed') === 'left')).toHaveLength(2)
    expect(columns().filter(column => column.props('fixed') === 'right')).toHaveLength(1)
    expect(save).not.toHaveBeenCalled()
    wrapper.unmount(); wrapper = undefined
    for (const observation of observations) expect(observation.disconnect).toHaveBeenCalledOnce()
  })
})
