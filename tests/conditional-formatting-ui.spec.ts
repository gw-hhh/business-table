import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ConditionalFormattingFeature from '../src/features/conditional-formatting/ConditionalFormattingFeature.vue'
import type { ConditionalFormattingContext } from '../src/features/conditional-formatting/context'
import type { ConditionalRule } from '../src/features/conditional-formatting/model'
import type { ColumnConfig } from '../src/types'

const columns: ColumnConfig[] = [
  { id: 'name', field: 'name', title: '项目', type: 'text' },
  { id: 'amount', field: 'amount', title: '金额', type: 'number' },
]
const saved: ConditionalRule[] = [{ id: 'saved', condition: { field: 'amount', operator: 'gte', value: 200000 }, enabled: true, label: '需复核', color: '#92400e', background: '#fffbeb' }]
const mounted: VueWrapper[] = []
function setup(overrides: Partial<ConditionalFormattingContext> = {}) {
  const apply = vi.fn(async (_rules: ConditionalRule[]) => {})
  const close = vi.fn()
  const context: ConditionalFormattingContext = {
    columns, rules: saved, disabled: false, defaultColumn: 'name', apply,
    optionsFor: async () => [], close, ...overrides,
  }
  const wrapper = mount(ConditionalFormattingFeature, { attachTo: document.body, props: { context } })
  mounted.push(wrapper)
  return { context, apply, close, wrapper, dialog: () => [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-label="条件标记"]')].at(-1)! }
}
async function click(root: HTMLElement, text: string) {
  const button = [...root.querySelectorAll('button')].find(item => item.textContent?.trim() === text)
  expect(button, text).toBeDefined(); button!.click(); await flushPromises()
}
async function change(root: HTMLElement, label: string, value: string) {
  const input = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)
  expect(input, label).toBeTruthy(); input!.value = value
  input!.dispatchEvent(new Event(input!.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  await flushPromises()
}
afterEach(() => { mounted.splice(0).forEach(item => item.unmount()); document.body.innerHTML = '' })

describe('conditional formatting editor', () => {
  it('opens a wide drawer and discards a private draft on cancel', async () => {
    const { dialog, apply, close } = setup()
    expect(dialog().classList.contains('bt-conditional-dialog')).toBe(true)
    await change(dialog(), '提示文字', '新提示')
    await click(dialog(), '取消')
    expect(apply).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
    expect(saved[0]?.label).toBe('需复核')
  })

  it('resets a rule condition when its field changes and commits only on apply', async () => {
    const { dialog, apply, close } = setup()
    await change(dialog(), '标记字段', 'name')
    await change(dialog(), '筛选值', '水务')
    await click(dialog(), '应用标记')
    expect(apply).toHaveBeenCalledOnce()
    expect(apply.mock.calls[0]?.[0]?.[0]?.condition).toEqual({ field: 'name', operator: 'contains', value: '水务' })
    expect(close).toHaveBeenCalledOnce()
  })

  it('moves new rules ahead of older ones and applies a deleted list as empty', async () => {
    const { dialog, apply } = setup()
    await click(dialog(), '添加规则')
    const values = [...dialog().querySelectorAll<HTMLInputElement>('[aria-label="筛选值"]')]
    values[1]!.value = '水务'; values[1]!.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises()
    dialog().querySelectorAll<HTMLButtonElement>('[aria-label="上移规则"]')[1]!.click(); await flushPromises()
    await click(dialog(), '应用标记')
    expect(apply.mock.calls[0]?.[0]?.map(item => item.condition.field)).toEqual(['name', 'amount'])

    const cleared = setup()
    cleared.dialog().querySelector<HTMLButtonElement>('[aria-label="删除规则"]')!.click(); await flushPromises()
    await click(cleared.dialog(), '应用标记')
    expect(cleared.apply).toHaveBeenCalledWith([])
  })

  it('validates disabled rules and preserves the draft after a persistence failure', async () => {
    const apply = vi.fn(async (_rules: ConditionalRule[]) => { throw new Error('保存失败') })
    const { dialog, close } = setup({ apply })
    await change(dialog(), '提示文字', '待复核')
    await click(dialog(), '应用标记')
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('保存失败')
    expect((dialog().querySelector('[aria-label="提示文字"]') as HTMLInputElement).value).toBe('待复核')
    expect(close).not.toHaveBeenCalled()
    const checkbox = dialog().querySelector<HTMLInputElement>('[aria-label="启用规则"]')!
    checkbox.checked = false; checkbox.dispatchEvent(new Event('change', { bubbles: true })); await flushPromises()
    await change(dialog(), '筛选值', '')
    await click(dialog(), '应用标记')
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('数字')
    expect(apply).toHaveBeenCalledOnce()
  })

  it('lets disabled contexts inspect rules while disabling all editing actions', async () => {
    const { dialog, apply } = setup({ disabled: true })
    expect((dialog().querySelector('[aria-label="提示文字"]') as HTMLInputElement).value).toBe('需复核')
    expect((dialog().querySelector('[aria-label="提示文字"]') as HTMLInputElement).matches(':disabled')).toBe(true)
    expect([...dialog().querySelectorAll('button')].find(item => item.textContent === '应用标记')).toBeUndefined()
    expect(apply).not.toHaveBeenCalled()
  })
})
