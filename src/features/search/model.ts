import type { DiagnosticReporter } from '../../config/diagnostics'
import type { RuntimeRegistry } from '../../runtime/registry'
import { FILTER_LIMITS, isCalendarDay, readFilter } from '../../runtime/filter'
import type { FilterConfig } from '../../types'

export type SearchJson = string | number | boolean | null | SearchJson[] | { [key: string]: SearchJson }
export type SearchValues = Record<string, SearchJson>
export type SearchItemType = 'keyword' | 'text' | 'select' | 'date' | 'number' | 'custom'
export interface SearchOption {
  value: string | number | boolean | null
  label: string
  /** An equality choice may project a named preset into explicit backend conditions. */
  filters?: FilterConfig[]
}
export interface SearchSummaryItem { id: string; label: string; value: SearchJson; displayValue: string }
export interface SearchItem {
  id: string
  label?: string
  placeholder?: string
  kind: SearchItemType
  field?: string
  operator?: FilterConfig['operator']
  defaultValue?: SearchJson
  advanced?: boolean
  options?: SearchOption[]
}
export interface SearchDefinition { items: SearchItem[]; resetBehavior: 'default' | 'empty'; defaultCollapsed?: boolean }
export interface SearchProjection { keyword: string; filters: FilterConfig[] }

const operators: Record<Exclude<SearchItemType, 'keyword' | 'custom'>, readonly FilterConfig['operator'][]> = {
  text: ['eq', 'ne', 'contains', 'starts'],
  select: ['eq', 'ne', 'in', 'notIn'],
  date: ['eq', 'gte', 'lte'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
}
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160
  && !['__proto__', 'prototype', 'constructor'].includes(value)
const fieldName = (value: unknown): value is string => identifier(value) && value.split('.').every(part => identifier(part))
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const issue = (report: DiagnosticReporter | undefined, path: string, message: string,
  code: 'SchemaValidationError' | 'UnknownRegistryId' | 'MigrationError' = 'SchemaValidationError') => report?.({ code, path, message })
const valuesObject = (): SearchValues => Object.create(null) as SearchValues

/** Copy only finite JSON data. Accessors, non-plain objects and cycles never enter a query or snapshot. */
function jsonData(input: unknown): SearchJson {
  const ancestors = new WeakSet<object>()
  let nodes = 0
  function copy(value: unknown, depth: number): SearchJson {
    if (++nodes > 1000 || depth > 16) throw new Error('搜索值过大。')
    if (value === null || typeof value === 'boolean') return value
    if (typeof value === 'string' && value.length <= 2000) return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value !== 'object') throw new Error('搜索值必须是可保存的数据。')
    if (ancestors.has(value)) throw new Error('搜索值不能循环引用。')
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) throw new Error('搜索值必须是普通对象。')
    ancestors.add(value)
    if (Array.isArray(value)) {
      if (value.length > 200) throw new Error('搜索值项目过多。')
      const result = value.map(item => copy(item, depth + 1))
      ancestors.delete(value)
      return result
    }
    const source = value as Record<string, unknown>
    const keys = Object.keys(source)
    if (keys.length > 200) throw new Error('搜索值字段过多。')
    const result: Record<string, SearchJson> = Object.create(null) as Record<string, SearchJson>
    for (const key of keys) {
      if (!identifier(key)) throw new Error('搜索值字段名无效。')
      const descriptor = Object.getOwnPropertyDescriptor(source, key)
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('搜索值不能包含访问器。')
      result[key] = copy(descriptor.value, depth + 1)
    }
    ancestors.delete(value)
    return result
  }
  return copy(input, 0)
}

export function readSearchJson(input: unknown, report?: DiagnosticReporter, path = 'search.values'): SearchJson | undefined {
  try { return jsonData(input) }
  catch (cause) { issue(report, path, cause instanceof Error ? cause.message : String(cause)); return undefined }
}

function validValue(value: SearchJson, item: SearchItem): boolean {
  if (item.kind === 'custom') return true
  if (item.kind === 'keyword') return typeof value === 'string' && value.length <= 1000
  if (item.kind === 'text') return typeof value === 'string'
  if (item.kind === 'date') return value === '' || value === null || isCalendarDay(value)
  if (item.kind === 'number') return value === null || typeof value === 'number' && Number.isFinite(value)
  const choices = item.options
  const allowed = (entry: SearchJson) => entry === null || (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean')
    && (!choices || choices.some(option => Object.is(option.value, entry)))
  if (item.operator === 'in' || item.operator === 'notIn') return Array.isArray(value) && value.length > 0
    && value.length <= FILTER_LIMITS.values && value.every(allowed)
  return allowed(value)
}

function checkedValue(input: unknown, item: SearchItem, report?: DiagnosticReporter, path = `search.values.${item.id}`): SearchJson | undefined {
  try {
    const value = jsonData(input)
    if (!validValue(value, item)) throw new Error('搜索值与字段类型或可选项不匹配。')
    return value
  } catch (cause) {
    issue(report, path, cause instanceof Error ? cause.message : String(cause))
    return undefined
  }
}

function dateRangeValid(values: SearchValues, definition: SearchDefinition): boolean {
  for (const item of definition.items) {
    if (item.kind !== 'date' || item.operator !== 'gte' || !item.field) continue
    const lower = values[item.id]
    if (typeof lower !== 'string' || lower === '') continue
    for (const upperItem of definition.items) {
      if (upperItem.kind !== 'date' || upperItem.operator !== 'lte' || upperItem.field !== item.field) continue
      const upper = values[upperItem.id]
      if (typeof upper === 'string' && upper !== '' && lower > upper) return false
    }
  }
  return true
}

function customEntry(item: SearchItem, registry?: RuntimeRegistry, report?: DiagnosticReporter) {
  const entry = registry?.get('search', item.id)
  if (!entry) issue(report, `search.items.${item.id}`, '自定义搜索组件未注册。', 'UnknownRegistryId')
  return entry
}

export function normalizeSearchDefinition(input: unknown, allowedIds?: readonly string[], report?: DiagnosticReporter): SearchDefinition {
  const output: SearchDefinition = { items: [], resetBehavior: 'default' }
  if (!record(input)) { issue(report, 'search', '搜索定义必须是对象。'); return output }
  if (input.defaultCollapsed !== undefined) {
    if (typeof input.defaultCollapsed === 'boolean') output.defaultCollapsed = input.defaultCollapsed
    else issue(report, 'search.defaultCollapsed', '搜索区默认状态无效。')
  }
  if (input.resetBehavior !== undefined) {
    if (input.resetBehavior === 'default' || input.resetBehavior === 'empty') output.resetBehavior = input.resetBehavior
    else issue(report, 'search.resetBehavior', '搜索重置方式无效，已使用默认方式。')
  }
  if (!Array.isArray(input.items) || input.items.length > 100) {
    issue(report, 'search.items', '搜索字段必须是最多 100 项的数组。')
    return output
  }
  const seen = new Set<string>(), allowed = allowedIds === undefined ? undefined : new Set(allowedIds)
  for (const [index, raw] of input.items.entries()) {
    const path = `search.items.${index}`
    if (!record(raw) || !identifier(raw.id) || typeof raw.kind !== 'string'
      || !['keyword', 'text', 'select', 'date', 'number', 'custom'].includes(raw.kind)) {
      issue(report, path, '搜索字段 ID 或类型无效。'); continue
    }
    const id = raw.id, type = raw.kind as SearchItemType
    if (seen.has(id)) { issue(report, `${path}.id`, '搜索字段 ID 重复。'); continue }
    seen.add(id)
    if (allowed && !allowed.has(id)) { issue(report, `${path}.id`, '搜索字段不在允许范围内。'); continue }
    const operator = raw.operator ?? (type === 'select' ? 'eq' : undefined)
    if (type !== 'keyword' && type !== 'custom'
      && (!fieldName(raw.field) || !operators[type].includes(operator as FilterConfig['operator']))) {
      issue(report, path, '搜索字段需要有效的 field 和 operator。'); continue
    }
    const item: SearchItem = { id, kind: type }
    if (raw.label !== undefined) {
      if (typeof raw.label !== 'string' || raw.label.length > 100) { issue(report, `${path}.label`, '搜索字段名称无效。'); continue }
      item.label = raw.label
    }
    if (raw.placeholder !== undefined) {
      if (typeof raw.placeholder !== 'string' || raw.placeholder.length > 200) { issue(report, `${path}.placeholder`, '搜索字段提示无效。'); continue }
      item.placeholder = raw.placeholder
    }
    if (type !== 'keyword' && type !== 'custom') { item.field = raw.field as string; item.operator = operator as FilterConfig['operator'] }
    if (raw.advanced !== undefined) {
      if (typeof raw.advanced !== 'boolean') { issue(report, `${path}.advanced`, '高级搜索标记无效。'); continue }
      item.advanced = raw.advanced
    }
    if (raw.options !== undefined) {
      if (type !== 'select' || !Array.isArray(raw.options) || raw.options.length > 200
        || !raw.options.every(option => record(option) && (option.value === null || typeof option.value === 'boolean'
          || typeof option.value === 'string' && option.value.length <= 2000
          || typeof option.value === 'number' && Number.isFinite(option.value))
          && typeof option.label === 'string' && option.label.length <= 200
          && (option.filters === undefined || operator === 'eq' && Array.isArray(option.filters)
            && option.filters.length <= FILTER_LIMITS.rules && option.filters.every(rule => readFilter(rule) !== null)))) {
        issue(report, `${path}.options`, '搜索选项无效。'); continue
      }
      item.options = raw.options.map(option => ({ value: option.value, label: option.label,
        ...(option.filters === undefined ? {} : { filters: option.filters.map((rule: unknown) => readFilter(rule)!) }),
      })) as SearchOption[]
    }
    if (raw.defaultValue !== undefined) {
      const value = checkedValue(raw.defaultValue, item, report, `${path}.defaultValue`)
      if (value !== undefined) item.defaultValue = value
    }
    output.items.push(item)
  }
  const defaults = defaultSearchValues(output)
  if (!dateRangeValid(defaults, output)) {
    issue(report, 'search.items.dateRange', '默认日期区间无效。')
    for (const item of output.items) if (item.kind === 'date') delete item.defaultValue
  }
  return output
}

export function defaultSearchValues(definition: SearchDefinition, mode: 'initial' | 'reset' = 'initial'): SearchValues {
  const result = valuesObject()
  if (mode === 'reset' && definition.resetBehavior === 'empty') return result
  for (const item of definition.items) if (item.defaultValue !== undefined) result[item.id] = jsonData(item.defaultValue)
  return result
}
export function readSearchValues(input: unknown, definition: SearchDefinition, registry?: RuntimeRegistry, report?: DiagnosticReporter,
  mode: 'overlay' | 'replace' = 'overlay'): SearchValues {
  const defaults = defaultSearchValues(definition)
  const result = valuesObject()
  for (const item of definition.items) {
    if (!Object.hasOwn(defaults, item.id)) continue
    if (item.kind !== 'custom') { result[item.id] = defaults[item.id]!; continue }
    const entry = customEntry(item, registry, report)
    if (!entry) continue
    try {
      const value = entry.deserialize ? entry.deserialize(defaults[item.id]) : defaults[item.id]
      const accepted = checkedValue(value, item, report)
      if (accepted !== undefined) result[item.id] = accepted
    } catch (cause) { issue(report, `search.values.${item.id}`, cause instanceof Error ? cause.message : String(cause)) }
  }
  const baseline = Object.assign(valuesObject(), result)
  if (input === undefined || input === null) return result
  if (!record(input)) { issue(report, 'search.values', '搜索值必须是按 ID 保存的对象。'); return result }
  if (mode === 'replace') for (const id of Object.keys(result)) delete result[id]
  const known = new Map(definition.items.map(item => [item.id, item]))
  for (const [id, raw] of Object.entries(input)) {
    const item = known.get(id)
    if (!item) { issue(report, `search.values.${id}`, '搜索字段已不存在，已忽略。'); continue }
    let value: unknown = raw
    if (item.kind === 'custom') {
      const entry = customEntry(item, registry, report)
      if (!entry) { delete result[id]; continue }
      try { value = entry.deserialize ? entry.deserialize(raw) : raw }
      catch (cause) { issue(report, `search.values.${id}`, cause instanceof Error ? cause.message : String(cause)); continue }
    }
    const accepted = checkedValue(value, item, report)
    if (accepted !== undefined) result[id] = accepted
  }
  if (!dateRangeValid(result, definition)) {
    issue(report, 'search.values.dateRange', '开始日期不能晚于结束日期。')
    return baseline
  }
  return result
}
/** Validate in-memory values without repeating custom deserialization. */
export function readRuntimeSearchValues(input: unknown, definition: SearchDefinition, registry?: RuntimeRegistry, report?: DiagnosticReporter,
  mode: 'overlay' | 'replace' = 'overlay'): SearchValues {
  const baseline = readSearchValues(undefined, definition, registry, report)
  const result = Object.assign(valuesObject(), baseline)
  if (input === undefined || input === null) return result
  if (!record(input)) { issue(report, 'search.values', '搜索值必须是按 ID 保存的对象。'); return result }
  if (mode === 'replace') for (const id of Object.keys(result)) delete result[id]
  const known = new Map(definition.items.map(item => [item.id, item]))
  for (const [id, raw] of Object.entries(input)) {
    const item = known.get(id)
    if (!item) { issue(report, `search.values.${id}`, '搜索字段已不存在，已忽略。'); continue }
    if (item.kind === 'custom' && !customEntry(item, registry, report)) { delete result[id]; continue }
    const accepted = checkedValue(raw, item, report)
    if (accepted !== undefined) result[id] = accepted
  }
  if (!dateRangeValid(result, definition)) {
    issue(report, 'search.values.dateRange', '开始日期不能晚于结束日期。')
    return baseline
  }
  return result
}
export function serializeSearchValues(values: SearchValues, definition: SearchDefinition, registry?: RuntimeRegistry, report?: DiagnosticReporter): SearchValues {
  const result = valuesObject()
  for (const item of definition.items) {
    if (!Object.hasOwn(values, item.id)) continue
    let value: unknown = values[item.id]
    if (item.kind === 'custom') {
      const entry = customEntry(item, registry, report)
      if (!entry) continue
      try { value = entry.serialize ? entry.serialize(value) : value }
      catch (cause) { issue(report, `search.values.${item.id}`, cause instanceof Error ? cause.message : String(cause)); continue }
    }
    const accepted = checkedValue(value, item, report)
    if (accepted !== undefined) result[item.id] = accepted
  }
  if (!dateRangeValid(result, definition)) {
    issue(report, 'search.values.dateRange', '开始日期不能晚于结束日期。')
    return valuesObject()
  }
  return result
}
/** Display labels are derived from applied values and never serialized into the query. */
export function summarizeSearchValues(values: SearchValues, definition: SearchDefinition): SearchSummaryItem[] {
  return definition.items.flatMap(item => {
    if (!Object.hasOwn(values, item.id)) return []
    const value = checkedValue(values[item.id], item)
    if (value === undefined || value === null || value === '' || Array.isArray(value) && !value.length
      || item.kind === 'keyword' && !String(value).trim()) return []
    const display = (entry: SearchJson): string => item.options?.find(option => Object.is(option.value, entry))?.label
      ?? (entry === null ? '空值' : typeof entry === 'object' ? JSON.stringify(entry) : String(entry))
    return [{ id: item.id, label: item.label ?? item.id, value,
      displayValue: Array.isArray(value) ? value.map(display).join('、') : display(value) }]
  })
}
export function projectSearchValues(values: SearchValues, definition: SearchDefinition, registry?: RuntimeRegistry, report?: DiagnosticReporter): SearchProjection {
  const output: SearchProjection = { keyword: '', filters: [] }
  if (!record(values)) { issue(report, 'search.values', '搜索值必须是对象。'); return output }
  const accepted = valuesObject()
  for (const item of definition.items) {
    if (!Object.hasOwn(values, item.id)) continue
    const value = checkedValue(values[item.id], item, report)
    if (value !== undefined) accepted[item.id] = value
  }
  if (!dateRangeValid(accepted, definition)) {
    issue(report, 'search.values.dateRange', '开始日期不能晚于结束日期。')
    for (const item of definition.items) if (item.kind === 'date') delete accepted[item.id]
  }
  for (const item of definition.items) {
    if (!Object.hasOwn(accepted, item.id)) continue
    const value = accepted[item.id]!
    if (item.kind === 'keyword') { output.keyword = String(value).trim(); continue }
    if (item.kind === 'custom') {
      const entry = customEntry(item, registry, report)
      if (!entry?.toQuery) { if (entry) issue(report, `search.items.${item.id}`, '自定义搜索缺少查询转换。'); continue }
      try {
        const raw = entry.toQuery(value)
        if (!Array.isArray(raw) || raw.length > FILTER_LIMITS.rules) throw new Error('自定义搜索返回了无效条件。')
        const filters = raw.map(rule => readFilter(rule))
        if (filters.some(rule => !rule)) throw new Error('自定义搜索返回了无效条件。')
        output.filters.push(...filters as FilterConfig[])
      } catch (cause) { issue(report, `search.items.${item.id}`, cause instanceof Error ? cause.message : String(cause)) }
      continue
    }
    if (value === '' || value === null) continue
    const preset = item.kind === 'select' && item.operator === 'eq'
      ? item.options?.find(option => Object.is(option.value, value))?.filters : undefined
    if (preset) {
      output.filters.push(...preset.map(rule => readFilter(rule)!))
      continue
    }
    const rule = readFilter({ field: item.field, operator: item.operator, value })
    if (rule) output.filters.push(rule)
    else issue(report, `search.values.${item.id}`, '搜索条件无效，已忽略。')
  }
  return output
}
export function restoreLegacySearch(keyword: string | undefined, filters: readonly FilterConfig[], definition: SearchDefinition,
  registry?: RuntimeRegistry, report?: DiagnosticReporter): { values: SearchValues; filters: FilterConfig[] } {
  const values = readSearchValues(undefined, definition, registry, report), remaining: FilterConfig[] = [], used = new Set<string>()
  const keywordItem = definition.items.find(item => item.kind === 'keyword')
  if (keywordItem && typeof keyword === 'string') {
    const value = checkedValue(keyword, keywordItem, report)
    if (value !== undefined) values[keywordItem.id] = value
  }
  for (const raw of filters) {
    const rule = readFilter(raw)
    if (!rule) { issue(report, 'search.legacy.filters', '旧查询条件无效，已忽略。', 'MigrationError'); continue }
    const item = definition.items.find(candidate => candidate.kind !== 'keyword' && candidate.kind !== 'custom'
      && candidate.field === rule.field && candidate.operator === rule.operator && !used.has(candidate.id))
    if (!item) { remaining.push(rule); continue }
    const value = checkedValue(rule.value, item, report)
    if (value === undefined) { remaining.push(rule); continue }
    values[item.id] = value; used.add(item.id)
  }
  if (!dateRangeValid(values, definition)) {
    issue(report, 'search.values.dateRange', '旧查询日期区间无效，已保留原条件。', 'MigrationError')
    for (const item of definition.items) if (item.kind === 'date' && used.has(item.id)) {
      const rule = readFilter({ field: item.field, operator: item.operator, value: values[item.id] })
      if (rule) remaining.push(rule)
      if (item.defaultValue === undefined) delete values[item.id]
      else values[item.id] = jsonData(item.defaultValue)
    }
  }
  return { values, filters: remaining }
}
