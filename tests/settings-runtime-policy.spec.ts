import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'
import { resolvePresentation } from '../src/features/presentation/model'
import type { SettingsDefinition } from '../src/features/settings/policy'

const wrappers: VueWrapper[] = []
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))
const editableColumns: SettingsDefinition = { pages: { columns: true }, columnSections: { basic: true } }
function create(extra: Record<string, unknown> = {}) {
  const wrapper = mount(BusinessTable, {
    props: {
      columns: [{ id: 'name', field: 'name', title: '名称', width: 160, sortable: true, configurable: { rename: true, width: true, mapping: true } }],
      data: [{ id: 'A', name: 'Alpha' }],
      features: { columnSettings: { enabled: true, mode: 'headless' } },
      ...extra,
    },
    global: { stubs: { 'vxe-table': { template: '<div><slot /></div>' }, 'vxe-column': true } },
  }) as VueWrapper
  wrappers.push(wrapper)
  return wrapper
}

describe('settings commands enforce the live module policy', () => {
  it('cannot edit undeclared modules through direct settings commands', async () => {
    const wrapper = create()
    await flushPromises()
    const api = wrapper.vm as any
    await api.applyView({ id: 'saved', name: '已保存', sorts: [{ field: 'name', order: 'desc' }], columns: { name: { title: '视图名称', width: 220 } }, presentation: { appearance: { density: 'compact' }, rowActions: { gap: 20 }, toolbar: { gap: 12 } } })
    const before = api.getState()
    await api.setPresentation({ appearance: { density: 'comfortable' }, rowActions: { gap: 2 }, toolbar: { gap: 1 } })
    await api.applySettings({ columns: { name: { title: '越权名称', width: 300 } }, sorts: [], presentation: resolvePresentation() })
    expect(api.getState()).toMatchObject({ columns: before.columns, presentation: before.presentation, query: { sorts: before.query.sorts } })
  })

  it('commits editable modules while retaining the values of hidden and read-only modules', async () => {
    const wrapper = create({
      settingsDefinition: { pages: { columns: true, appearance: true, sorts: { enabled: true, disabled: true }, actions: { enabled: true, disabled: true } }, columnSections: { basic: true } },
    })
    await flushPromises()
    const api = wrapper.vm as any
    await api.applyView({ id: 'saved', name: '已保存', sorts: [{ field: 'name', order: 'desc' }], columns: { name: { width: 220 } }, presentation: { rowActions: { gap: 20 }, toolbar: { gap: 12 } } })
    const before = api.getState()
    await api.applySettings({
      columns: { name: { title: '可编辑名称', mapping: { enabled: true, type: 'text', presentation: 'text', empty: '空', unknown: '未知', items: [] } } },
      sorts: [],
      presentation: resolvePresentation({ appearance: { density: 'compact' }, rowActions: { gap: 1 }, toolbar: { gap: 1 } }),
    })
    const result = api.getState()
    expect(result.columns[0]).toMatchObject({ title: '可编辑名称', width: 220 })
    expect(result.columns[0].mapping).toBeUndefined()
    expect(result.presentation.appearance.density).toBe('compact')
    expect(result.presentation.rowActions).toEqual(before.presentation.rowActions)
    expect(result.presentation.toolbar).toEqual(before.presentation.toolbar)
    expect(result.query.sorts).toEqual(before.query.sorts)
  })

  it('rechecks an already opened context after declarations become hidden or read-only', async () => {
    const wrapper = create({ settingsDefinition: { ...editableColumns, pages: { columns: true, appearance: true } } })
    await flushPromises()
    const api = wrapper.vm as any
    const context = await api.activateFeature('columnSettings')
    await context.patch('name', { width: 200 })
    await api.setPresentation({ appearance: { density: 'compact' } })
    await wrapper.setProps({ settingsDefinition: { pages: { columns: { enabled: true, disabled: true }, appearance: { enabled: true, visible: false } }, columnSections: { basic: true } } })
    await flushPromises()
    expect(context.settingsPolicy.pages.columns).toEqual({ visible: true, disabled: true })
    expect(context.settingsPolicy.pages.appearance).toEqual({ visible: false, disabled: false })
    await context.patch('name', { width: 280 })
    await context.apply({ name: { title: '越权名称' } })
    await api.setPresentation({ appearance: { density: 'comfortable' } })
    expect(api.getState().columns[0]).toMatchObject({ title: '名称', width: 200 })
    expect(api.getState().presentation.appearance.density).toBe('compact')
  })

  it('protects an explicitly read-only column field without blocking its editable siblings', async () => {
    const wrapper = create({ settingsDefinition: editableColumns, columns: [{ id: 'name', field: 'name', title: '固定名称', width: 160, configurable: { rename: { enabled: true, disabled: true }, width: true } }] })
    await flushPromises()
    const api = wrapper.vm as any
    const context = await api.activateFeature('columnSettings')
    await context.apply({ name: { title: '越权名称', width: 240 } })
    expect(api.getState().columns[0]).toMatchObject({ title: '固定名称', width: 240 })
    expect(api.getState().config.columns.name.width).toBe(240)
    expect(api.getState().config.columns.name.title).toBeUndefined()
  })

  it('retains a saved column value when that editor becomes read-only', async () => {
    const wrapper = create({ settingsDefinition: editableColumns })
    await flushPromises()
    const api = wrapper.vm as any
    const context = await api.activateFeature('columnSettings')
    await context.patch('name', { width: 240 })
    await wrapper.setProps({ columns: [{ id: 'name', field: 'name', title: '名称', width: 160, configurable: { rename: true, width: { enabled: true, disabled: true } } }] })
    await flushPromises()
    expect(context.columns[0].width).toBe(240)
    await context.patch('name', { width: 300, title: '可编辑名称' })
    expect(api.getState().columns[0]).toMatchObject({ title: '可编辑名称', width: 240 })
  })

  it('does not persist a read-only View appearance when only toolbar settings are edited', async () => {
    const save = vi.fn(async () => {})
    const wrapper = create({
      tableKey: 'view-preferences',
      pagination: { pageSize: 10, pageSizeOptions: [10, 20, 50] },
      persistence: { load: async () => null, save },
      settingsDefinition: { pages: { appearance: { enabled: true, disabled: true }, toolbar: true } },
    })
    await flushPromises()
    const api = wrapper.vm as any
    await api.applyView({ id: 'compact', name: '紧凑视图', presentation: { appearance: { density: 'compact', pageSize: 20 } } })
    await api.setPresentation({ toolbar: { gap: 12 }, appearance: { density: 'comfortable', pageSize: 50 } })
    expect(api.getState().presentation.appearance).toMatchObject({ density: 'compact', pageSize: 20 })
    expect(api.getState().pageSize).toBe(20)
    expect(save).toHaveBeenCalledTimes(1)
    const stored = (save.mock.calls[0] as unknown as [string, Record<string, any>])[1]
    expect(stored.presentation).toEqual({ toolbar: { gap: 12 } })
    expect(stored.pageSize).toBeUndefined()
    await api.applyView()
    expect(api.getState().presentation.appearance).toMatchObject({ density: 'default', pageSize: 10 })
    expect(api.getState().pageSize).toBe(10)
    expect(api.getState().presentation.toolbar.gap).toBe(12)
  })

  it.each([
    ['columns page', { pages: { columns: { enabled: true, disabled: true } }, columnSections: { basic: true } }],
    ['basic section', { pages: { columns: true }, columnSections: { basic: { enabled: true, disabled: true } } }],
  ] as const)('rejects direct Runtime column commands when the %s is explicitly read-only', async (_label, settingsDefinition) => {
    const wrapper = create({ settingsDefinition })
    await flushPromises()
    const api = wrapper.vm as any
    const runtime = api.getRuntime()
    await runtime.patch('name', { width: 240 })
    await runtime.applyPatches({ name: { title: '禁止修改', width: 300 } })
    expect(api.getState().columns[0]).toMatchObject({ title: '名称', width: 160 })
    expect(wrapper.emitted('configChange')).toBeUndefined()
  })

  it('rechecks a captured Runtime after the column-settings feature is disabled', async () => {
    const wrapper = create({ settingsDefinition: editableColumns })
    await flushPromises()
    const api = wrapper.vm as any
    const runtime = api.getRuntime()
    await runtime.patch('name', { width: 200 })
    await wrapper.setProps({ features: { columnSettings: false } })
    await flushPromises()
    await runtime.patch('name', { width: 300 })
    await runtime.applyPatches({ name: { title: '禁止修改' } })
    expect(api.getState().columns[0]).toMatchObject({ title: '名称', width: 200 })
    expect(wrapper.emitted('configChange')).toHaveLength(1)
  })

  it('keeps a read-only order slot anchored when an editable neighbour moves before it', async () => {
    const wrapper = create({ settingsDefinition: editableColumns, columns: [
      { id: 'first', field: 'first', title: '第一列', configurable: { order: true } },
      { id: 'locked', field: 'locked', title: '顺序只读列', configurable: { order: { enabled: true, disabled: true } } },
      { id: 'last', field: 'last', title: '最后一列', configurable: { order: true } },
    ] })
    await flushPromises()
    const api = wrapper.vm as any
    expect(api.getState().columns[1].id).toBe('locked')
    await api.getRuntime().patch('last', { order: 0 })
    expect(api.getState().columns.map((column: { id: string }) => column.id)).toEqual(['last', 'locked', 'first'])
  })

  it('keeps the saved read-only order position when it differs from the definition order', async () => {
    const wrapper = create({
      settingsDefinition: editableColumns,
      columns: [
        { id: 'first', field: 'first', title: '第一列', configurable: { order: true } },
        { id: 'locked', field: 'locked', title: '顺序只读列', configurable: { order: { enabled: true, disabled: true } } },
        { id: 'last', field: 'last', title: '最后一列', configurable: { order: true } },
      ],
      config: { schemaVersion: 1, tableKey: '', columns: { first: { order: 1 }, locked: { order: 0 }, last: { order: 2 } } },
    })
    await flushPromises()
    const api = wrapper.vm as any
    expect(api.getState().columns.map((column: { id: string }) => column.id)).toEqual(['locked', 'first', 'last'])
    await api.getRuntime().patch('first', { order: 0 })
    expect(api.getState().columns[0].id).toBe('locked')
    expect(api.getState().config.columns.locked.order).toBe(0)
  })

  it.each(['feature disabled', 'appearance read-only'] as const)('rechecks a queued settings write after %s', async restriction => {
    let releaseFirst!: () => void
    const firstWrite = new Promise<void>(resolve => { releaseFirst = resolve })
    const save = vi.fn().mockImplementationOnce(() => firstWrite).mockResolvedValue(undefined)
    const wrapper = create({
      tableKey: 'queued-settings',
      settingsDefinition: { ...editableColumns, pages: { columns: true, appearance: true } },
      persistence: { load: async () => null, save },
    })
    await flushPromises()
    const api = wrapper.vm as any
    const runtime = api.getRuntime()
    const first = runtime.patch('name', { width: 200 })
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const queued = runtime.setPresentation({ appearance: { density: 'compact' } })
    await wrapper.setProps(restriction === 'feature disabled'
      ? { features: { columnSettings: false } }
      : { settingsDefinition: { ...editableColumns, pages: { columns: true, appearance: { enabled: true, disabled: true } } } })
    releaseFirst()
    await Promise.all([first, queued])
    expect(save).toHaveBeenCalledTimes(1)
    expect(api.getState().presentation.appearance.density).toBe('default')
    expect(wrapper.emitted('configChange')).toHaveLength(1)
  })

  it('keeps the legacy Core patch command usable without a settings UI declaration', async () => {
    const wrapper = create({ columns: [{ id: 'name', field: 'name', title: '名称', width: 160 }] })
    await flushPromises()
    const api = wrapper.vm as any
    await api.getRuntime().patch('name', { title: '程序设置名称', width: 200 })
    expect(api.getState().columns[0]).toMatchObject({ title: '程序设置名称', width: 200 })
    await api.getRuntime().applyPatches({ name: { width: 240 } })
    expect(api.getState().columns[0]).toMatchObject({ title: '程序设置名称', width: 240 })
  })
})
