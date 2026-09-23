import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'
import SearchSummary from '../src/components/SearchSummary.vue'
import type { SearchContext } from '../src/runtime/query'
import type { Query, ViewConfig } from '../src/types'

const wrappers: VueWrapper[] = []
// Compile lazy presentation outside the interaction budget; E2E checks actual lazy loading.
beforeAll(async () => { await Promise.all([import('../src/features/filters/FilterChips.vue'), import('../src/components/QuerySummary.vue')]) })
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))
async function setup() {
  const query = vi.fn(async (_query: Query) => ({ rows: [], total: 0 }))
  const wrapper = mount(BusinessTable, {
    props: {
      querySummary: true,
      columns: [{ id: 'amount', field: 'amount', title: '金额', type: 'number', sortable: true }],
      features: { filters: true, search: { enabled: true, mode: 'headless' } },
      searchDefinition: { resetBehavior: 'empty', items: [
        { id: 'keyword', label: '关键词', kind: 'keyword' },
        { id: 'status', label: '状态', kind: 'select', field: 'status', options: [{ value: 1, label: 'A' }] },
      ] },
      dataSource: { query },
    },
    global: { stubs: { 'vxe-table': { template: '<div><slot /></div>' }, 'vxe-column': true } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  const api = wrapper.vm as unknown as {
    applyView(view: ViewConfig): Promise<void>
    getFeatureContext(name: 'search'): SearchContext
  }
  return { wrapper, api, query, search: api.getFeatureContext('search') }
}

describe('unified query summary', () => {
  it('clears all applied layers in one request while retaining sort and view identity', async () => {
    const { wrapper, api, query } = await setup()
    await api.applyView({ id: 'view', name: '全部层', keyword: '报价',
      filters: [{ field: 'status', operator: 'eq', value: 1 }],
      columnFilters: [{ field: 'amount', operator: 'gte', value: 100 }],
      filterGroup: { logic: 'or', rules: [{ field: 'amount', operator: 'lte', value: 900 }] },
      sorts: [{ field: 'amount', order: 'desc' }],
    })
    await vi.waitFor(() => expect(wrapper.find('.bt-search-summary').exists()).toBe(true))
    const summary = wrapper.get('.bt-search-summary')
    expect(summary.text()).toContain('关键词：报价')
    expect(summary.text()).toContain('状态：A')
    await vi.waitFor(() => expect(summary.text()).toContain('金额：大于等于 100'))
    expect(summary.text()).toContain('组合条件 1 项')
    expect(wrapper.findAll('.bt-search-summary__clear')).toHaveLength(1)
    expect(query.mock.calls.at(-1)![0].sorts).toEqual([{ field: 'amount', order: 'desc' }])
    query.mockClear()
    await summary.get('.bt-search-summary__clear').trigger('click')
    await flushPromises()
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]![0]).toMatchObject({ keyword: '', filters: [], sorts: [{ field: 'amount', order: 'desc' }], viewId: 'view' })
    expect(query.mock.calls[0]![0].columnFilters).toBeUndefined()
    expect(query.mock.calls[0]![0].filterGroup).toBeUndefined()
    expect(wrapper.find('.bt-search-summary').exists()).toBe(false)
  })

  it('removes an applied tag without applying another pending input in the compatible SearchSummary', async () => {
    const { search, query } = await setup()
    search.setValue('status', 1)
    await search.submit()
    search.setValue('keyword', '未查询')
    const wrapper = mount(SearchSummary, { props: { context: search } })
    wrappers.push(wrapper)
    query.mockClear()
    await wrapper.get('button[aria-label="移除状态：A"]').trigger('click')
    await flushPromises()
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]![0].keyword).toBe('')
    expect(search.getValue('keyword')).toBe('未查询')
    expect(search.pending).toBe(true)
    expect(wrapper.text()).toContain('条件已修改，点击查询生效')
  })
})
