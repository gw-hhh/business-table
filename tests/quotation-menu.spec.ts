import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../demo/App.vue'

const Grid = defineComponent({ template: '<div><slot /></div>' })
const Column = defineComponent({ template: '<div><slot name="header" /></div>' })
let wrapper: VueWrapper | undefined
async function setup() {
  wrapper = mount(App, { attachTo: document.body, global: { stubs: { 'vxe-table': Grid, 'vxe-column': Column } } }) as VueWrapper
  await flushPromises(); await nextTick()
  return wrapper
}
beforeEach(() => localStorage.clear())
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; localStorage.clear() })

describe('quotation page menu keyboard behavior', () => {
  it('opens page actions with ArrowDown and focuses the first command', async () => {
    const page = await setup()
    const trigger = page.get('button[aria-label="更多页面操作"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('keydown', { key: 'ArrowDown' }); await flushPromises()
    const menu = page.find('.q-page-menu')
    expect(menu.exists()).toBe(true)
    expect(document.activeElement).toBe(menu.findAll('[role="menuitem"]')[0].element)
  })
  it('supports End, Home and wrapping arrow navigation without changing data', async () => {
    const page = await setup()
    await page.get('button[aria-label="更多页面操作"]').trigger('click'); await flushPromises()
    const items = page.findAll('.q-page-menu [role="menuitem"]')
    ;(items[0].element as HTMLElement).focus()
    await items[0].trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(items[3].element)
    await items[3].trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0].element)
    await items[0].trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[3].element)
    await items[3].trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(items[0].element)
    expect(localStorage.getItem('business-table.quotation-demo.data.v1')).toBeNull()
  })
  it('Tab closes the menu and continues to the next field outside it', async () => {
    const page = await setup()
    await page.get('button[aria-label="更多页面操作"]').trigger('click'); await flushPromises()
    const first = page.get('.q-page-menu [role="menuitem"]')
    ;(first.element as HTMLElement).focus()
    await first.trigger('keydown', { key: 'Tab' }); await nextTick()
    expect(page.find('.q-page-menu').exists()).toBe(false)
    expect(document.activeElement).toBe(page.get('#quotation-keyword').element)
  })
  it('opens density options from the keyboard and restores focus after selection', async () => {
    const page = await setup()
    const trigger = page.get('button[title="行高密度"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('keydown', { key: 'ArrowUp' }); await flushPromises()
    const menu = page.find('.q-density-menu')
    expect(menu.exists()).toBe(true)
    const items = menu.findAll('[role="menuitemradio"]')
    expect(document.activeElement).toBe(items[2].element)
    await items[0].trigger('click'); await nextTick()
    expect(page.find('.q-density-menu').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    expect(page.get('[data-business-table]').classes()).toContain('bt--compact')
  })
  it('does not capture arrow keys from a query input while a menu remains open', async () => {
    const page = await setup()
    await page.get('button[aria-label="更多页面操作"]').trigger('click')
    const input = page.get('#quotation-keyword')
    ;(input.element as HTMLElement).focus()
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(input.element)
  })
})
