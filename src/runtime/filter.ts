import type { FilterConfig, RowData } from '../types'
import { getValue } from './value'

export interface FilterGroup { logic: 'and' | 'or'; rules: (FilterConfig | FilterGroup)[] }
export const FILTER_LIMITS = Object.freeze({ rules: 30, depth: 8, nodes: 128, values: 200 })
export const operatorLabels: Record<FilterConfig['operator'], string> = {
  eq: '等于', ne: '不等于', contains: '包含', starts: '开头是', in: '属于', notIn: '不属于',
  gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于', between: '区间',
  empty: '为空', notEmpty: '不为空', nextDays: '未来天数', pastDays: '过去天数',
}

type Primitive = string | number | boolean | null
const empty = (value: unknown) => value === null || value === undefined || value === ''
const primitive = (value: unknown): value is Primitive => value === null || typeof value === 'boolean'
  || typeof value === 'string' && value.length <= 2000 || typeof value === 'number' && Number.isFinite(value)
const comparable = (value: unknown): value is string | number => typeof value === 'number' && Number.isFinite(value)
  || typeof value === 'string' && value.trim().length > 0 && value.length <= 2000
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
/** Calendar date, not Date.parse's permissive overflow normalization. */
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

/** Persisted conditions contain data only. Invalid payloads are rejected, never partially applied. */
export function readFilter(input: unknown, fields?: ReadonlySet<string>): FilterConfig | null {
  if (!record(input)) return null
  const { field, operator, value } = input
  if (typeof field !== 'string' || !field || field.length > 160 || fields && !fields.has(field)
    || field.split('.').some(key => !key || ['__proto__', 'prototype', 'constructor'].includes(key))) return null
  if (typeof operator !== 'string' || !Object.hasOwn(operatorLabels, operator)) return null
  let raw: Primitive | Primitive[]
  if (operator === 'empty' || operator === 'notEmpty') raw = null
  else if (operator === 'in' || operator === 'notIn') {
    if (!Array.isArray(value) || !value.length || value.length > FILTER_LIMITS.values || !value.every(primitive)) return null
    raw = [...value]
  } else if (operator === 'between') {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(comparable) || typeof value[0] !== typeof value[1]) return null
    if (compare(value[0], value[1]) > 0) return null
    raw = [...value] as (string | number)[]
  } else if (operator === 'nextDays' || operator === 'pastDays') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 36500) return null
    raw = value
  } else if (operator === 'contains' || operator === 'starts') {
    if (typeof value !== 'string' || !value.trim() || value.length > 2000) return null
    raw = value
  } else if (['gt', 'gte', 'lt', 'lte'].includes(operator)) {
    if (!comparable(value)) return null
    raw = value
  } else {
    if (!primitive(value)) return null
    raw = value
  }
  const filter: FilterConfig = { field, operator: operator as FilterConfig['operator'], value: raw }
  if (input.unitFactor !== undefined) {
    if (typeof input.unitFactor !== 'number' || !Number.isFinite(input.unitFactor) || input.unitFactor <= 0 || input.unitFactor > 1e8) return null
    filter.unitFactor = input.unitFactor
  }
  return filter
}

export function readFilterGroup(input: unknown, fields?: ReadonlySet<string>, depth = 0): FilterGroup | undefined {
  let rules = 0, nodes = 0
  const ancestors = new WeakSet<object>()
  function visit(value: unknown, level: number): FilterGroup | undefined {
    if (!record(value) || level > FILTER_LIMITS.depth || ++nodes > FILTER_LIMITS.nodes || ancestors.has(value)) return undefined
    if (value.logic !== 'and' && value.logic !== 'or' || !Array.isArray(value.rules)
      || value.rules.length > FILTER_LIMITS.nodes || level > 0 && !value.rules.length) return undefined
    ancestors.add(value)
    const output: FilterGroup = { logic: value.logic, rules: [] }
    for (const item of value.rules) {
      if (++nodes > FILTER_LIMITS.nodes) return undefined
      const parsed = record(item) && Object.hasOwn(item, 'rules')
        ? visit(item, level + 1) : ++rules <= FILTER_LIMITS.rules ? readFilter(item, fields) : null
      if (!parsed) return undefined
      output.rules.push(parsed)
    }
    ancestors.delete(value)
    return output
  }
  return visit(input, depth)
}

function compare(first: unknown, second: unknown): number {
  if (!comparable(first) || !comparable(second)) return NaN
  if (typeof first === 'number' || typeof second === 'number') {
    const a = Number(first), b = Number(second)
    return Number.isFinite(a) && Number.isFinite(b) ? a - b : NaN
  }
  return first === second ? 0 : first < second ? -1 : 1
}
function evaluate(row: RowData, rule: FilterConfig, today: string): boolean {
  const value = getValue(row, rule.field), query = rule.value
  switch (rule.operator) {
    case 'eq': return Object.is(value, query)
    case 'ne': return !Object.is(value, query)
    case 'contains': return String(value ?? '').toLocaleLowerCase().includes(String(query).toLocaleLowerCase())
    case 'starts': return String(value ?? '').toLocaleLowerCase().startsWith(String(query).toLocaleLowerCase())
    case 'in': return (query as Primitive[]).some(item => Object.is(item, value))
    case 'notIn': return !(query as Primitive[]).some(item => Object.is(item, value))
    case 'empty': return empty(value)
    case 'notEmpty': return !empty(value)
    case 'gt': return compare(value, query) > 0
    case 'gte': return compare(value, query) >= 0
    case 'lt': return compare(value, query) < 0
    case 'lte': return compare(value, query) <= 0
    case 'between': return compare(value, (query as Primitive[])[0]) >= 0 && compare(value, (query as Primitive[])[1]) <= 0
    case 'nextDays': case 'pastDays': {
      if (!isCalendarDay(value) || !isCalendarDay(today)) return false
      const days = (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
      return rule.operator === 'nextDays' ? days >= 0 && days <= Number(query) : days <= 0 && days >= -Number(query)
    }
  }
}
export function compileFilter(input: unknown, today = localDay()): (row: RowData) => boolean {
  const rule = readFilter(input)
  return rule ? row => evaluate(row, rule, today) : () => false
}
export function matchesFilter(row: RowData, rule: FilterConfig, today = localDay()): boolean {
  return compileFilter(rule, today)(row)
}
/** Validate once per query, not once per row. Invalid OR branches cannot short-circuit validation. */
export function compileFilterGroup(input?: FilterGroup, today = localDay(), depth = 0): (row: RowData) => boolean {
  if (input === undefined) return () => true
  const root = readFilterGroup(input, undefined, depth)
  if (!root) return () => false
  function run(row: RowData, group: FilterGroup): boolean {
    if (!group.rules.length) return true
    const test = (item: FilterConfig | FilterGroup) => 'rules' in item ? run(row, item) : evaluate(row, item, today)
    return group.logic === 'and' ? group.rules.every(test) : group.rules.some(test)
  }
  return row => run(row, root)
}
export function matchesFilterGroup(row: RowData, group?: FilterGroup, today = localDay(), depth = 0): boolean {
  return compileFilterGroup(group, today, depth)(row)
}
