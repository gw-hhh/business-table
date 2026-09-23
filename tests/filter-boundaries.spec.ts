import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'
import { readViews } from '../src/features/views/runtime'
import { defaultColumnFilter } from '../src/features/filters/model'
import { createFilterPlans } from '../src/features/filters/plans'
import { createFilterOptions } from '../src/features/filters/options'
import type { Query, RowData } from '../src/types'
afterEach(() => { vi.useRealTimers() })
describe('filter configuration boundaries', () => {
  it('does not allow filter metadata to override a disabled base column', () => {
    expect(defaultColumnFilter({ id: 'secret', field: 'secret', title: '隐藏字段', filterable: false,
      filter: { enabled: true, type: 'number', source: 'data', search: true, counts: false, operators: ['eq'], options: [] } }).enabled).toBe(false)
  })
  it('rejects invalid saved view conditions instead of dropping them', () => {
    expect(() => readViews([{ id: 'view', name: '错误视图', filterGroup: { logic: 'or', rules: [{ field: 'name', operator: 'run-code', value: 'x' }] } }], 'table')).toThrow()
    expect(() => readViews([{ id: 'view', name: '错误视图', filters: [{ field: 'name', operator: 'eq', value: ['x'] }] }], 'table')).toThrow()
  })
  it('keeps the previous query when setQuery receives a malformed group', async () => {
    const wrapper = mount(BusinessTable, { props: { columns: [{ id: 'name', field: 'name', title: '名称' }], data: [{ id: 1, name: '甲' }, { id: 2, name: '乙' }] },
      global: { stubs: { 'vxe-table': { template: '<div><slot/></div>' }, 'vxe-column': { template: '<div/>' } } } })
    try {
      await flushPromises()
      const api = wrapper.vm as unknown as { setQuery(query: Partial<Query>): Promise<void>; getState(): { rows: RowData[] } }
      await api.setQuery({ filters: [{ field: 'name', operator: 'eq', value: '甲' }] })
      await expect(api.setQuery({ filters: [], filterGroup: { logic: 'or', rules: [{ field: 'name', operator: 'eq', value: ['x'] }] } })).rejects.toThrow()
      expect(api.getState().rows.map(row => row.id)).toEqual([1])
    } finally { wrapper.unmount() }
  })
  it('bounds optional plan loading and aborts a hung adapter', async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined
    const store = createFilterPlans('timeout', { load: async (_key, options) => { signal = options?.signal; return new Promise(() => {}) }, save: async () => {} })
    const result = expect(store.load()).rejects.toThrow('筛选方案读取超时')
    await vi.advanceTimersByTimeAsync(10001); await result
    expect(signal?.aborted).toBe(true); expect(store.loading.value).toBe(false); store.dispose()
  })
  it('shows an accurate option timeout without claiming that default options were loaded', async () => {
    vi.useFakeTimers()
    const options = createFilterOptions(async () => new Promise(() => {}), 50)
    const pending = options.load(''); await vi.advanceTimersByTimeAsync(51); await pending
    expect(options.error.value).toBe('筛选项加载超时，请重试。')
    expect(options.loading.value).toBe(false); options.dispose()
  })
})
