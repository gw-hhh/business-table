import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FilterRuleEditor from '../src/features/filters/FilterRuleEditor.vue'
import { createFilterDraft, parseFilterDraft } from '../src/features/filters/editor'
import { defaultColumnFilter } from '../src/features/filters/model'
import { filterSchema } from '../src/features/columns/schema'
import { formatFilterSummary } from '../src/features/filters/summary'
import type { ColumnConfig } from '../src/types'

describe('declared filter input units', () => {
  const amount: ColumnConfig = { id: 'amount', field: 'amount', title: '金额', type: 'number' }
  it('validates declared units without introducing a business-field exception', () => {
    expect(filterSchema.safeParse({ inputUnit: '元' }).success).toBe(true)
    expect(filterSchema.safeParse({ inputUnit: 'x'.repeat(41) }).success).toBe(false)
    expect(filterSchema.safeParse({ inputUnit: () => '元' }).success).toBe(false)
  })
  it('shows the configured unit in the editor and retains raw numeric values', () => {
    const column = { ...amount, filter: { ...defaultColumnFilter(amount), inputUnit: '元' } }
    const draft = { ...createFilterDraft(column), operator: 'gte' as const, value: '10' }
    const editor = mount(FilterRuleEditor, { props: { column, modelValue: draft, optionsFor: async () => [] } })
    expect(editor.text()).toContain('输入单位：元。')
    expect(parseFilterDraft(draft, column).value).toBe(10)
    expect(formatFilterSummary(parseFilterDraft(draft, column), column)).toBe('金额：大于等于 10 元')
    editor.unmount()
  })
  it('uses the saved scale when a display format changes after a filter was saved', () => {
    const column = { ...amount, numberRule: { enabled: true, scale: 10000 as const }, filter: { ...defaultColumnFilter(amount), inputUnit: '元' } }
    const draft = { ...createFilterDraft(column), value: '2' }
    const saved = parseFilterDraft(draft, column)
    expect(saved.value).toBe(20000)
    const updated = { ...column, numberRule: { enabled: true, scale: 1000 as const } }
    const restored = createFilterDraft(updated, saved)
    expect(restored.value).toBe('2')
    expect(formatFilterSummary(saved, updated)).toBe('金额：等于 2 万元')
    const editor = mount(FilterRuleEditor, { props: { column: updated, modelValue: restored, optionsFor: async () => [] } })
    expect(editor.text()).toContain('输入单位：万元。')
    expect(parseFilterDraft(restored, updated).value).toBe(20000)
    editor.unmount()
  })
})
