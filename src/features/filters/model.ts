import type { ColumnConfig, FilterConfig, RowData } from '../../types'
import { getValue, typedKey } from '../../runtime/value'
import { evaluateCell } from '../columns/evaluate'
export type FilterType = 'text' | 'number' | 'date' | 'single' | 'multi' | 'boolean'
export interface FilterOption { value: string | number | boolean | null; label: string; count?: number }
export type FilterOptionsLoader = (column: ColumnConfig, search: string, signal: AbortSignal, values?: readonly FilterOption['value'][]) => Promise<FilterOption[]>
/** Shared validation for option pickers and restored-filter label lookups. */
export function readFilterOptions(input: unknown): FilterOption[] {
  if (!Array.isArray(input) || input.length > 10000) throw new Error('选项接口返回的数据无效。')
  const seen = new Set<string>()
  return input.map((option: unknown) => {
    if (option === null || typeof option !== 'object' || Array.isArray(option)) throw new Error('选项接口返回的数据无效。')
    const { value, label, count } = option as Record<string, unknown>
    if (typeof label !== 'string' || label.length > 2000 || !(value === null || typeof value === 'boolean'
      || typeof value === 'string' && value.length <= 2000 || typeof value === 'number' && Number.isFinite(value))) throw new Error('选项接口返回的数据无效。')
    return { value, label, ...(Number.isSafeInteger(count) && Number(count) >= 0 ? { count: Number(count) } : {}) }
  }).filter(option => { const key = typedKey(option.value); if (seen.has(key)) return false; seen.add(key); return true })
}
export interface ColumnFilterConfig {
  enabled: boolean; type: FilterType; source: 'data' | 'mapping' | 'manual' | 'remote'
  search: boolean; counts: boolean; operators: FilterConfig['operator'][]; options: FilterOption[]
  /** Base unit of raw numeric values, e.g. 元, 件, kg. Does not convert data. */
  inputUnit?: string
}
export function filterInputUnit(column?: ColumnConfig, factor = 1): string {
  if (factor === 0.01) return '%'
  const scale = factor === 1000 ? '千' : factor === 10000 ? '万' : factor === 100000000 ? '亿' : ''
  return scale + (column?.filter?.inputUnit ?? '')
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
