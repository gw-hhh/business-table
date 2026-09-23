import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ToolStrip from '../src/features/toolbar/ToolStrip.vue'
import { defineComponent } from 'vue'
import App from '../demo/App.vue'
import BusinessTable from '../src/BusinessTable.vue'
import ToolbarSettings from '../src/features/settings/ToolbarSettings.vue'
import { defaultPresentation, type ToolDefinition } from '../src/features/presentation/model'

const wrappers: VueWrapper[] = []
// Compile the settings SFC outside the interaction test's time budget. Browser
// tests separately verify that the real application loads it only on demand.
beforeAll(async () => { await import('../src/components/ColumnSettings.vue') })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.unstubAllGlobals() })
describe('registered toolbar tools share the persisted presentation', () => {
  it.each(['Escape', 'Tab'])('leaves %s inside a nested dialog to that dialog', async key => {
    const wrapper = mount(ToolStrip, { attachTo: document.body, props: { tools: [{ id: 'nested', label: '排序', position: 'more', handler: () => {} }] }, slots: { 'tool-nested': '<div role="dialog" aria-label="排序规则"><input aria-label="排序字段" /></div>' } }); wrappers.push(wrapper)
    await wrapper.get('button[aria-haspopup="menu"]').trigger('click')
    const input = wrapper.get('input').element as HTMLInputElement
    input.focus()
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    input.dispatchEvent(event); await flushPromises()
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })
  it('uses the same local availability for settings and rendering while hidden preferences remain recoverable', async () => {
    const tools: ToolDefinition[] = [
      { id: 'hidden', label: '本地隐藏', visible: false, handler: () => {} },
      { id: 'hidden', label: '重复隐藏', handler: () => {} },
      { id: 'missing', label: '未实现' },
      { id: 'missing', label: '重复未实现', handler: () => {} },
      { id: 'restore', label: '可以恢复', handler: () => {} },
      { id: 'restore', label: '重复工具', handler: () => {} },
      { id: 'locked', label: '只读', disabled: true },
    ]
    const layout = defaultPresentation().toolbar
    layout.page.restore = { position: 'hidden' }
    const settings = mount(ToolbarSettings, { props: { tools: { page: tools, table: [] }, modelValue: layout } }); wrappers.push(settings)
    expect(settings.findAll('input[aria-label$="工具名称"]').map(input => input.attributes('aria-label'))).toEqual(['可以恢复工具名称', '只读工具名称'])
    const strip = mount(ToolStrip, { props: { tools, layout: layout.page } }); wrappers.push(strip)
    expect(strip.findAll('[data-tool-id]').map(item => item.attributes('data-tool-id'))).toEqual(['locked'])
    await settings.get('select[aria-label="可以恢复工具位置"]').setValue('direct')
    const change = settings.emitted('update:modelValue')![0][0] as typeof layout
    await strip.setProps({ layout: change.page })
    expect(strip.get('[data-tool-id="restore"] button').text()).toBe('可以恢复')
  })
  it('collapses only nonfixed tools on narrow screens and preserves preferences across resize', async () => {
    const media = new EventTarget() as EventTarget & { matches: boolean }
    media.matches = true
    vi.stubGlobal('matchMedia', () => media)
    const layout = { settings: { position: 'hidden' as const, fixed: false }, ordinary: { position: 'direct' as const } }
    const wrapper = mount(ToolStrip, { props: { tools: [
      { id: 'ordinary', label: '普通工具', handler: () => {} },
      { id: 'fixed', label: '固定工具', fixed: true, handler: () => {} },
      { id: 'settings', label: '设置入口', immutable: true, handler: () => {} },
    ], layout } }); wrappers.push(wrapper); await flushPromises()
    expect(wrapper.find('[data-tool-id="ordinary"]').exists()).toBe(false)
    expect(wrapper.findAll('.bt-tool-item').map(item => item.attributes('data-tool-id'))).toEqual(['fixed', 'settings'])
    await wrapper.get('button[aria-haspopup="menu"]').trigger('click')
    expect(wrapper.get('[role="menu"] [data-tool-id="ordinary"] button').text()).toBe('普通工具')
    await wrapper.setProps({ layout: { ...layout, ordinary: { position: 'direct', fixed: true } } })
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(wrapper.find('.bt-tool-item[data-tool-id="ordinary"]').exists()).toBe(true)
    await wrapper.setProps({ layout })
    media.matches = false; media.dispatchEvent(new Event('change')); await flushPromises()
    expect(wrapper.findAll('.bt-tool-item').map(item => item.attributes('data-tool-id'))).toEqual(['ordinary', 'fixed', 'settings'])
    expect(layout.ordinary).toEqual({ position: 'direct' })
  })
  it('applies the Demo settings transaction to the registered toolbar', async () => {
    localStorage.clear()
    const wrapper = mount(App, { attachTo: document.body, global: { stubs: { 'vxe-table': defineComponent({ template: '<div><slot /></div>' }), 'vxe-column': defineComponent({ template: '<div><slot name="header" /></div>' }), teleport: true } } }) as VueWrapper
    wrappers.push(wrapper); await flushPromises()
    const api = wrapper.findComponent(BusinessTable).vm as unknown as { getFeatureContext: (name: string) => unknown }
    await wrapper.get('[data-testid="table-settings"]').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(api.getFeatureContext('columnSettings')).toBeDefined())
    await wrapper.get('button[aria-label="工具栏"]').trigger('click')
    await wrapper.get('select[aria-label="模板下载工具位置"]').setValue('hidden')
    const apply = wrapper.findAll('button').find(button => button.text() === '应用')!
    await apply.trigger('click'); await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '收起')!.trigger('click'); await flushPromises()
    expect(wrapper.find('button[aria-label="模板下载"]').exists()).toBe(false)
    localStorage.clear()
  })
  it('renders only declared executable or explicitly disabled tools and applies label, order and display', () => {
    const wrapper = mount(ToolStrip, { props: {
      tools: [{ id: 'reload', label: '刷新', icon: 'refresh', handler: vi.fn() }, { id: 'export', label: '导出', handler: vi.fn() }, { id: 'missing', label: '无实现' }, { id: 'locked', label: '只读工具', disabled: true }, { id: 'hidden', label: '不可见', visible: false, handler: vi.fn() }],
      layout: { reload: { label: '重新加载', order: 1, display: 'icon' }, export: { order: 0 }, unknown: { label: '未注册' } },
    } }); wrappers.push(wrapper)
    expect(wrapper.findAll('[data-tool-id]').map(node => node.attributes('data-tool-id'))).toEqual(['export', 'locked', 'reload'])
    expect(wrapper.get('[data-tool-id="reload"] button').attributes('title')).toBe('重新加载')
    expect(wrapper.get('[data-tool-id="reload"] button').text()).toBe('')
    expect(wrapper.get('[data-tool-id="locked"] button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('无实现')
    expect(wrapper.text()).not.toContain('未注册')
  })
  it('uses More for configured tools, prevents disabled execution and updates after layout changes', async () => {
    const run = vi.fn(), locked = vi.fn()
    const wrapper = mount(ToolStrip, { attachTo: document.body, props: {
      moreLabel: '更多页面操作',
      tools: [{ id: 'run', label: '执行', handler: run }, { id: 'locked', label: '已禁用', disabled: true, handler: locked }],
      layout: { run: { position: 'more' }, locked: { position: 'more' } },
    } }); wrappers.push(wrapper)
    expect(wrapper.find('[data-tool-id="run"]').exists()).toBe(false)
    await wrapper.get('button[aria-label="更多页面操作"]').trigger('click')
    await wrapper.get('[data-tool-id="locked"] button').trigger('click')
    expect(locked).not.toHaveBeenCalled()
    await wrapper.get('[data-tool-id="run"] button').trigger('click'); await flushPromises()
    expect(run).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    await wrapper.setProps({ layout: { run: { label: '执行一次', position: 'direct' }, locked: { position: 'hidden' } } })
    expect(wrapper.get('[data-tool-id="run"] button').text()).toBe('执行一次')
    expect(wrapper.find('[data-tool-id="locked"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="更多页面操作"]').exists()).toBe(false)
  })
  it('supports keyboard navigation and restores focus after Escape', async () => {
    const wrapper = mount(ToolStrip, { attachTo: document.body, props: { tools: [{ id: 'one', label: '第一项', position: 'more', handler: vi.fn() }, { id: 'two', label: '第二项', position: 'more', handler: vi.fn() }] } }); wrappers.push(wrapper)
    const trigger = wrapper.get('button[aria-haspopup="menu"]')
    await trigger.trigger('keydown', { key: 'ArrowDown' }); await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-tool-id="one"] button').element)
    await wrapper.get('[data-tool-id="one"] button').trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(wrapper.get('[data-tool-id="two"] button').element)
    await wrapper.get('[data-tool-id="two"] button').trigger('keydown', { key: 'Escape' }); await flushPromises()
    expect(document.activeElement).toBe(trigger.element)
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })
})
