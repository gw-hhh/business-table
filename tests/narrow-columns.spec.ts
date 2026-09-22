import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'

let widthChanged: ResizeObserverCallback | undefined
let observed: Element | undefined
const disconnect = vi.fn()
const Grid = defineComponent({ template: '<div><slot /></div>' })
const Column = defineComponent({ name: 'ColumnStub', props: ['field', 'fixed'], template: '<div><slot name="header" /></div>' })
let wrapper: VueWrapper | undefined
async function resize(width: number) {
  widthChanged?.([{ target: observed, contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver)
  await flushPromises()
}
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); widthChanged = undefined; observed = undefined; disconnect.mockClear() })

describe('narrow table presentation', () => {
  it('unfixes all columns in a narrow container, restores desktop pins, and never saves these presentation changes', async () => {
    class Observer {
      constructor(callback: ResizeObserverCallback) { widthChanged = callback }
      observe(element: Element) { observed = element }
      disconnect = disconnect
      unobserve() {}
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
    expect(observed, 'observe the actual table container, not only the browser width').toBe(wrapper.element)
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
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
