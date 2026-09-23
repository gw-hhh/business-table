import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'
import type { ColumnConfig, Query, RowData } from '../src/types'
import type { FiltersContext } from '../src/features/filters/context'
import type { FilterState } from '../src/features/filters/editor'

const columns: ColumnConfig[] = [
  { id: 'name', field: 'name', title: '名称', type: 'text' },
  { id: 'amount', field: 'amount', title: '金额', type: 'number' },
  { id: 'status', field: 'status', title: '状态', type: 'enum' },
]
const rows = [{ id: 1, name: '甲', amount: 10, status: 1 }, { id: 2, name: '甲', amount: 20, status: '1' }, { id: 3, name: '乙', amount: 30, status: false }]
interface Api {
  openFilters(columnId?: string): Promise<void>
  setFilterState(state: FilterState): Promise<void>
  setQuery(change: Partial<Query>): Promise<void>
  getState(): { rows: RowData[]; query: Query; page: number }
  activateFeature(name: 'filters'): Promise<FiltersContext | undefined>
  getFeatureContext(name: 'filters'): FiltersContext | undefined
}
const wrappers: VueWrapper[] = []
async function setup(props: Record<string, unknown> = {}) {
  const wrapper = mount(BusinessTable, { attachTo: document.body, props: { tableKey: 'filter.fixture', columns, data: rows, features: { filters: true }, ...props },
    global: { stubs: { 'vxe-table': { props: ['data'], template: '<div><div v-for="row in data" :key="row.id" class="row">{{row.id}}</div><slot/></div>' },
      'vxe-column': { template: '<div><slot name="header"/></div>' } } } })
  wrappers.push(wrapper); await flushPromises()
  return { wrapper, api: wrapper.vm as unknown as Api }
}
const dialog = (title: string) => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${title}"]`)
async function click(root: Element, text: string) {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === text)
  expect(button, `button ${text}`).toBeDefined(); button!.click(); await flushPromises()
}
async function change(root: Element, label: string, value: string) {
  const input = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)
  expect(input, `input ${label}`).toBeTruthy(); input!.value = value
  input!.dispatchEvent(new Event(input!.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await flushPromises()
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ''; localStorage.clear() })

describe('first-party filter feature', () => {
  it('does not inspect closed feature details or render any filter UI', async () => {
    let reads = 0
    const declaration = Object.defineProperty({ enabled: false }, 'details', { get() { reads++; throw new Error('must not read') } })
    const { wrapper } = await setup({ features: { filters: declaration } })
    expect(reads).toBe(0)
    expect(wrapper.find('[data-testid="combined-filter"]').exists()).toBe(false)
    expect(wrapper.find('.bt__column-filter').exists()).toBe(false)
  })
  it('edits a private column draft and discards it on cancel', async () => {
    const { api } = await setup(); expect(typeof api.openFilters).toBe('function')
    await api.openFilters('amount'); await flushPromises()
    const panel = dialog('筛选 · 金额')!; expect(panel).toBeTruthy()
    await change(panel, '筛选条件', 'gte'); await change(panel, '筛选值', '15')
    expect(api.getState().query.columnFilters).toBeUndefined()
    await click(panel, '取消'); expect(dialog('筛选 · 金额')).toBeNull()
    expect(api.getState().rows.map(row => row.id)).toEqual([1, 2, 3])
  })
  it('applies once, resets the page, and clears only the selected column', async () => {
    const { api } = await setup(); expect(typeof api.openFilters).toBe('function')
    await api.setQuery({ filters: [{ field: 'name', operator: 'eq', value: '甲' }] })
    await api.openFilters('amount'); await flushPromises()
    const panel = dialog('筛选 · 金额')!
    await change(panel, '筛选条件', 'gte'); await change(panel, '筛选值', '15'); await click(panel, '应用筛选')
    expect(api.getState().rows.map(row => row.id)).toEqual([2]); expect(api.getState().page).toBe(1)
    await api.openFilters('amount'); await flushPromises(); await click(dialog('筛选 · 金额')!, '清除此列')
    expect(api.getState().rows.map(row => row.id)).toEqual([1, 2])
    expect(api.getState().query.filters).toEqual([{ field: 'name', operator: 'eq', value: '甲' }])
  })
  it('keeps invalid values in the editor and leaves the previous result unchanged', async () => {
    const { api } = await setup(); expect(typeof api.openFilters).toBe('function')
    await api.openFilters('amount'); await flushPromises()
    await change(dialog('筛选 · 金额')!, '筛选值', 'not a number'); await click(dialog('筛选 · 金额')!, '应用筛选')
    expect(dialog('筛选 · 金额')?.querySelector('[role="alert"]')?.textContent).toContain('数字')
    expect(api.getState().rows).toHaveLength(3)
  })
  it('provides the same guarded operations to headless consumers without a dialog', async () => {
    const { api } = await setup({ features: { filters: { enabled: true, mode: 'headless', loadStrategy: 'on-interaction' } } })
    const context = await api.activateFeature('filters'); expect(context).toBeDefined()
    await context!.apply({ columnFilters: [], filterGroup: { logic: 'or', rules: [{ field: 'status', operator: 'in', value: [1, false] }] } })
    expect(api.getState().rows.map(row => row.id)).toEqual([1, 3]); expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  it('rejects stale contexts after revocation and does not query again', async () => {
    const { api, wrapper } = await setup({ features: { filters: { enabled: true, mode: 'headless', loadStrategy: 'on-interaction' } } })
    const context = await api.activateFeature('filters'); expect(context).toBeDefined()
    await wrapper.setProps({ features: { filters: false } })
    await expect(context!.apply({ columnFilters: [{ field: 'amount', operator: 'gt', value: 15 }] })).rejects.toThrow('失效')
    expect(api.getState().rows).toHaveLength(3)
  })
  it('guards current field/operator capabilities for both direct and headless commands', async () => {
    const { api, wrapper } = await setup({ features: { filters: { enabled: true, mode: 'headless', loadStrategy: 'on-interaction' } } })
    const context = await api.activateFeature('filters'); expect(context).toBeDefined()
    await wrapper.setProps({ columns: columns.map(column => column.id === 'amount' ? { ...column, filterable: false } : column) })
    await expect(context!.apply({ columnFilters: [{ field: 'amount', operator: 'gte', value: 15 }] })).rejects.toThrow()
    expect(api.getState().rows).toHaveLength(3)
  })
  it('rejects an invalid combined expression atomically instead of broadening the query', async () => {
    const { api } = await setup(); expect(typeof api.setFilterState).toBe('function')
    await api.setFilterState({ columnFilters: [{ field: 'amount', operator: 'gte', value: 15 }] })
    await expect(api.setFilterState({ columnFilters: [], filterGroup: { logic: 'or', rules: [{ field: 'amount', operator: 'eq', value: [1] }] } })).rejects.toThrow()
    expect(api.getState().rows.map(row => row.id)).toEqual([2, 3])
  })
  it('keeps unavailable saved conditions explicit and requires a deliberate reset before applying', async () => {
    const { api, wrapper } = await setup()
    const errors: unknown[] = []
    wrapper.vm.$.appContext.config.errorHandler = error => errors.push(error)
    await api.setFilterState({ columnFilters: [], filterGroup: { logic: 'and', rules: [{ field: 'name', operator: 'eq', value: '甲' }] } })
    await wrapper.setProps({ columns: columns.filter(column => column.id !== 'name') })
    await api.openFilters(); await flushPromises()
    expect(errors).toEqual([])
    const panel = dialog('组合筛选')!
    expect(panel.querySelector('[role="alert"]')?.textContent).toContain('不可用')
    const apply = Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === '应用条件')!
    expect(apply.disabled).toBe(true)
    expect(api.getState().rows.map(row => row.id)).toEqual([1, 2])
    await click(panel, '清空失效条件')
    await click(panel, '应用条件')
    expect(api.getState().rows.map(row => row.id)).toEqual([1, 2, 3])
  })
  it('keeps plan writes disabled after a read failure and allows a safe retry without changing results', async () => {
    let failed = true
    const { api } = await setup({ filterPlanPersistence: {
      load: async () => { if (failed) throw new Error('读取服务不可用'); return null }, save: async () => {}
    } })
    await api.openFilters(); await flushPromises()
    const panel = dialog('组合筛选')!
    const save = () => Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === '保存为方案')!
    expect(save().disabled).toBe(true)
    expect(panel.querySelector('[role="alert"]')?.textContent).toContain('读取服务不可用')
    failed = false; await click(panel, '重新读取')
    expect(save().disabled).toBe(false)
    expect(api.getState().rows).toHaveLength(3)
  })
  it('does not close or publish a named plan after an adapter save failure', async () => {
    const { api } = await setup({ filterPlanPersistence: { load: async () => null, save: async () => { throw new Error('存储不可用') } } })
    expect(typeof api.openFilters).toBe('function')
    await api.openFilters(); await flushPromises()
    await click(dialog('组合筛选')!, '保存为方案')
    const panel = dialog('保存筛选方案')!; await change(panel, '方案名称', '常用条件'); await click(panel, '保存')
    expect(dialog('保存筛选方案')).toBeTruthy()
    expect(dialog('保存筛选方案')?.querySelector('[role="alert"]')?.textContent).toContain('存储不可用')
  })
})
