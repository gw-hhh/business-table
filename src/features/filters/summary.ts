import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import type { ColumnConfig, FilterConfig } from '../../types'
import { withDeadline } from '../../runtime/deadline'
import { type FilterGroup } from '../../runtime/filter'
import { defaultColumnFilter, filterOperatorLabel, filterInputUnit, readFilterOptions, type FilterOption, type FilterOptionsLoader } from './model'

function localLabel(column: ColumnConfig | undefined, raw: unknown): string | undefined {
  const option = column?.filter?.options.find(option => Object.is(option.value, raw))
  if (option) return option.label
  const mapping = column?.mapping?.enabled ? column.mapping.items : column?.valueMap
  return mapping?.find(item => Object.is(item.value, raw))?.label
}
export function formatFilterSummary(rule: FilterConfig, column?: ColumnConfig, options: readonly FilterOption[] = []): string {
  const display = (raw: unknown) => localLabel(column, raw) ?? options.find(option => Object.is(option.value, raw))?.label
    ?? (raw === null ? '空值' : typeof raw === 'number' && rule.unitFactor ? String(raw / rule.unitFactor) : String(raw ?? ''))
  const values = ['empty', 'notEmpty'].includes(rule.operator) ? '' : Array.isArray(rule.value)
    ? rule.value.map(display).join(rule.operator === 'between' ? ' ～ ' : '、') : display(rule.value)
  const unitLabel = filterInputUnit(column, rule.unitFactor)
  const unit = unitLabel ? unitLabel === '%' ? '%' : ' ' + unitLabel : ''
  return `${column?.title ?? rule.field}：${filterOperatorLabel(column, rule.operator)}${values ? ' ' + values + unit : ''}`
}
function unresolvedValues(rule: FilterConfig, column: ColumnConfig): FilterOption['value'][] {
  if (!['eq', 'ne', 'in', 'notIn'].includes(rule.operator)) return []
  if (!['single', 'multi', 'boolean'].includes(defaultColumnFilter(column).type)) return []
  return (Array.isArray(rule.value) ? rule.value : [rule.value]).filter((value): value is FilterOption['value'] =>
    (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value))
    && localLabel(column, value) === undefined)
}
export function filterGroupRules(group?: FilterGroup): FilterConfig[] {
  return group?.rules.flatMap(rule => 'rules' in rule ? filterGroupRules(rule) : [rule]) ?? []
}
/** The traversal order is shared with filterGroupRules; parentheses retain nested logic. */
export function formatFilterGroupSummary(group: FilterGroup | undefined, labels: readonly string[]): string {
  let index = 0
  const describe = (current: FilterGroup): string => current.rules.map(rule => 'rules' in rule
    ? `(${describe(rule)})` : labels[index++] ?? '').join(current.logic === 'and' ? ' 且 ' : ' 或 ')
  return group ? describe(group) : ''
}
/** Labels are derived UI data. Query and persistence continue to contain raw values only. */
export function useFilterSummaries(input: {
  columns(): readonly ColumnConfig[]; filters(): readonly FilterConfig[]; optionsFor(): FilterOptionsLoader | undefined
  optionsIdentity?(): unknown
}) {
  const resolved = shallowRef<Record<string, FilterOption[]>>({})
  let sequence = 0, controller: AbortController | undefined
  watch(() => [input.columns(), input.filters(), input.optionsFor(), input.optionsIdentity?.()], async () => {
    const request = ++sequence
    controller?.abort(); controller = new AbortController()
    const signal = controller.signal, loader = input.optionsFor()
    resolved.value = {}
    if (!loader) return
    const requests = new Map<string, { column: ColumnConfig; values: FilterOption['value'][] }>()
    for (const rule of input.filters()) {
      const column = input.columns().find(column => column.field === rule.field)
      if (!column) continue
      const values = unresolvedValues(rule, column)
      if (!values.length) continue
      const request = requests.get(rule.field) ?? { column, values: [] }
      for (const value of values) if (!request.values.some(current => Object.is(current, value))) request.values.push(value)
      requests.set(rule.field, request)
    }
    await Promise.all([...requests].map(async ([field, { column, values }]) => {
      try {
        const result = await withDeadline(child => loader(column, '', child, values), 10000, signal)
        const options = readFilterOptions(result)
        if (request === sequence && !signal.aborted) resolved.value = { ...resolved.value, [field]: options }
      } catch { /* Missing or unavailable labels fall back to the unchanged raw value. */ }
    }))
  }, { immediate: true, deep: true })
  onBeforeUnmount(() => { ++sequence; controller?.abort() })
  return computed(() => input.filters().map(rule => {
    const column = input.columns().find(column => column.field === rule.field)
    return { field: rule.field, columnId: column?.id, label: formatFilterSummary(rule, column, resolved.value[rule.field]) }
  }))
}
