import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'
import ConfiguredBusinessTable from '../src/ConfiguredBusinessTable.vue'
import type { ConditionalFormattingContext } from '../src/features/conditional-formatting/context'
import type { RangeSelectionContext } from '../src/features/range-selection/context'
import type { ColumnConfig, DataSource, RowData } from '../src/types'
import type { PreferenceV3 } from '../src/config/types'

const columns: ColumnConfig[] = [{ id: 'name', field: 'name', title: '名称' }, { id: 'amount', field: 'amount', title: '金额', type: 'number' }]
const rules = [{ id: 'large', enabled: true, condition: { field: 'amount', operator: 'gt' as const, value: 20 }, label: '关注', color: '#92400e', background: '#fffbeb' }]
interface Api {
  activateFeature(name: string): Promise<unknown>
  getFeatureContext(name: string): unknown
  openDataTool(name: string): Promise<void>
  getRuntime(): { conditionalRule(row: RowData): { label: string } | undefined }
}
const wrappers: VueWrapper[] = []
async function setup(extra: Record<string, unknown> = {}) {
  const wrapper = mount(BusinessTable, { props: { columns, data: [{ id: 1, name: '甲', amount: 30 }], ...extra },
    global: { stubs: { 'vxe-table': { template: '<div><slot/></div>' }, 'vxe-column': { template: '<div><slot name="header"/></div>' } } } })
  wrappers.push(wrapper); await flushPromises()
  return { wrapper, api: wrapper.vm as unknown as Api }
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); localStorage.clear(); document.body.innerHTML = '' })

describe('data tools platform integration', () => {
  it('waits for the configured preference writer and keeps the old rules when durability fails', async () => {
    const savePreference = vi.fn<(preference: PreferenceV3) => Promise<void>>().mockRejectedValueOnce(new Error('保存失败')).mockResolvedValue(undefined)
    const wrapper = mount(ConfiguredBusinessTable, { props: { definition: { schemaVersion: 3, tableKey: 'configured.marks', columns,
      features: { conditionalFormatting: { enabled: true, mode: 'headless' } }, conditionalFormatting: { defaultRules: rules } }, savePreference },
      global: { stubs: { 'vxe-table': { template: '<div><slot/></div>' }, 'vxe-column': { template: '<div><slot name="header"/></div>' } } } })
    wrappers.push(wrapper); await flushPromises()
    const context = await wrapper.vm.activateFeature('conditionalFormatting') as ConditionalFormattingContext
    expect(context.rules).toEqual(rules)
    await expect(context.apply([])).rejects.toThrow('保存失败')
    expect(context.rules).toEqual(rules)
    await context.apply([])
    expect(context.rules).toEqual([])
    expect(savePreference.mock.calls[1]![0].conditionalFormatting).toEqual([])
    expect(wrapper.emitted('preferenceChange')).toHaveLength(1)
  })
  it('keeps undeclared and remotely disabled tools absent without reading details', async () => {
    const details = vi.fn(() => { throw new Error('must not read') })
    const declaration = Object.defineProperty({ enabled: true }, 'details', { get: details })
    const { wrapper, api } = await setup({ features: { grouping: declaration }, remoteFeatures: { grouping: false } })
    expect(await api.activateFeature('grouping')).toBeUndefined()
    expect(details).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="grouping"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="conditional-formatting"]').exists()).toBe(false)
  })
  it('initializes configured row marks before opening UI and gives headless consumers the same commands', async () => {
    const { wrapper, api } = await setup({ features: { conditionalFormatting: { enabled: true, mode: 'headless' } }, conditionalFormatting: { defaultRules: rules } })
    expect(api.getRuntime().conditionalRule({ amount: 30 })?.label).toBe('关注')
    const context = await api.activateFeature('conditionalFormatting') as ConditionalFormattingContext
    expect(context.rules).toEqual(rules)
    await context.apply([])
    expect(api.getRuntime().conditionalRule({ amount: 30 })).toBeUndefined()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
  it('retains existing marks in read-only mode and rejects stale commands after revocation', async () => {
    const { wrapper, api } = await setup({ features: { conditionalFormatting: { enabled: true, mode: 'headless', disabled: true } }, conditionalFormatting: { defaultRules: rules } })
    const context = await api.activateFeature('conditionalFormatting') as ConditionalFormattingContext
    expect(context.disabled).toBe(true)
    expect(api.getRuntime().conditionalRule({ amount: 30 })?.label).toBe('关注')
    await expect(context.apply([])).rejects.toThrow()
    await wrapper.setProps({ remoteFeatures: { conditionalFormatting: false } })
    expect(api.getRuntime().conditionalRule({ amount: 30 })).toBeUndefined()
    await expect(context.apply([])).rejects.toThrow()
  })
  it('activates a headless report without implicitly requesting a complete data set', async () => {
    const source: DataSource<RowData> = { query: async () => ({ rows: [], total: 0 }), readAll: vi.fn(async () => []) }
    const { api } = await setup({ dataSource: source, features: { grouping: { enabled: true, mode: 'headless' } } })
    const context = await api.activateFeature('grouping') as { reload(): Promise<void>; rows: readonly RowData[] }
    expect(context).toBeDefined(); expect(source.readAll).not.toHaveBeenCalled()
    await context.reload(); expect(source.readAll).toHaveBeenCalledOnce()
  })
  it('opens and exits a current-page range independent of row-selection mode', async () => {
    const { api } = await setup({ selection: false, features: { rangeSelection: { enabled: true, mode: 'headless' } } })
    await api.openDataTool('rangeSelection')
    const context = api.getFeatureContext('rangeSelection') as RangeSelectionContext
    expect(context.enabled).toBe(true)
    context.begin({ rowId: '1', columnId: 'amount' }); context.end()
    expect(context.count).toBe(1)
    await api.openDataTool('rangeSelection'); expect(context.enabled).toBe(false)
  })
})
