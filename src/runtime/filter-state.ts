import type { ColumnConfig, FilterConfig } from '../types'
import { defaultColumnFilter } from '../features/filters/model'
import { FILTER_LIMITS, isCalendarDay, readFilter, readFilterGroup, type FilterGroup } from './filter'

export interface FilterState { columnFilters: FilterConfig[]; filterGroup?: FilterGroup }
export function readFilterState(input: unknown): FilterState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('筛选配置无效。')
  const value = input as Partial<FilterState>
  if (!value || !Array.isArray(value.columnFilters) || value.columnFilters.length > FILTER_LIMITS.rules) throw new Error('列筛选配置无效。')
  const fields = new Set<string>()
  const columnFilters = value.columnFilters.map(rule => {
    const parsed = readFilter(rule)
    if (!parsed || fields.has(parsed.field)) throw new Error('列筛选配置无效或重复。')
    fields.add(parsed.field); return parsed
  })
  const filterGroup = value.filterGroup === undefined ? undefined : readFilterGroup(value.filterGroup)
  if (value.filterGroup !== undefined && !filterGroup) throw new Error('组合筛选配置无效。')
  return { columnFilters, ...(filterGroup?.rules.length ? { filterGroup } : {}) }
}
/** Recheck the live definition at apply time, including headless calls and saved plans. */
export function guardFilterState(value: FilterState, columns: readonly ColumnConfig[]): FilterState {
  const state = readFilterState(value)
  function check(rule: FilterConfig) {
    const column = columns.find(item => item.field === rule.field && defaultColumnFilter(item).enabled)
    if (!column) throw new Error('筛选字段已不可用，请重新选择。')
    const settings = defaultColumnFilter(column)
    if (!settings.operators.includes(rule.operator)) throw new Error(`${column.title}的筛选条件已不可用。`)
    if (['empty', 'notEmpty', 'nextDays', 'pastDays', 'in', 'notIn'].includes(rule.operator)) return
    const values = Array.isArray(rule.value) ? rule.value : [rule.value]
    if (settings.type === 'number' && values.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`${column.title}需要有效数字。`)
    if (settings.type === 'date' && values.some(value => !isCalendarDay(value))) throw new Error(`${column.title}需要有效日期。`)
  }
  function group(value: FilterGroup) { value.rules.forEach(rule => 'rules' in rule ? group(rule) : check(rule)) }
  state.columnFilters.forEach(check)
  if (state.filterGroup) group(state.filterGroup)
  return state
}
