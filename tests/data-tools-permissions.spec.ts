import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import BusinessTable from '../src/BusinessTable.vue'
import FeatureHost from '../src/components/FeatureHost.vue'
import type { ReportsContext } from '../src/features/reports/context'
import type { RangeSelectionContext } from '../src/features/range-selection/context'
import type { ColumnConfig, RowData } from '../src/types'

const columns: ColumnConfig[] = [
  { id: 'name', field: 'name', title: '名称', type: 'text' },
  { id: 'amount', field: 'amount', title: '金额', type: 'number' },
]
const data = [{ id: 1, name: '甲', amount: 30 }]
const declaration = { enabled: true, mode: 'headless' as const }
type Tool = 'grouping' | 'compare' | 'rangeSelection'
interface Api {
  activateFeature(name: Tool): Promise<unknown>
  getFeatureContext(name: Tool): unknown
  openDataTool(name: Tool): Promise<void>
}
const mounted: VueWrapper[] = []
function remote(allowedItems: string[]) {
  return {
    grouping: { details: { allowedItems } },
    compare: { details: { allowedItems } },
    rangeSelection: { details: { allowedItems } },
  }
}
async function setup(allowedItems: string[], extra: Record<string, unknown> = {}) {
  const wrapper = mount(BusinessTable, { props: { columns, data, features: { grouping: declaration, compare: declaration, rangeSelection: declaration }, remoteFeatures: remote(allowedItems), ...extra },
    global: { stubs: { 'vxe-table': { template: '<div><slot/></div>' }, 'vxe-column': { template: '<div><slot name="header"/></div>' } } } })
  mounted.push(wrapper); await flushPromises()
  return { wrapper, api: wrapper.vm as unknown as Api }
}
afterEach(() => { mounted.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = '' })

describe('data tool remote column permissions', () => {
  it('keeps an active context when declared IDs are replaced with the same IDs', async () => {
    const dispose = vi.fn(), create = vi.fn((_details, controls: { onDispose(fn: () => void): void }) => {
      controls.onDispose(dispose)
      return { id: crypto.randomUUID() }
    })
    const loader = async () => ({ default: defineComponent({ template: '<div>active tool</div>' }) })
    const wrapper = mount(FeatureHost, { props: { local: true, declaredItems: ['name'], createContext: create, loader } })
    mounted.push(wrapper); await flushPromises()
    const api = wrapper.vm as unknown as { activate(): Promise<{ id: string } | undefined>; getContext(): { id: string } | undefined }
    const original = await api.activate(); await flushPromises()
    expect(original).toBeDefined()
    await wrapper.setProps({ declaredItems: ['name'] }); await flushPromises()
    expect(api.getContext()).toBe(original)
    expect(create).toHaveBeenCalledOnce()
    expect(dispose).not.toHaveBeenCalled()
  })
  it('does not expose an action column named by an invalid local allowlist', async () => {
    const { api } = await setup(['actions'], { columns: [...columns, { id: 'actions', field: 'actions', title: '操作', kind: 'actions' }],
      features: { grouping: { ...declaration, details: { allowedItems: ['actions'] } } } })
    const context = await api.activateFeature('grouping') as ReportsContext<object>
    expect(context.columns).toEqual([])
  })
  it('applies remote details alone to report and range contexts when local feature is simply enabled', async () => {
    const { api } = await setup(['name'])
    for (const name of ['grouping', 'compare'] as const) {
      const context = await api.activateFeature(name) as ReportsContext<object>
      expect(context.columns.map(column => column.id)).toEqual(['name'])
      await context.reload()
      expect(context.rows).toEqual(data)
    }
    await api.openDataTool('rangeSelection')
    const range = api.getFeatureContext('rangeSelection') as RangeSelectionContext
    range.begin({ rowId: '1', columnId: 'amount' }); range.end()
    expect(range.count).toBe(0)
    range.begin({ rowId: '1', columnId: 'name' }); range.end()
    expect(range.count).toBe(1)
  })

  it('revokes old report and range contexts when the remote allowlist narrows in place', async () => {
    const { wrapper, api } = await setup(['name', 'amount'])
    const oldGroup = await api.activateFeature('grouping') as ReportsContext<object>
    const oldCompare = await api.activateFeature('compare') as ReportsContext<object>
    await oldGroup.reload(); await oldCompare.reload()
    await api.openDataTool('rangeSelection')
    const oldRange = api.getFeatureContext('rangeSelection') as RangeSelectionContext
    oldRange.begin({ rowId: '1', columnId: 'amount' }); oldRange.end(); expect(oldRange.count).toBe(1)

    await wrapper.setProps({ remoteFeatures: remote(['name']) }); await flushPromises()
    expect(oldGroup.rows).toEqual([])
    expect(oldCompare.rows).toEqual([])
    expect(oldGroup.columns).toEqual([])
    expect(oldCompare.columns).toEqual([])
    expect(oldRange.enabled).toBe(false)
    expect(oldRange.count).toBe(0)
    expect(() => oldRange.begin({ rowId: '1', columnId: 'amount' })).toThrow()
    await oldGroup.reload(); await oldCompare.reload()
    expect(oldGroup.rows).toEqual([])

    const newGroup = await api.activateFeature('grouping') as ReportsContext<object>
    expect(newGroup.columns.map(column => column.id)).toEqual(['name'])
    await wrapper.setProps({ remoteFeatures: { grouping: false, compare: false, rangeSelection: false } }); await flushPromises()
    expect(newGroup.columns).toEqual([])
    expect(oldGroup.columns).toEqual([])
    expect(oldCompare.columns).toEqual([])
    expect(newGroup.rows).toEqual([])
  })
})
