import type { ColumnConfig, FilterConfig, RowData } from '../../types'
import { getValue, typedKey } from '../../runtime/value'
import { evaluateCell } from '../columns/evaluate'
export type FilterType = 'text' | 'number' | 'date' | 'single' | 'multi' | 'boolean'
export interface FilterGroup { logic: 'and' | 'or'; rules: (FilterConfig | FilterGroup)[] }
export interface FilterOption { value: string | number | boolean | null; label: string; count?: number }
export interface ColumnFilterConfig {
  enabled: boolean; type: FilterType; source: 'data' | 'mapping' | 'manual' | 'remote'
  search: boolean; counts: boolean; operators: FilterConfig['operator'][]; options: FilterOption[]
}
export const operatorLabels: Record<FilterConfig['operator'], string> = {
  eq:'等于',ne:'不等于',contains:'包含',starts:'开头是',in:'属于',notIn:'不属于',gt:'大于',gte:'大于等于',lt:'小于',lte:'小于等于',between:'区间',empty:'为空',notEmpty:'不为空',nextDays:'未来天数',pastDays:'过去天数',
}
export const operatorsByType: Record<FilterType, FilterConfig['operator'][]> = {
  text:['contains','eq','ne','starts','empty','notEmpty'],
  number:['eq','ne','gt','gte','lt','lte','between','empty','notEmpty'],
  date:['eq','gte','lte','between','nextDays','pastDays','empty','notEmpty'],
  single:['in','notIn','empty','notEmpty'],multi:['in','notIn','empty','notEmpty'],boolean:['in','empty','notEmpty'],
}
export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
}
const empty = (value: unknown) => value === null || value === undefined || value === ''
function compare(first: unknown, second: unknown): number {
  if (typeof first === 'number' || typeof second === 'number') {
    if (empty(first) || empty(second) || !Number.isFinite(Number(first)) || !Number.isFinite(Number(second))) return NaN
    return Number(first) - Number(second)
  }
  const a = String(first ?? ''), b = String(second ?? '')
  return a === b ? 0 : a < b ? -1 : 1
}
export function matchesFilter(row: RowData, rule: FilterConfig, today = localDay()): boolean {
  const value = getValue(row, rule.field), query = rule.value
  switch (rule.operator) {
    case 'eq': return Object.is(value, query)
    case 'ne': return !Object.is(value, query)
    case 'contains': return String(value ?? '').toLocaleLowerCase().includes(String(query ?? '').toLocaleLowerCase())
    case 'starts': return String(value ?? '').toLocaleLowerCase().startsWith(String(query ?? '').toLocaleLowerCase())
    case 'in': return Array.isArray(query) && query.some(item => Object.is(item, value))
    case 'notIn': return Array.isArray(query) && !query.some(item => Object.is(item, value))
    case 'empty': return empty(value)
    case 'notEmpty': return !empty(value)
    case 'gt': return compare(value, query) > 0
    case 'gte': return compare(value, query) >= 0
    case 'lt': return compare(value, query) < 0
    case 'lte': return compare(value, query) <= 0
    case 'between': return Array.isArray(query) && query.length === 2 && compare(value, query[0]) >= 0 && compare(value, query[1]) <= 0
    case 'nextDays': case 'pastDays': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isInteger(query) || Number(query) < 0 || Number(query) > 36500) return false
      const days = Math.round((Date.parse(value + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
      return rule.operator === 'nextDays' ? days >= 0 && days <= Number(query) : days <= 0 && days >= -Number(query)
    }
    default: return false
  }
}
export function matchesFilterGroup(row: RowData, group?: FilterGroup, today = localDay(), depth = 0): boolean {
  if (!group) return true
  if (depth > 8 || !Array.isArray(group.rules) || !['and', 'or'].includes(group.logic)) return false
  if (!group.rules.length) return true
  const test = (rule: FilterConfig | FilterGroup) => 'rules' in rule ? matchesFilterGroup(row, rule, today, depth + 1) : matchesFilter(row, rule, today)
  return group.logic === 'or' ? group.rules.some(test) : group.rules.every(test)
}
export function defaultColumnFilter(column: ColumnConfig): ColumnFilterConfig {
  const type: FilterType = ['number','currency','percent'].includes(column.type ?? '') ? 'number' : column.type === 'date' ? 'date' : column.type === 'boolean' ? 'boolean' : column.type === 'enum' ? 'multi' : 'text'
  return { enabled: column.filterable !== false && column.kind !== 'actions', type, source:'data',search:true,counts:true,operators:[...operatorsByType[type]],options:[],...column.filter }
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

/** Validate a persisted query independently of labels and current display formats. */
export function readFilter(input: unknown, fields?: ReadonlySet<string>): FilterConfig | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (typeof value.field !== 'string' || !value.field || value.field.length > 160 || fields && !fields.has(value.field)) return null
  if (typeof value.operator !== 'string' || !Object.hasOwn(operatorLabels, value.operator)) return null
  const primitive = (item: unknown): boolean => item === null || ['string','boolean'].includes(typeof item) || typeof item === 'number' && Number.isFinite(item)
  const raw = value.value
  if (!(raw === undefined || primitive(raw) || Array.isArray(raw) && raw.length <= 200 && raw.every(primitive))) return null
  const operator = value.operator as FilterConfig['operator']
  if (['in','notIn','between'].includes(operator) && !Array.isArray(raw)) return null
  if (operator === 'between' && (raw as unknown[]).length !== 2) return null
  const filter: FilterConfig = { field: value.field, operator, value: raw === undefined ? null : Array.isArray(raw) ? [...raw] : raw }
  if (typeof value.unitFactor === 'number' && Number.isFinite(value.unitFactor) && value.unitFactor > 0 && value.unitFactor <= 1e8) filter.unitFactor = value.unitFactor
  return filter
}
export function readFilterGroup(input: unknown, fields?: ReadonlySet<string>, depth = 0): FilterGroup | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input) || depth > 8) return undefined
  const value = input as Record<string, unknown>
  if (!['and','or'].includes(String(value.logic)) || !Array.isArray(value.rules)) return undefined
  const rules = value.rules.slice(0, 30).flatMap(item => {
    const parsed = item && typeof item === 'object' && 'rules' in item ? readFilterGroup(item, fields, depth + 1) : readFilter(item, fields)
    return parsed ? [parsed] : []
  })
  return { logic: value.logic as 'and' | 'or', rules }
}
