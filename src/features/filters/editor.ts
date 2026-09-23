import type { ColumnConfig, FilterConfig } from '../../types'
import type { NumberRule } from '../columns/types'
import { defaultColumnFilter, type FilterOption } from './model'
import { FILTER_LIMITS, isCalendarDay, readFilter, readFilterGroup, type FilterGroup } from '../../runtime/filter'

export interface FilterRuleDraft {
  id: string; field: string; operator: FilterConfig['operator']; value: string; to: string
  values: FilterOption['value'][]; unitFactor?: number
}
export interface FilterGroupDraft { id: string; logic: 'and' | 'or'; rules: (FilterRuleDraft | FilterGroupDraft)[] }
export { readFilterState, type FilterState } from '../../runtime/filter-state'
const id = () => crypto.randomUUID()

function currentFactor(column: ColumnConfig): number {
  const format: NumberRule = column.numberRule?.enabled ? column.numberRule : column.numberFormat
    ?? { style: column.type === 'percent' ? 'percent' : 'decimal' }
  return format.style === 'percent' ? format.percentBase === 'percent' ? 1 : 0.01 : format.scale ?? 1
}
export function createFilterDraft(column: ColumnConfig, initial?: FilterConfig): FilterRuleDraft {
  const config = defaultColumnFilter(column)
  const unitFactor = initial ? initial.unitFactor : config.type === 'number' ? currentFactor(column) : undefined
  const values = Array.isArray(initial?.value) ? initial.value : []
  const factor = unitFactor ?? 1
  const text = (value: unknown) => value == null ? '' : typeof value === 'number' ? String(value / factor) : String(value)
  return { id: id(), field: column.field, operator: initial?.operator ?? config.operators[0] ?? 'eq',
    value: text(initial?.operator === 'between' ? values[0] : initial?.value), to: initial?.operator === 'between' ? text(values[1]) : '',
    values: [...values] as FilterOption['value'][], ...(unitFactor === undefined ? {} : { unitFactor }) }
}
function numberInput(value: string, factor: number): number {
  const text = value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) throw new Error('请填写有效数字。')
  const shift = Math.log10(factor), [mantissa, exponent = '0'] = text.toLowerCase().split('e')
  // Powers of ten are applied in decimal space, avoiding e.g. 1.005 * 100 rounding artifacts.
  const result = Number.isInteger(shift) ? Number(`${mantissa}e${Number(exponent) + shift}`) : Number(text) * factor
  if (!Number.isFinite(result)) throw new Error('数字超出可用范围。')
  return result
}
export function parseFilterDraft(draft: FilterRuleDraft, column: ColumnConfig): FilterConfig {
  const config = defaultColumnFilter(column)
  if (draft.field !== column.field || !config.enabled || !config.operators.includes(draft.operator)) throw new Error('该字段或条件已不可用，请重新选择。')
  const { operator } = draft
  let value: unknown
  const input = (text: string) => {
    if (config.type === 'number') return numberInput(text, draft.unitFactor ?? 1)
    if (config.type === 'date') { if (!isCalendarDay(text)) throw new Error('请填写有效日期。'); return text }
    if (!text.trim()) throw new Error('请填写筛选值。')
    return text
  }
  if (operator === 'empty' || operator === 'notEmpty') value = null
  else if (operator === 'in' || operator === 'notIn') {
    if (!draft.values.length) throw new Error('请至少选择一项。')
    if (config.type === 'single' && draft.values.length !== 1) throw new Error('此字段只能选择一项。')
    value = [...draft.values]
  } else if (operator === 'nextDays' || operator === 'pastDays') {
    value = numberInput(draft.value, 1)
    if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 36500) throw new Error('天数应为 0–36500 的整数。')
  } else if (operator === 'between') {
    const from = input(draft.value), to = input(draft.to)
    if (from > to) throw new Error('下限不能大于上限。')
    value = [from, to]
  } else value = input(draft.value)
  const parsed = readFilter({ field: column.field, operator, value,
    ...(config.type === 'number' && draft.unitFactor !== undefined ? { unitFactor: draft.unitFactor } : {}) })
  if (!parsed) throw new Error('筛选条件无效，请检查输入。')
  return parsed
}
export function createFilterGroupDraft(columns: readonly ColumnConfig[], initial?: FilterGroup): FilterGroupDraft {
  const parsed = initial === undefined ? { logic: 'and' as const, rules: [] } : readFilterGroup(initial)
  if (!parsed) throw new Error('组合筛选无效，请检查条件。')
  function visit(group: FilterGroup): FilterGroupDraft {
    return { id: id(), logic: group.logic, rules: group.rules.map(rule => {
      if ('rules' in rule) return visit(rule)
      const column = columns.find(item => item.field === rule.field)
      if (!column) throw new Error('方案中的字段已不可用。')
      return createFilterDraft(column, rule)
    }) }
  }
  return visit(parsed)
}
export function parseFilterGroupDraft(draft: FilterGroupDraft, columns: readonly ColumnConfig[]): FilterGroup | undefined {
  let count = 0, nodes = 0
  const seen = new WeakSet<object>()
  function visit(group: FilterGroupDraft, depth: number): FilterGroup {
    if (seen.has(group) || ++nodes > FILTER_LIMITS.nodes || depth > FILTER_LIMITS.depth) throw new Error('条件组过深或过多。')
    seen.add(group)
    if (depth && !group.rules.length) throw new Error('请在条件组内添加条件，或删除空条件组。')
    return { logic: group.logic, rules: group.rules.map(rule => {
      if ('rules' in rule) return visit(rule, depth + 1)
      if (++count > FILTER_LIMITS.rules) throw new Error('最多添加 30 个条件。')
      const column = columns.find(item => item.field === rule.field)
      if (!column) throw new Error('筛选字段已不可用。')
      return parseFilterDraft(rule, column)
    }) }
  }
  const parsed = visit(draft, 0)
  if (!readFilterGroup(parsed)) throw new Error('组合筛选无效。')
  return parsed.rules.length ? parsed : undefined
}
