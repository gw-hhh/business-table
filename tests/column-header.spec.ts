import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ColumnHeader from '../src/features/columns/ColumnHeader.vue'
import type { ColumnHeaderContext } from '../src/features/columns/header'

afterEach(() => { document.body.innerHTML = '' })
function setup(overrides: Partial<ColumnHeaderContext> = {}) {
  const context: ColumnHeaderContext = {
    column: { id: 'amount', field: 'amount', title: '金额', width: 180, minWidth: 100, sortable: true },
    baseWidth: 160, sorts: [], filterable: true, filtered: false, settings: true,
    access: () => ({ visible: true, disabled: false }),
    patch: vi.fn(async () => {}), sort: vi.fn(async () => {}), filter: vi.fn(), configure: vi.fn(),
    ...overrides,
  }
  const wrapper = mount(ColumnHeader, { props: { context }, attachTo: document.body })
  return { wrapper, context }
}
describe('column header controls', () => {
  it('opens the shared settings and preserves raw column identity when sorting', async () => {
    const { wrapper, context } = setup()
    await wrapper.get('[aria-label="金额列菜单"]').trigger('click')
    await flushPromises()
    const command = [...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(item => item.textContent?.includes('降序排列'))!
    command.click(); await flushPromises()
    expect(context.sort).toHaveBeenCalledWith('desc')
    expect(document.querySelector('[role=menu]')).toBeNull()
    wrapper.unmount()
  })
  it('omits undeclared controls, displays explicit readonly controls and prevents resize writes', async () => {
    const { wrapper, context } = setup({ access: field => ({ visible: field === 'width', disabled: field === 'width' }) })
    await wrapper.get('[aria-label="金额列菜单"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).not.toContain('重命名列')
    expect(document.body.textContent).not.toContain('冻结在左侧')
    const reset = [...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(item => item.textContent?.includes('恢复默认列宽'))!
    expect(reset.disabled).toBe(true)
    await wrapper.get('[role=separator]').trigger('keydown', { key: 'ArrowRight' })
    expect(context.patch).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('adjusts width with keyboard, clamps limits and restores the configured width', async () => {
    const { wrapper, context } = setup()
    const handle = wrapper.get('[role=separator]')
    await handle.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(context.patch).toHaveBeenCalledWith({ width: 190 })
    await handle.trigger('dblclick')
    expect(context.patch).toHaveBeenLastCalledWith({ width: 160 })
    wrapper.unmount()
  })
})
