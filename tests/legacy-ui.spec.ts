import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'
import { makeConfig } from '../src/core'
import type { ColumnConfig, Persistence, Query, TableConfig } from '../src/types'

const columns: ColumnConfig[] = [
  { id: 'code', field: 'code', title: '编号', width: 194, sortable: true },
  { id: 'name', field: 'name', title: '名称', width: 280, sortable: true },
]
const TableStub = defineComponent({ template: '<div><slot /></div>' })
const ColumnStub = defineComponent({ template: '<div><slot name="header" /></div>' })
const wrappers: VueWrapper[] = []
function setup(persistence?: Persistence) {
  const wrapper = mount(BusinessTable, {
    props: { tableKey: 'parity', rowKey: 'code', columns, data: [{ code: '1', name: '甲' }], persistence },
    global: { stubs: { 'vxe-table': TableStub, 'vxe-column': ColumnStub, teleport: true } },
  }) as VueWrapper
  wrappers.push(wrapper)
  return wrapper
}
function button(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find(node => node.text().trim() === text)
  if (!found) throw new Error(`找不到按钮：${text}`)
  return found
}
async function open(wrapper: VueWrapper) {
  await flushPromises()
  await wrapper.get('[data-testid="column-settings"]').trigger('click')
}
afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount() })

describe('legacy interaction contracts', () => {
  it('cycles a sortable column asc -> desc -> unsorted', async () => {
    const wrapper = setup()
    await flushPromises()
    const header = wrapper.findAll('button').find(node => node.text().trim() === '编号')!
    for (let index = 0; index < 3; index++) { await header.trigger('click'); await flushPromises() }
    const events = wrapper.emitted('queryChange')!
    expect((events[events.length - 1][0] as Query).sorts).toEqual([])
  })
  it('keeps visibility changes in a draft and cancel performs no persistence writes', async () => {
    const save = vi.fn(async () => {})
    const wrapper = setup({ load: async () => null, save })
    await open(wrapper)
    await wrapper.get('input[aria-label="显示名称"]').setValue(false)
    await flushPromises()
    expect(save).not.toHaveBeenCalled()
    expect(wrapper.emitted('configChange')).toBeUndefined()
    await button(wrapper, '取消').trigger('click')
    await open(wrapper)
    expect((wrapper.get('input[aria-label="显示名称"]').element as HTMLInputElement).checked).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })
  it('applies several column draft changes with exactly one write', async () => {
    const save = vi.fn(async (_key: string, _config: TableConfig) => {})
    const wrapper = setup({ load: async () => null, save })
    await open(wrapper)
    await wrapper.get('input[aria-label="显示名称"]').setValue(false)
    await wrapper.get('button[title="左冻结 编号"]').trigger('click')
    expect(save).not.toHaveBeenCalled()
    await button(wrapper, '确认').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][1].columns.name.visible).toBe(false)
    expect(save.mock.calls[0][1].columns.code.fixed).toBe('left')
    expect(wrapper.find('[data-testid="column-panel"]').exists()).toBe(false)
  })
  it('provides mutually exclusive, accessible left/right freeze toggles', async () => {
    const wrapper = setup()
    await open(wrapper)
    const left = wrapper.get('button[title="左冻结 编号"]')
    const right = wrapper.get('button[title="右冻结 编号"]')
    await left.trigger('click')
    expect(left.attributes('aria-pressed')).toBe('true')
    await right.trigger('click')
    expect(left.attributes('aria-pressed')).toBe('false')
    expect(right.attributes('aria-pressed')).toBe('true')
    await right.trigger('click')
    expect(right.attributes('aria-pressed')).toBe('false')
  })
  it('does not allow the last visible column to be hidden', async () => {
    const wrapper = setup()
    await open(wrapper)
    await wrapper.get('input[aria-label="显示名称"]').setValue(false)
    await wrapper.get('input[aria-label="显示编号"]').setValue(false)
    expect(wrapper.find('[data-testid="column-panel"] [role="alert"]').exists()).toBe(true)
    expect(button(wrapper, '确认').attributes('disabled')).toBeDefined()
  })
  it('offers keyboard-accessible column reordering without changing stable ids', async () => {
    const wrapper = setup()
    await open(wrapper)
    const down = wrapper.find('button[aria-label="下移 编号"]')
    expect(down.exists()).toBe(true)
    await down.trigger('click')
    await button(wrapper, '确认').trigger('click')
    const config = wrapper.emitted('configChange')![0][0] as TableConfig
    expect(config.columns.code.order).toBe(1)
    expect(config.columns.name.order).toBe(0)
    expect(Object.keys(config.columns).sort()).toEqual(['code', 'name'])
  })
  it('includes reset, cancel, and confirm instead of immediate-save range controls', async () => {
    const wrapper = setup()
    await open(wrapper)
    expect(wrapper.text()).toContain('恢复默认')
    expect(wrapper.text()).toContain('取消')
    expect(wrapper.text()).toContain('确认')
  })
  it('starts from a fresh copy of persisted settings on each open', async () => {
    const stored = makeConfig('parity', columns)
    const before = JSON.stringify(stored)
    const wrapper = setup({ load: async () => stored, save: async () => {} })
    await open(wrapper)
    await wrapper.get('button[title="左冻结 编号"]').trigger('click')
    expect(JSON.stringify(stored)).toBe(before)
    expect(wrapper.emitted('configChange')).toBeUndefined()
  })
})
