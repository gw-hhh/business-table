import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'
import type { FiltersContext } from '../src/features/filters/context'
import type { FilterPlanPersistence, FilterPlansEnvelope } from '../src/features/filters/plans'
import type { SearchContext } from '../src/runtime/query'
import type { ColumnConfig, Query, RowData, ViewConfig } from '../src/types'

const columns: ColumnConfig[] = [
  { id: 'name', field: 'name', title: '名称', type: 'text', sortable: true },
  { id: 'status', field: 'status', title: '状态', type: 'enum' },
  { id: 'amount', field: 'amount', title: '金额', type: 'number' },
]
const rows = [{ id: 1, name: '甲', status: 1, amount: 10 }]
const searchDefinition = {
  resetBehavior: 'default',
  items: [
    { id: 'name', kind: 'text', label: '名称', field: 'name', operator: 'eq', defaultValue: '默认' },
    { id: 'status', kind: 'select', label: '状态', field: 'status', defaultValue: 0,
      options: [{ value: 0, label: '待处理' }, { value: 1, label: '已完成' }, { value: 2, label: '已归档' }] },
  ],
}
interface Api {
  activateFeature(name: 'filters'): Promise<FiltersContext | undefined>
  getFeatureContext(name: 'filters'): FiltersContext | undefined
  getFeatureContext(name: 'search'): SearchContext | undefined
  getState(): { rows: RowData[]; query: Query }
  openFilters(): Promise<void>
  applyView(view: ViewConfig): Promise<void>
  viewSnapshot(): ViewConfig
  clearQuery(): Promise<void>
}
const wrappers: VueWrapper[] = []
async function setup(extra: Record<string, unknown> = {}) {
  const queries: Query[] = []
  const wrapper = mount(BusinessTable, {
    attachTo: document.body,
    props: { tableKey: 'query-filter.fixture', columns, data: rows, features: { filters: true, search: true },
      searchDefinition, onQueryChange: (query: Query) => queries.push(query), ...extra },
    global: { stubs: {
      'vxe-table': { props: ['data'], template: '<div><slot/></div>' },
      'vxe-column': { template: '<div><slot name="header"/></div>' },
    } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, api: wrapper.vm as unknown as Api, queries }
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ''; localStorage.clear() })

describe('shared Filter plans runtime', () => {
  it.each(['headless', 'custom'] as const)('shares durable plans with %s consumers and returns guarded independent copies', async mode => {
    let saved: FilterPlansEnvelope | undefined
    const persistence: FilterPlanPersistence = {
      load: vi.fn(async () => saved ?? null),
      save: vi.fn(async (_key, value) => { saved = value }),
    }
    const { wrapper, api } = await setup({ features: { filters: { enabled: true, mode, loadStrategy: 'on-interaction' } }, filterPlanPersistence: persistence })
    const context = await api.activateFeature('filters')
    expect(context?.plans).toBeDefined()
    expect(persistence.load).not.toHaveBeenCalled()
    await context!.plans!.load()
    const id = await context!.plans!.save('金额较高', { columnFilters: [{ field: 'amount', operator: 'gte', value: 20 }],
      filterGroup: { logic: 'and', rules: [{ field: 'status', operator: 'in', value: [1, false] }] } })
    const first = context!.readPlan(id)
    first.columnFilters[0]!.value = 99
    expect(context!.readPlan(id).columnFilters[0]!.value).toBe(20)
    expect(saved?.plans[0]?.columnFilters[0]?.value).toBe(20)
    expect(context!.readPlan(id).filterGroup?.rules[0]).toEqual({ field: 'status', operator: 'in', value: [1, false] })

    await wrapper.setProps({ columns: columns.map(column => column.id === 'amount' ? { ...column, filterable: false } : column) })
    expect(() => context!.readPlan(id)).toThrow('不可用')
    await expect(context!.plans!.save('失效方案', { columnFilters: [{ field: 'amount', operator: 'gte', value: 30 }] })).rejects.toThrow('不可用')
    expect(persistence.save).toHaveBeenCalledTimes(1)
    expect(() => context!.readPlan('missing')).toThrow()
  })

  it('keeps plans through drawer close, then releases them on feature revocation', async () => {
    const { wrapper, api } = await setup()
    await api.openFilters()
    const context = api.getFeatureContext('filters')!
    const plans = context.plans!
    await plans.load()
    context.close()
    await api.openFilters()
    expect(api.getFeatureContext('filters')?.plans).toBe(plans)
    await wrapper.setProps({ features: { filters: false, search: true } })
    await expect(plans.save('不再生效', { columnFilters: [] })).rejects.toThrow()
    await expect(plans.load()).rejects.toThrow()
    expect(() => context.readPlan('missing')).toThrow('失效')
  })

  it('does not expose plans without persistence or publish failed writes', async () => {
    const disabled = await setup({ features: { filters: { enabled: true, mode: 'headless', loadStrategy: 'on-interaction' } }, filterPlanPersistence: null })
    expect((await disabled.api.activateFeature('filters'))?.plans).toBeUndefined()
    expect(() => disabled.api.getFeatureContext('filters')!.readPlan('missing')).toThrow()

    const persistence: FilterPlanPersistence = { load: async () => null, save: async () => { throw new Error('存储不可用') } }
    const enabled = await setup({ features: { filters: { enabled: true, mode: 'headless', loadStrategy: 'on-interaction' } }, filterPlanPersistence: persistence })
    const plans = (await enabled.api.activateFeature('filters'))!.plans!
    await plans.load()
    await expect(plans.save('失败', { columnFilters: [] })).rejects.toThrow('存储不可用')
    expect(plans.plans.value).toEqual([])
  })
})

describe('Query Runtime commands', () => {
  it('removes one applied Search item without submitting unrelated draft edits', async () => {
    const { api, queries } = await setup()
    await api.applyView({ id: 'saved', name: '已保存', search: { values: { name: '甲', status: 1 } } })
    const context = api.getFeatureContext('search')!
    context.setValue('name', '草稿名称')
    context.setValue('status', 2)
    const before = queries.length
    await context.remove('name')
    expect(queries).toHaveLength(before + 1)
    expect(queries.at(-1)?.filters).toEqual([{ field: 'status', operator: 'eq', value: 1 }])
    expect(context.appliedValues).toEqual({ status: 1 })
    expect(context.values).toEqual({ status: 2 })
    expect(context.pending).toBe(true)
    expect(api.viewSnapshot().search?.values).toEqual({ status: 1 })
    await expect(context.remove('missing')).rejects.toThrow('不可用')
  })

  it.each(['default', 'empty'] as const)('clears all query layers in one remote request and keeps sort and view for %s reset', async resetBehavior => {
    const requests: Query[] = []
    const dataSource = { query: vi.fn(async (query: Query) => {
      requests.push(query)
      return { rows, total: rows.length }
    }) }
    const { api } = await setup({ data: undefined, dataSource, searchDefinition: { ...searchDefinition, resetBehavior } })
    await api.applyView({ id: 'saved', name: '已保存', keyword: '旧关键词', search: { values: { name: '甲', status: 1 } },
      filters: [{ field: 'name', operator: 'contains', value: '甲' }],
      columnFilters: [{ field: 'amount', operator: 'gte', value: 10 }],
      filterGroup: { logic: 'and', rules: [{ logic: 'or', rules: [{ field: 'status', operator: 'in', value: [1] }] }] },
      sorts: [{ field: 'name', order: 'desc' }],
    })
    const before = requests.length
    await api.clearQuery()
    await flushPromises()
    expect(requests).toHaveLength(before + 1)
    const current = requests.at(-1)!
    expect(current.keyword).toBe('')
    expect(current.filters).toEqual(resetBehavior === 'default' ? [
      { field: 'name', operator: 'eq', value: '默认' }, { field: 'status', operator: 'eq', value: 0 },
    ] : [])
    expect(current.columnFilters).toBeUndefined()
    expect(current.filterGroup).toBeUndefined()
    expect(current.sorts).toEqual([{ field: 'name', order: 'desc' }])
    expect(current.viewId).toBe('saved')
    expect(current.page).toBe(1)
    expect(api.viewSnapshot().search?.values).toEqual(resetBehavior === 'default' ? { name: '默认', status: 0 } : {})
  })
})
