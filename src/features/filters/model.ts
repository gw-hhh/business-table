import type { ColumnConfig, FilterConfig, RowData } from '../../types'
import { getValue, typedKey } from '../../runtime/value'
import { evaluateCell } from '../columns/evaluate'
export type FilterType = 'text' | 'number' | 'date' | 'single' | 'multi' | 'boolean'
export interface FilterOption { value: string | number | boolean | null; label: string; count?: number }
export interface ColumnFilterConfig {
  enabled: boolean; type: FilterType; source: 'data' | 'mapping' | 'manual' | 'remote'
  search: boolean; counts: boolean; operators: FilterConfig['operator'][]; options: FilterOption[]
}
export { operatorLabels, localDay, isCalendarDay, matchesFilter, matchesFilterGroup, compileFilter, compileFilterGroup, readFilter, readFilterGroup, FILTER_LIMITS, type FilterGroup } from '../../runtime/filter'
export const operatorsByType: Record<FilterType, FilterConfig['operator'][]> = {
  text:['contains','eq','ne','starts','empty','notEmpty'],
  number:['eq','ne','gt','gte','lt','lte','between','empty','notEmpty'],
  date:['eq','gte','lte','between','nextDays','pastDays','empty','notEmpty'],
  single:['in','notIn','empty','notEmpty'],multi:['in','notIn','empty','notEmpty'],boolean:['in','empty','notEmpty'],
}
export function defaultColumnFilter(column: ColumnConfig): ColumnFilterConfig {
  const type: FilterType = ['number','currency','percent'].includes(column.type ?? '') ? 'number' : column.type === 'date' ? 'date' : column.type === 'boolean' ? 'boolean' : column.type === 'enum' ? 'multi' : 'text'
  return { type, source:'data',search:true,counts:true,operators:[...operatorsByType[type]],options:[],...column.filter, enabled:column.filterable!==false&&column.kind!=='actions'&&column.filter?.enabled!==false }
}
export function collectFilterOptions(rows: readonly RowData[], column: ColumnConfig): FilterOption[] {
  const values = new Map<string, FilterOption>()
  for (const row of rows) {
    const raw = getValue(row, column.field)
    if (raw !== null && raw !== undefined && !['number','string','boolean'].includes(typeof raw)) continue
    const value = raw ?? null
    const key = typedKey(value), previous = values.get(key)
    if (previous) previous.count = (previous.count ?? 0) + 1
    else values.set(key, { value: value as FilterOption['value'], label: evaluateCell(row,column).text, count:1 })
  }
  return [...values.values()]
}
