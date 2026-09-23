import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import FilterChips from '../src/features/filters/FilterChips.vue'
import BusinessTable from '../src/BusinessTable.vue'
import { readFilterPlans } from '../src/features/filters/plans'
import type { ColumnConfig, DataSource, FilterConfig, Query, ViewConfig } from '../src/types'
import type { FilterOption } from '../src/features/filters/model'

const wrappers: VueWrapper[] = []
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))
beforeAll(async () => { await import('../src/features/filters/FilterChips.vue') })
const column: ColumnConfig = {
  id: 'status', field: 'status', title: '状态', type: 'enum',
  filter: { enabled: true, type: 'multi', source: 'remote', search: true, counts: true, operators: ['in', 'notIn'], options: [] },
}
const rule = (value: FilterOption['value']): FilterConfig => ({ field: 'status', operator: 'in', value: [value] })
function chips(extra: Record<string, unknown> = {}) {
  const wrapper = mount(FilterChips, { props: { columns: [column], columnFilters: [rule(1)], ...extra } })
  wrappers.push(wrapper)
  return wrapper
}

describe('filter summaries display labels without replacing query values', () => {
  it('describes nested groups with raw typed labels even when one field occurs more than once', async () => {
    const optionsFor = vi.fn(async (_column: ColumnConfig, _search: string, _signal: AbortSignal, values?: FilterOption['value'][]) =>
      [{ value: 1, label: 'A' }, { value: '1', label: 'B' }, { value: false, label: '否' }].filter(option => values?.some(value => Object.is(value, option.value))))
    const group = { logic: 'and' as const, rules: [rule(1), { logic: 'or' as const, rules: [rule('1'), rule(false)] }] }
    const wrapper = chips({ columnFilters: [], group, optionsFor, inline: true })
    await flushPromises()
    const button = wrapper.findAll('button').find(button => button.text() === '组合条件 3 项')
    expect(button).toBeDefined()
    expect(button!.attributes('title')).toBe('状态：属于 A 且 (状态：属于 B 或 状态：属于 否)')
    expect(optionsFor).toHaveBeenCalledTimes(1)
    expect(optionsFor.mock.calls[0]![3]).toEqual([1, '1', false])
    expect(group.rules).toEqual([rule(1), { logic: 'or', rules: [rule('1'), rule(false)] }])
  })

  it('matches manual option labels by raw type and keeps the filter unchanged', () => {
    const values = [1, '1', false, null]
    const input = { field: 'status', operator: 'in' as const, value: values }
    const wrapper = chips({ columns: [{ ...column, filter: { ...column.filter, source: 'manual', options: [
      { value: 1, label: 'A' }, { value: '1', label: 'B' }, { value: false, label: '否' }, { value: null, label: '未分配' },
    ] } }], columnFilters: [input] })
    expect(wrapper.text()).toContain('状态：属于 A、B、否、未分配')
    expect(input.value).toEqual([1, '1', false, null])
  })

  it('resolves labels from remote options using the selected raw values', async () => {
    const optionsFor = vi.fn(async () => [{ value: 1, label: 'A' }, { value: '1', label: 'B' }])
    const wrapper = chips({ optionsFor })
    await flushPromises()
    expect(wrapper.text()).toContain('状态：属于 A')
    expect(optionsFor).toHaveBeenCalledWith(expect.objectContaining({ id: 'status' }), '', expect.any(AbortSignal), [1])
    expect(wrapper.props('columnFilters')).toEqual([rule(1)])
  })

  it('ignores stale remote labels after the selected value changes', async () => {
    const pending: { signal: AbortSignal; resolve: (value: FilterOption[]) => void }[] = []
    const optionsFor = vi.fn((_column: ColumnConfig, _search: string, signal: AbortSignal) => new Promise<FilterOption[]>(resolve => pending.push({ signal, resolve })))
    const wrapper = chips({ optionsFor })
    await flushPromises()
    await wrapper.setProps({ columnFilters: [rule(2)] })
    await flushPromises()
    expect(pending[0]!.signal.aborted).toBe(true)
    pending[1]!.resolve([{ value: 2, label: 'B' }])
    await flushPromises()
    pending[0]!.resolve([{ value: 1, label: '过期标签' }])
    await flushPromises()
    expect(wrapper.text()).toContain('状态：属于 B')
    expect(wrapper.text()).not.toContain('过期标签')
  })

  it('falls back to the raw value when a remote label lookup fails', async () => {
    const wrapper = chips({ optionsFor: async () => { throw new Error('offline') } })
    await flushPromises()
    expect(wrapper.text()).toContain('状态：属于 1')
  })

  it('restores backend View labels while Query, View and filter-plan persistence retain numeric values', async () => {
    const queries: Query[] = []
    const options = vi.fn<NonNullable<DataSource<Record<string, unknown>>['options']>>(async () => [{ value: 1, label: 'A' }])
    const wrapper = mount(BusinessTable, {
      props: { columns: [column], features: { filters: true }, dataSource: { query: async query => { queries.push(query); return { rows: [], total: 0 } }, options } },
      global: { stubs: { 'vxe-table': { template: '<div><slot /></div>' }, 'vxe-column': true } },
    })
    wrappers.push(wrapper)
    await flushPromises()
    const api = wrapper.vm as unknown as { applyView(view: ViewConfig): Promise<void>; viewSnapshot(): ViewConfig }
    const saved: ViewConfig = JSON.parse(JSON.stringify({ id: 'backend-view', name: '后台视图', columnFilters: [rule(1)] }))
    await api.applyView(saved)
    await vi.waitFor(() => expect(wrapper.text()).toContain('状态：属于 A'))
    expect(options).toHaveBeenCalledWith(expect.objectContaining({ id: 'status' }), expect.any(Object), expect.objectContaining({ values: [1] }))
    expect(queries.at(-1)?.columnFilters).toEqual([rule(1)])
    expect(api.viewSnapshot().columnFilters).toEqual([rule(1)])
    const plans = readFilterPlans(JSON.stringify({ kind: 'business-table-filter-plans', version: 1, tableKey: 'summary', plans: [{ id: 'saved', name: '方案', columnFilters: api.viewSnapshot().columnFilters }] }), 'summary')
    expect(plans[0]!.columnFilters).toEqual([rule(1)])
    expect(JSON.stringify(api.viewSnapshot().columnFilters)).not.toContain('label')
  })

  it('refreshes a selected raw value label after its provider changes', async () => {
    const firstOptions = vi.fn(async () => [{ value: 1, label: 'A' }])
    const secondOptions = vi.fn(async () => [{ value: 1, label: 'B' }])
    const provider = (options: NonNullable<DataSource<Record<string, unknown>>['options']>) => ({ query: async () => ({ rows: [], total: 0 }), options })
    const wrapper = mount(BusinessTable, {
      props: { columns: [column], features: { filters: true }, dataSource: provider(firstOptions) },
      global: { stubs: { 'vxe-table': { template: '<div><slot /></div>' }, 'vxe-column': true } },
    })
    wrappers.push(wrapper)
    await flushPromises()
    const api = wrapper.vm as unknown as { setFilterState(value: { columnFilters: FilterConfig[] }): Promise<void> }
    await api.setFilterState({ columnFilters: [rule(1)] })
    await vi.waitFor(() => expect(wrapper.text()).toContain('状态：属于 A'))
    await wrapper.setProps({ dataSource: provider(secondOptions) })
    await vi.waitFor(() => expect(wrapper.text()).toContain('状态：属于 B'))
    expect(secondOptions).toHaveBeenCalledTimes(1)
  })

  it('aborts obsolete provider labels even when its options function ignores cancellation', async () => {
    let resolve!: (options: FilterOption[]) => void
    const firstOptions = vi.fn<NonNullable<DataSource<Record<string, unknown>>['options']>>(() => new Promise<FilterOption[]>(accept => { resolve = accept }))
    const query = async () => ({ rows: [], total: 0 })
    const wrapper = mount(BusinessTable, {
      props: { columns: [column], features: { filters: true }, dataSource: { query, options: firstOptions } },
      global: { stubs: { 'vxe-table': { template: '<div><slot /></div>' }, 'vxe-column': true } },
    })
    wrappers.push(wrapper)
    await flushPromises()
    const api = wrapper.vm as unknown as { setFilterState(value: { columnFilters: FilterConfig[] }): Promise<void> }
    await api.setFilterState({ columnFilters: [rule(1)] })
    await vi.waitFor(() => expect(firstOptions).toHaveBeenCalledTimes(1))
    await wrapper.setProps({ dataSource: { query, options: async () => [{ value: 1, label: 'B' }] } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('状态：属于 B'))
    expect(firstOptions.mock.calls[0]![2].signal?.aborted).toBe(true)
    resolve([{ value: 1, label: '旧来源' }]); await flushPromises()
    expect(wrapper.text()).toContain('状态：属于 B')
    expect(wrapper.text()).not.toContain('旧来源')
  })

  it('refreshes for changed query criteria but not for page navigation', async () => {
    const options = vi.fn<NonNullable<DataSource<Record<string, unknown>>['options']>>(async (_column, query) => [{ value: 1, label: query.keyword ? 'B' : 'A' }])
    const wrapper = mount(BusinessTable, {
      props: { columns: [column], features: { filters: true }, pagination: { pageSize: 10 }, dataSource: { query: async () => ({ rows: [], total: 100 }), options } },
      global: { stubs: { 'vxe-table': { template: '<div><slot /></div>' }, 'vxe-column': true } },
    })
    wrappers.push(wrapper)
    await flushPromises()
    const api = wrapper.vm as unknown as { setFilterState(value: { columnFilters: FilterConfig[] }): Promise<void>; setQuery(value: { keyword: string }): Promise<void>; getRuntime(): { goPage(value: number): void } }
    await api.setFilterState({ columnFilters: [rule(1)] })
    await vi.waitFor(() => expect(wrapper.text()).toContain('状态：属于 A'))
    api.getRuntime().goPage(2); await flushPromises()
    expect(options).toHaveBeenCalledTimes(1)
    await api.setQuery({ keyword: 'another-scope' })
    await vi.waitFor(() => expect(wrapper.text()).toContain('状态：属于 B'))
    expect(options).toHaveBeenCalledTimes(2)
  })
})
