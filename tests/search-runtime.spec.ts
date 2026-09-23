import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'
import { viewQueryEquals } from '../src/features/views/runtime'
import { normalizeSearchDefinition } from '../src/features/search/model'
import type { FilterConfig, Query, RowData, ViewConfig } from '../src/types'

const columns = [
  { id: 'id', field: 'id', title: '编号' },
  { id: 'customer', field: 'customer', title: '客户' },
  { id: 'status', field: 'status', title: '状态', type: 'number' as const },
  { id: 'amount', field: 'amount', title: '金额', type: 'number' as const },
  { id: 'createdAt', field: 'createdAt', title: '创建日期', type: 'date' as const },
]
const rows = [
  { id: 'Q1', customer: '甲', status: 1, amount: 10, createdAt: '2026-09-01' },
  { id: 'Q2', customer: '乙', status: 2, amount: 20, createdAt: '2026-09-02' },
  { id: 'Q3', customer: '乙', status: 1, amount: 30, createdAt: '2026-09-03' },
]
const searchDefinition = {
  items: [
    { id: 'keyword', label: '关键词', kind: 'keyword', defaultValue: '' },
    { id: 'customer', label: '客户', kind: 'text', field: 'customer', operator: 'eq', defaultValue: '' },
    { id: 'status', label: '状态', kind: 'select', field: 'status', defaultValue: null,
      options: [{ label: '待处理', value: 1 }, { label: '已完成', value: 2 }] },
    { id: 'createdFrom', label: '开始日期', kind: 'date', field: 'createdAt', operator: 'gte', advanced: true },
    { id: 'createdTo', label: '结束日期', kind: 'date', field: 'createdAt', operator: 'lte', advanced: true },
  ],
  resetBehavior: 'default',
}
interface Api {
  getState(): { rows: RowData[]; total: number; page: number; query: Query }
  viewSnapshot(): ViewConfig
  applyView(view: ViewConfig): Promise<void>
  setQuery(value: Partial<Query>): Promise<void>
  setFilterState(value: { columnFilters: FilterConfig[] }): Promise<void>
  getFeatureContext(name: 'search'): { getValue(id: string): unknown; setValue(id: string, value: unknown): void; submit(): Promise<void>; reset(): Promise<void>; pending: boolean } | undefined
}
const wrappers: VueWrapper[] = []
beforeAll(async () => { await import('../src/components/TableSearch.vue') })
async function setup(extra: Record<string, unknown> = {}) {
  const queries: Query[] = []
  const wrapper = mount(BusinessTable, {
    props: {
      tableKey: 'search.fixture', columns, data: rows,
      features: { search: true, filters: true }, searchDefinition,
      pagination: { pageSize: 2, pageSizeOptions: [2, 3] },
      onQueryChange: (value: Query) => queries.push(value), ...extra,
    },
    global: { stubs: {
      'vxe-table': { props: ['data'], template: '<div><div v-for="row in data" :key="row.id" class="row">{{row.id}}</div><slot/></div>' },
      'vxe-column': { template: '<div><slot name="header"/></div>' },
    } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, api: wrapper.vm as unknown as Api, queries }
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = '' })

describe('Search Feature and Query Runtime', () => {
  it('keeps multi-field drafts separate until submit and projects typed filters once', async () => {
    const { wrapper, api, queries } = await setup()
    const initial = queries.length
    await wrapper.get('input[aria-label="客户"]').setValue('乙')
    await wrapper.get('select[aria-label="状态"]').setValue('1')
    expect(queries).toHaveLength(initial)
    expect(api.getFeatureContext('search')?.pending).toBe(true)

    await wrapper.get('button[type="submit"]').trigger('click')
    await flushPromises()
    expect(queries).toHaveLength(initial + 1)
    expect(queries.at(-1)).toMatchObject({ page: 1, filters: [
      { field: 'customer', operator: 'eq', value: '乙' },
      { field: 'status', operator: 'eq', value: 1 },
    ] })
    expect(api.getState().rows.map(row => row.id)).toEqual(['Q3'])
    expect(api.getFeatureContext('search')?.pending).toBe(false)
  })

  it('rejects an inverted date range without replacing the applied query', async () => {
    const { wrapper, api, queries } = await setup()
    const initial = queries.length
    await wrapper.get('input[aria-label="开始日期"]').setValue('2026-09-03')
    await wrapper.get('input[aria-label="结束日期"]').setValue('2026-09-01')
    await wrapper.get('button[type="submit"]').trigger('click')
    await flushPromises()

    expect(queries).toHaveLength(initial)
    expect(api.getState().rows.map(row => row.id)).toEqual(['Q1', 'Q2'])
    expect(wrapper.get('[role="alert"]').text()).toContain('日期')
  })

  it('stores search values by stable ID and restores them with advanced conditions', async () => {
    const { api } = await setup()
    const context = api.getFeatureContext('search')!
    context.setValue('customer', '乙')
    context.setValue('status', 1)
    await context.submit()
    await api.setFilterState({ columnFilters: [{ field: 'amount', operator: 'gte', value: 20 }] })
    const snapshot = api.viewSnapshot()
    expect(snapshot.search?.values).toMatchObject({ customer: '乙', status: 1 })
    expect(snapshot.filters).toEqual([])

    await api.applyView({ id: 'other', name: '其他', filters: [], columnFilters: [] })
    expect(api.getState().query.filters).toEqual([])
    await api.applyView({ ...snapshot, id: 'saved', name: '已保存' })
    expect(api.getState().query.filters).toEqual([
      { field: 'customer', operator: 'eq', value: '乙' },
      { field: 'status', operator: 'eq', value: 1 },
    ])
    expect(api.getState().query.columnFilters).toEqual([{ field: 'amount', operator: 'gte', value: 20 }])
    expect(api.getState().rows.map(row => row.id)).toEqual(['Q3'])
    expect(context.getValue('customer')).toBe('乙')
  })

  it('migrates legacy flat view filters into Search values without duplicate conditions', async () => {
    const { api } = await setup()
    await api.applyView({ id: 'old', name: '旧视图', keyword: 'Q3', filters: [
      { field: 'customer', operator: 'eq', value: '乙' },
      { field: 'status', operator: 'eq', value: 1 },
    ] })
    expect(api.getFeatureContext('search')?.getValue('customer')).toBe('乙')
    expect(api.getState().query.filters).toHaveLength(2)
    expect(api.getState().query.keyword).toBe('Q3')
    expect(api.viewSnapshot().filters).toEqual([])
  })

  it('resets to effective defaults when a view omits Search and page size', async () => {
    const { api } = await setup({ searchDefinition: { ...searchDefinition, items: searchDefinition.items.map(item => item.id === 'status' ? { ...item, defaultValue: 1 } : item) } })
    await api.applyView({ id: 'wide', name: '宽视图', pageSize: 3, search: { values: { keyword: 'Q2', status: 2 } } })
    expect(api.getState().query.pageSize).toBe(3)
    await api.applyView({ id: 'plain', name: '基础视图' })
    expect(api.getState().query.pageSize).toBe(2)
    expect(api.getState().query.keyword).toBe('')
    expect(api.getFeatureContext('search')?.getValue('status')).toBe(1)
  })

  it('keeps an explicitly empty reset empty across View save and restore', async () => {
    const definition = { ...searchDefinition, resetBehavior: 'empty', items: searchDefinition.items.map(item => item.id === 'customer' ? { ...item, defaultValue: '甲' } : item) }
    const { api } = await setup({ searchDefinition: definition })
    const context = api.getFeatureContext('search')!
    expect(api.getState().query.filters).toEqual([{ field: 'customer', operator: 'eq', value: '甲' }])
    await context.reset()
    expect(api.getState().query.filters).toEqual([])
    const saved = api.viewSnapshot()
    expect(saved.search?.values).toEqual({})
    await api.applyView({ ...saved, id: 'saved', name: '清空' })
    expect(api.getState().query.filters).toEqual([])
  })

  it('preserves Core keyword when Search has no keyword item', async () => {
    const definition = { resetBehavior: 'default', items: [{ id: 'customer', kind: 'text', field: 'customer', operator: 'eq' }] }
    const { api } = await setup({ searchDefinition: definition })
    await api.setQuery({ keyword: 'Q3' })
    expect(api.getState().query.keyword).toBe('Q3')
    expect(api.getState().rows.map(row => row.id)).toEqual(['Q3'])
  })

  it('intersects remote Search fields with definition IDs and reloads after revocation', async () => {
    const remote = { search: { enabled: true, details: { allowedItems: ['customer', 'status'] } } }
    const { wrapper, api, queries } = await setup({ remoteFeatures: remote })
    const context = api.getFeatureContext('search')!
    context.setValue('customer', '乙')
    await context.submit()
    const count = queries.length
    await wrapper.setProps({ remoteFeatures: { search: { enabled: true, details: { allowedItems: ['status'] } } } })
    await flushPromises()
    expect(queries.length).toBeGreaterThan(count)
    expect(api.getState().query.filters).toEqual([])
    expect(api.getState().total).toBe(3)
    expect(() => context.setValue('customer', '甲')).toThrow()
  })

  it('compares migrated legacy Views by canonical Search values', async () => {
    const { api } = await setup()
    const old: ViewConfig = { id: 'old', name: '旧视图', keyword: 'Q3', filters: [{ field: 'customer', operator: 'eq', value: '乙' }] }
    await api.applyView(old)
    const snapshot = api.viewSnapshot()
    const definition = normalizeSearchDefinition(searchDefinition)
    expect(viewQueryEquals(old, snapshot, { definition })).toBe(true)
    const reversed = { ...snapshot, search: { values: Object.fromEntries(Object.entries(snapshot.search?.values ?? {}).reverse()) } }
    expect(viewQueryEquals(reversed, snapshot, { definition })).toBe(true)
  })

  it('does not read a disabled Search definition or create Search context', async () => {
    let reads = 0
    const guarded = Object.defineProperty({}, 'items', { get() { reads++; throw new Error('disabled Search read') } })
    const { api } = await setup({ features: { search: false }, searchDefinition: guarded })
    expect(reads).toBe(0)
    expect(api.getFeatureContext('search')).toBeUndefined()
  })
})
