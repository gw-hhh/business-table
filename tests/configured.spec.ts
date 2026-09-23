import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, nextTick, provide, toRef, type PropType, type Ref, type VNode } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ConfiguredBusinessTable from '../src/ConfiguredBusinessTable.vue'
import { createRegistry } from '../src/runtime/registry'
import type { TableDefinition } from '../src/config/types'
import type { ConfigDiagnostic } from '../src/config/diagnostics'
import type { ColumnConfig, UserColumnConfig } from '../src/types'

type Row = { id: string; name: string }
type SettingsContext = { columns: ColumnConfig[]; patch: (id: string, patch: UserColumnConfig) => Promise<void>; close: () => void }

// Keep the real table runtime and feature components; replace only VXE's grid layout.
const VxeTableStub = defineComponent({
  props: { data: { type: Array as PropType<Row[]>, default: () => [] } },
  setup(props) { provide('test-grid-rows', toRef(props, 'data')) },
  template: '<div><slot /><slot v-if="data.length === 0" name="empty" /></div>',
})
const VxeColumnStub = defineComponent({
  props: ['field', 'title', 'width', 'fixed'],
  setup() { return { rows: inject<Ref<Row[]>>('test-grid-rows') } },
  template: '<div :data-column="field" :data-width="width" :data-fixed="fixed"><slot name="header" /><div v-for="row in rows" :key="row.id"><slot :row="row" /></div></div>',
})
const wrappers: VueWrapper[] = []
const definition = (): TableDefinition => ({
  schemaVersion: 3,
  tableKey: 'configured-assets',
  rowKey: 'id',
  settings: { pages: { columns: true }, columnSections: { basic: true } },
  columns: [
    { id: 'id', field: 'id', title: '编号', default: { visible: true, width: 100, fixed: 'left' }, configurable: { visible: { enabled: true, disabled: true }, fixed: { enabled: true, disabled: true }, width: { enabled: true, min: 80, max: 180 } } },
    { id: 'name', field: 'name', title: '名称', width: 160, configurable: { visible: true, width: true } },
  ],
})
function mountConfigured(props: Record<string, unknown> = {}, slots: Record<string, string | ((scope: { context: SettingsContext }) => VNode)> = {}) {
  const wrapper = mount(ConfiguredBusinessTable, {
    props: { definition: definition(), data: [{ id: 'A001', name: '水表' }], ...props },
    slots,
    global: { stubs: { Teleport:true, 'vxe-table': VxeTableStub, 'vxe-column': VxeColumnStub } },
  }) as VueWrapper
  wrappers.push(wrapper)
  return wrapper
}
async function settle() { await flushPromises(); await nextTick(); await flushPromises() }
async function openSettings(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="column-settings"]').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('[data-testid="column-panel"]').exists()).toBe(true))
}
async function editColumn(wrapper:VueWrapper,title:string){
  await wrapper.findAll('button').find(button=>button.text()==='更多设置')!.trigger('click')
  await wrapper.get(`[aria-label="编辑列 ${title}"]`).trigger('click')
}
async function applySettings(wrapper:VueWrapper){
  await wrapper.findAll('button').find(button=>button.text()==='应用')!.trigger('click')
  await settle()
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

describe('ConfiguredBusinessTable', () => {
  it('falls back from corrupt preference, reports it, and still renders core data', async () => {
    const wrapper = mountConfigured({ preference: '{broken-json' })
    await settle()
    expect(wrapper.text()).toContain('A001')
    expect(wrapper.text()).toContain('水表')
    expect(wrapper.emitted('diagnostic')?.flat()).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ConfigParseError' })]))
    expect(wrapper.find('[data-testid="column-settings"]').exists()).toBe(false)
  })

  it('keeps locked columns checked and left fixed while allowing a width delta without mutating inputs', async () => {
    const input = definition()
    input.features = { columnSettings: true }
    const preference = { kind: 'business-table-preference', schemaVersion: 3, tableKey: input.tableKey, columns: { id: { visible: true, fixed: 'left', width: 120 } } }
    const original = JSON.stringify({ input, preference })
    const wrapper = mountConfigured({ definition: input, preference })
    await settle()
    await openSettings(wrapper)
    const checkbox = wrapper.get<HTMLInputElement>('[aria-label="显示编号"]')
    expect(checkbox.element.checked).toBe(true)
    expect(checkbox.element.disabled).toBe(true)
    const pin = wrapper.get<HTMLButtonElement>('[title="左冻结 编号"]')
    expect(pin.element.disabled).toBe(true)
    expect(pin.attributes('aria-pressed')).toBe('true')
    await editColumn(wrapper,'编号')
    const width = wrapper.get<HTMLInputElement>('[aria-label="编号列宽"]')
    expect(width.element.disabled).toBe(false)
    expect(width.element.value).toBe('120')
    await width.setValue('140')
    await settle()
    expect(wrapper.emitted('preferenceChange')).toBeUndefined()
    await applySettings(wrapper)
    expect(wrapper.emitted('preferenceChange')?.at(-1)?.[0]).toEqual({
      kind: 'business-table-preference', schemaVersion: 3, tableKey: input.tableKey, columns: { id: { width: 140 } },
    })
    expect(JSON.stringify({ input, preference })).toBe(original)
  })

  it('applies permitted remote defaults and compares user changes with those defaults', async () => {
    const input = definition()
    input.features = { columnSettings: true }
    const remoteOverride = { columns: { name: { width: 220 } } }
    const wrapper = mountConfigured({ definition: input, remoteOverride })
    await settle()
    await openSettings(wrapper)
    await editColumn(wrapper,'名称')
    const width = wrapper.get<HTMLInputElement>('[aria-label="名称列宽"]')
    expect(width.element.value).toBe('220')
    await width.setValue('250')
    await applySettings(wrapper)
    expect(wrapper.emitted('preferenceChange')?.at(-1)?.[0]).toEqual({
      kind: 'business-table-preference', schemaVersion: 3, tableKey: input.tableKey, columns: { name: { width: 250 } },
    })
    await openSettings(wrapper)
    await editColumn(wrapper,'名称')
    await wrapper.get<HTMLInputElement>('[aria-label="名称列宽"]').setValue('220')
    await applySettings(wrapper)
    expect(wrapper.emitted('preferenceChange')?.at(-1)?.[0]).toEqual({
      kind: 'business-table-preference', schemaVersion: 3, tableKey: input.tableKey, columns: {},
    })
  })

  it('forwards a custom column-settings slot through the same guarded change context', async () => {
    const input = definition()
    input.features = { columnSettings: { enabled: true, mode: 'custom' } }
    const wrapper = mountConfigured({ definition: input }, {
      'column-settings': ({ context }) => h('button', {
        'data-testid': 'custom-column-change',
        onClick: () => context.patch('id', { visible: false, fixed: false, width: 140 }),
      }, '调整编号列'),
    })
    await settle()
    await wrapper.get('[data-testid="column-settings"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="custom-column-change"]').exists()).toBe(true))
    await wrapper.get('[data-testid="custom-column-change"]').trigger('click')
    await settle()
    expect(wrapper.get('[data-column="id"]').attributes()).toMatchObject({ 'data-width': '140', 'data-fixed': 'left' })
    expect(wrapper.text()).toContain('A001')
    expect(wrapper.find('[data-testid="column-panel"]').exists()).toBe(false)
    expect(wrapper.emitted('preferenceChange')?.at(-1)?.[0]).toEqual({
      kind: 'business-table-preference', schemaVersion: 3, tableKey: input.tableKey, columns: { id: { width: 140 } },
    })
    expect(wrapper.emitted('diagnostic')?.flat()).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CapabilityViolation' })]))
  })

  it('only executes registered row actions allowed by local and remote declarations', async () => {
    const diagnostics: ConfigDiagnostic[] = []
    const registry = createRegistry<Row>({ onDiagnostic: diagnostic => diagnostics.push(diagnostic) })
    const edit = vi.fn()
    const remove = vi.fn()
    registry.register('rowAction', 'edit', { id: 'edit', label: '编辑', handler: edit })
    registry.register('rowAction', 'delete', { id: 'delete', label: '删除', handler: remove })
    const input = definition()
    input.features = { rowActions: { enabled: true, details: { allowedItems: ['edit', 'delete', 'missing'] } } }
    const wrapper = mountConfigured({ definition: input, registry, remoteOverride: { features: { rowActions: { details: { allowedItems: ['edit', 'missing', 'remote-injected'] } } } } })
    await settle()
    await vi.waitFor(() => expect(wrapper.findAll('button').some(button => button.text() === '编辑')).toBe(true))
    expect(wrapper.findAll('button').some(button => button.text() === '删除')).toBe(false)
    await wrapper.findAll('button').find(button => button.text() === '编辑')!.trigger('click')
    expect(edit).toHaveBeenCalledWith({ id: 'A001', name: '水表' })
    expect(remove).not.toHaveBeenCalled()
    expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UnknownRegistryId' })]))
  })

  it('does not read disabled row action details or resolve their registry entries', async () => {
    const details = vi.fn(() => { throw new Error('disabled details were read') })
    const local = Object.defineProperty({ enabled: false }, 'details', { get: details })
    const input = definition()
    input.features = { rowActions: local }
    const registry = createRegistry<Row>()
    const get = vi.spyOn(registry, 'get')
    const wrapper = mountConfigured({ definition: input, registry, remoteOverride: { features: { rowActions: { enabled: true } } } })
    await settle()
    expect(wrapper.text()).toContain('A001')
    expect(details).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('provides registered actions and both tool regions to the configured settings context', async () => {
    const input = definition()
    input.settings = { pages: { actions: true, toolbar: true } }
    input.features = { columnSettings: { enabled: true, mode: 'headless' }, rowActions: { enabled: true, details: { allowedItems: ['edit'] } } }
    const registry = createRegistry<Row>()
    const edit = vi.fn(), add = vi.fn(), reload = vi.fn()
    registry.register('rowAction', 'edit', { id: 'edit', label: '编辑', handler: edit })
    const tools = { page: [{ id: 'add', label: '新增', handler: add }], table: [{ id: 'reload', label: '刷新', handler: reload }] }
    const wrapper = mountConfigured({ definition: input, registry, tools })
    await settle()
    const context = await (wrapper.vm as any).activateFeature('columnSettings')
    expect(context.settingsPolicy.pages.actions).toEqual({ visible: true, disabled: false })
    expect(context.tools).toEqual(tools)
    expect(context.actions).toHaveLength(1)
    expect(context.actions[0]).toMatchObject({ id: 'edit', label: '编辑' })
    await context.actions[0].handler({ id: 'A001', name: '水表' })
    expect(edit).toHaveBeenCalledWith({ id: 'A001', name: '水表' })
    expect(context.tools.page[0].handler).toBe(add)
    expect(context.tools.table[0].handler).toBe(reload)
  })

  it('narrows an open settings context with remote declarations without enabling undeclared pages', async () => {
    const input = definition()
    input.settings = { pages: { columns: true, appearance: true }, columnSections: { basic: true } }
    input.features = { columnSettings: { enabled: true, mode: 'headless' } }
    const wrapper = mountConfigured({ definition: input })
    await settle()
    const context = await (wrapper.vm as any).activateFeature('columnSettings')
    await wrapper.setProps({ remoteOverride: { settings: { pages: { appearance: { disabled: true }, toolbar: true }, columnSections: { basic: false } } } })
    await settle()
    expect(context.settingsPolicy.pages.appearance).toEqual({ visible: true, disabled: true })
    expect(context.settingsPolicy.pages.toolbar).toEqual({ visible: false, disabled: false })
    expect(context.settingsPolicy.columnSections.basic).toEqual({ visible: false, disabled: false })
    await context.patch('name', { width: 280 })
    expect(wrapper.get('[data-column="name"]').attributes('data-width')).toBe('160')
    expect(wrapper.emitted('preferenceChange')).toBeUndefined()
  })

  it('defers enabled row action details and registration lookup until interaction activation', async () => {
    const details = vi.fn(() => ({ allowedItems: ['edit'] }))
    const local = Object.defineProperty({ enabled: true, loadStrategy: 'on-interaction' }, 'details', { get: details })
    const input = definition()
    input.features = { rowActions: local }
    const registry = createRegistry<Row>()
    const edit = vi.fn()
    registry.register('rowAction', 'edit', { id: 'edit', label: '编辑', handler: edit })
    const get = vi.spyOn(registry, 'get')
    const wrapper = mountConfigured({ definition: input, registry })
    await settle()
    expect(details).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    await (wrapper.vm as unknown as { activateFeature: (name: string) => Promise<unknown> }).activateFeature('rowActions')
    await vi.waitFor(() => expect(wrapper.findAll('button').some(button => button.text() === '编辑')).toBe(true))
    await wrapper.findAll('button').find(button => button.text() === '编辑')!.trigger('click')
    expect(details).toHaveBeenCalledTimes(1)
    expect(edit).toHaveBeenCalledWith({ id: 'A001', name: '水表' })
  })

  it('removes a saved page-size delta when the user returns to the effective remote default', async () => {
    const input = definition()
    input.pagination = { pageSize: 20, pageSizeOptions: [20, 50, 100] }
    const wrapper = mountConfigured({
      definition: input,
      remoteOverride: { pagination: { pageSize: 50 } },
      preference: { kind: 'business-table-preference', schemaVersion: 3, tableKey: input.tableKey, columns: {}, pagination: { pageSize: 20 } },
    })
    await settle()
    expect(wrapper.get<HTMLSelectElement>('[aria-label="每页条数"]').element.value).toBe('20')
    await wrapper.get('[aria-label="每页条数"]').setValue('50')
    await settle()
    expect(wrapper.emitted('preferenceChange')?.at(-1)?.[0]).toEqual({
      kind: 'business-table-preference', schemaVersion: 3, tableKey: input.tableKey, columns: {},
    })
  })

  it('renders registered renderer strings as text and falls back for missing renderer IDs', async () => {
    const input = definition()
    Object.assign(input.columns[0]!, { renderer: 'missing-renderer' })
    Object.assign(input.columns[1]!, { renderer: 'safe-label' })
    const registry = createRegistry<Row>()
    registry.register('renderer', 'safe-label', value => `<b>${String(value)}</b>`)
    const wrapper = mountConfigured({ definition: input, registry })
    await settle()
    expect(wrapper.text()).toContain('A001')
    expect(wrapper.text()).toContain('<b>水表</b>')
    expect(wrapper.find('b').exists()).toBe(false)
  })
})
