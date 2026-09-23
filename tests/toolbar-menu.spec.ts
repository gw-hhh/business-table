import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ToolStrip from '../src/features/toolbar/ToolStrip.vue'
import SettingsPreview from '../src/features/settings/SettingsPreview.vue'
import { availableTools, defaultPresentation, presentTools, type ToolDefinition } from '../src/features/presentation/model'

const wrappers: VueWrapper[] = []
const leaf = (id: string): ToolDefinition => ({ id, label: id, handler: () => {} })
function button(label: string): HTMLButtonElement {
  const result = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(result, `button ${label}`).not.toBeNull()
  return result!
}
async function press(target: HTMLElement, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  await flushPromises()
}
async function click(label: string) { button(label).click(); await flushPromises() }
function setup(tools: ToolDefinition[]) {
  const wrapper = mount(ToolStrip, { props: { tools, overflow: 'wrap' }, attachTo: document.body })
  wrappers.push(wrapper); return wrapper
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.replaceChildren() })

describe('declarative tool menus', () => {
  it('keeps real nested menus and removes empty, hidden, duplicate and cyclic branches', () => {
    const cycle: ToolDefinition = { id: 'cycle', label: 'cycle' }; cycle.children = [cycle]
    const tooDeep = Array.from({ length: 6 }).reduce<ToolDefinition>((child, _, depth) => ({ id: `level-${depth}`, label: '深层菜单', children: [child] }), leaf('deep-leaf'))
    const tools: ToolDefinition[] = [
      { id: 'empty', label: 'empty', children: [], handler: () => {} },
      { id: 'hidden', label: 'hidden', children: [{ ...leaf('hidden-child'), visible: false }] },
      { id: 'unimplemented', label: 'unimplemented', children: [{ id: 'missing', label: 'missing' }] },
      { id: 'saved-hidden', label: 'saved-hidden', children: [{ ...leaf('child'), position: 'hidden' }] },
      cycle,
      tooDeep,
      { id: 'tools', label: 'tools', children: [leaf('one'), leaf('one'), { id: 'locked', label: 'locked', disabled: true }] },
    ]
    expect(availableTools(tools).map(tool => tool.id)).toEqual(['saved-hidden', 'tools'])
    expect(presentTools(tools, {}).map(tool => tool.id)).toEqual(['tools'])
    expect(presentTools(tools, {})[0]!.children?.map(tool => tool.id)).toEqual(['one', 'locked'])
  })
  it('opens nested menus from the keyboard, skips disabled items and restores each parent focus', async () => {
    let executions = 0
    setup([{ id: 'data', label: '数据工具', children: [
      { id: 'disabled', label: '只读项', disabled: true }, leaf('第一项'),
      { id: 'nested', label: '子工具', children: [{ id: 'run', label: '执行子项', handler: () => { executions++ } }] },
    ] }])
    const trigger = button('数据工具'); trigger.focus()
    await press(trigger, 'ArrowDown')
    expect(document.activeElement).toBe(button('第一项'))
    await press(button('第一项'), 'End'); expect(document.activeElement).toBe(button('子工具'))
    await press(button('子工具'), 'ArrowRight'); expect(document.activeElement).toBe(button('执行子项'))
    await press(button('执行子项'), 'Escape')
    expect(document.activeElement).toBe(button('子工具'))
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1)
    await press(button('子工具'), 'ArrowRight')
    await new Promise(resolve => requestAnimationFrame(resolve))
    button('执行子项').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushPromises(); expect(document.querySelectorAll('[role="menu"]')).toHaveLength(2)
    await click('执行子项')
    expect(executions).toBe(1); expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0)
    expect(document.activeElement).toBe(trigger)
  })
  it('keeps the overflow menu when its child popup is used and Escape only closes that child', async () => {
    let executions = 0
    setup([{ id: 'data', label: '数据工具', position: 'more', children: [{ id: 'run', label: '执行', handler: () => { executions++ } }] }])
    await click('更多工具'); await click('数据工具')
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(2)
    await press(button('执行'), 'Escape')
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1)
    expect(document.activeElement).toBe(button('数据工具'))
    await click('数据工具')
    await new Promise(resolve => requestAnimationFrame(resolve))
    button('执行').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(2)
    await click('执行'); expect(executions).toBe(1)
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0)
    expect(document.activeElement).toBe(button('更多工具'))
  })
  it('shows the label of an icon-only toolbar tool after it moves into the overflow menu', async () => {
    setup([{ id: 'data', label: '数据工具', display: 'icon', position: 'more', children: [leaf('组合筛选')] }])
    await click('更多工具')
    expect(button('数据工具').textContent).toContain('数据工具')
    await click('数据工具'); expect(button('组合筛选').textContent).toContain('组合筛选')
  })
  it.each([
    ['direct', false], ['direct', true], ['more', false], ['more', true],
  ] as const)('leaves the entire %s menu stack with Tab (shift=%s)', async (position, shiftKey) => {
    const before = document.createElement('button'); before.textContent = '前一个控件'; document.body.append(before)
    setup([{ id: 'data', label: '数据工具', position, children: [{ id: 'nested', label: '子工具', children: [leaf('执行')] }] }])
    const after = document.createElement('button'); after.textContent = '后一个控件'; document.body.append(after)
    if (position === 'more') await click('更多工具')
    await click('数据工具'); await click('子工具')
    expect(document.activeElement).toBe(button('执行'))
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
    button('执行').dispatchEvent(event); await flushPromises()
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(shiftKey ? before : after)
  })
  it.each([
    ['direct', false], ['direct', true], ['more', false], ['more', true],
  ] as const)('leaves a %s menu stack when its disabled child menu itself has focus (shift=%s)', async (position, shiftKey) => {
    const before = document.createElement('button'); before.textContent = '前一个控件'; document.body.append(before)
    setup([{ id: 'data', label: '数据工具', position, children: [{ id: 'nested', label: '子工具', children: [{ id: 'locked', label: '只读项', disabled: true }] }] }])
    const after = document.createElement('button'); after.textContent = '后一个控件'; document.body.append(after)
    if (position === 'more') await click('更多工具')
    await click('数据工具'); await click('子工具')
    const panel = document.querySelector<HTMLElement>('[role="menu"][aria-label="子工具"]')!
    expect(document.activeElement).toBe(panel)
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
    panel.dispatchEvent(event); await flushPromises()
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(shiftKey ? before : after)
  })
  it('rechecks current ancestors and leaves before executing a stale displayed command', async () => {
    let oldCalls = 0, currentCalls = 0
    const group: ToolDefinition = { id: 'data', label: '数据工具', children: [{ id: 'run', label: '执行', handler: () => { oldCalls++ } }] }
    const wrapper = setup([group]); await click('数据工具')
    const stale = button('执行'); group.disabled = true
    stale.click(); await flushPromises(); expect(oldCalls).toBe(0)
    group.disabled = false; group.children = [{ id: 'run', label: '执行', handler: () => { currentCalls++ } }]
    stale.click(); await flushPromises(); expect(oldCalls).toBe(0); expect(currentCalls).toBe(1)
    await wrapper.setProps({ tools: [{ ...group, disabled: false }] }); await click('数据工具')
    const revoked = button('执行'); group.children = []
    await wrapper.setProps({ tools: [group] }); revoked.click(); await flushPromises()
    expect(currentCalls).toBe(1)
  })
  it('isolates every nested preview handler and keeps the preview menu interactive', async () => {
    let businessCalls = 0
    const tools: ToolDefinition[] = [{ id: 'data', label: '数据工具', children: [{ id: 'group', label: '子工具', children: [{ id: 'run', label: '执行业务', handler: () => { businessCalls++ } }] }] }]
    const wrapper = mount(SettingsPreview, { attachTo: document.body, props: { tab: 'toolbar', columns: [], rows: [], sampleIndex: 0, mode: 'column', open: true, presentation: defaultPresentation(), actions: [], tools: { page: [], table: tools } } })
    wrappers.push(wrapper); await click('数据工具'); await click('子工具'); await click('执行业务')
    expect(businessCalls).toBe(0)
    expect(wrapper.get('[role="status"]').text()).toContain('没有执行操作')
  })
  it.each(['disabled', 'hidden', 'removed'] as const)('blocks a %s leaf even before its existing DOM has repainted', async change => {
    let calls = 0
    const item: ToolDefinition = { id: 'run', label: '执行', handler: () => { calls++ } }
    const parent: ToolDefinition = { id: 'data', label: '数据工具', children: [item] }
    setup([parent]); await click('数据工具'); const stale = button('执行')
    if (change === 'disabled') item.disabled = true
    else if (change === 'hidden') item.visible = false
    else parent.children = []
    stale.click(); await flushPromises(); expect(calls).toBe(0)
  })
  it('reports leaf handler failures through the existing toolbar error path', async () => {
    const wrapper = setup([{ id: 'data', label: '数据工具', children: [{ id: 'run', label: '执行', handler: async () => { throw Error('保存失败') } }] }])
    await click('数据工具'); await click('执行')
    expect(wrapper.get('[role="alert"]').text()).toBe('保存失败')
    expect(wrapper.emitted('error')).toHaveLength(1)
  })
})
