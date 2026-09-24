import type { ColumnConfig, FilterConfig, RowData } from '../../types'
import { compileFilter, isCalendarDay, readFilter } from '../../runtime/filter'
import { getValue } from '../../runtime/value'
import { defaultColumnFilter, operatorsByType } from '../filters/model'

export interface ConditionalRule {
  id: string
  condition: FilterConfig
  enabled: boolean
  label: string
  color: string
  background: string
}
export interface ConditionalFormattingDefinition {
  defaultRules?: ConditionalRule[]
  /** Stable column IDs, rather than data-field names. */
  allowedColumns?: string[]
  defaultColumn?: string
}

const colorPattern = /^#[\da-f]{6}$/i
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const fail = (): never => { throw new Error('条件标记规则无效，请检查字段、条件和颜色。') }

/** Persisted rules are data only. Reject the complete value if any rule is malformed. */
export function readConditionalRules(input: unknown): ConditionalRule[] {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input) || input.length > 30) return fail()
  const ids = new Set<string>()
  return input.map(value => {
    if (!record(value) || Object.keys(value).some(key => !['id', 'condition', 'enabled', 'label', 'color', 'background'].includes(key))) return fail()
    const { id, condition, enabled, label, color, background } = value
    if (typeof id !== 'string' || !id.trim() || id.length > 160 || ids.has(id)
      || typeof enabled !== 'boolean' || typeof label !== 'string' || !label.trim() || label.length > 24
      || typeof color !== 'string' || !colorPattern.test(color)
      || typeof background !== 'string' || !colorPattern.test(background)) return fail()
    if (!record(condition) || Object.keys(condition).some(key => !['field', 'operator', 'value', 'unitFactor'].includes(key))) return fail()
    const parsed = readFilter(condition)
    if (!parsed || parsed.unitFactor !== undefined && parsed.unitFactor !== 1) return fail()
    ids.add(id)
    return { id, condition: parsed, enabled, label, color: color.toLowerCase(), background: background.toLowerCase() }
  })
}

/** Editing uses a field's natural type and raw value, independent of column filtering/display preferences. */
export function conditionalColumn(column: ColumnConfig): ColumnConfig {
  if (column.kind === 'actions') return fail()
  const bare: ColumnConfig = { ...column, filterable: true, filter: undefined,
    numberRule: { enabled: false, style: 'decimal' }, numberFormat: { style: 'decimal' } }
  const type = defaultColumnFilter(bare).type
  return { ...bare, filter: { enabled: true, type, source: 'data', search: true, counts: true,
    operators: [...operatorsByType[type]], options: [] } }
}

function typedCondition(condition: FilterConfig, column: ColumnConfig): boolean {
  const type = defaultColumnFilter(conditionalColumn(column)).type
  const { operator, value } = condition
  if (!operatorsByType[type].includes(operator)) return false
  if (operator === 'empty' || operator === 'notEmpty') return value === null
  if (type === 'number') return operator === 'between'
    ? Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'number' && Number.isFinite(item))
    : typeof value === 'number' && Number.isFinite(value)
  if (type === 'date') return operator === 'nextDays' || operator === 'pastDays'
    ? typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 36500
    : operator === 'between'
      ? Array.isArray(value) && value.length === 2 && value.every(isCalendarDay)
      : isCalendarDay(value)
  if (type === 'text') return typeof value === 'string' && !!value.trim()
  if (type === 'boolean') return Array.isArray(value) && value.every(item => typeof item === 'boolean')
  return Array.isArray(value) && value.every(item => item === null || ['string', 'number', 'boolean'].includes(typeof item))
}

export function guardConditionalRules(input: unknown, columns: readonly ColumnConfig[], allowedColumns?: readonly string[]): ConditionalRule[] {
  const rules = readConditionalRules(input)
  for (const rule of rules) {
    const column = columns.find(item => item.kind !== 'actions' && item.field === rule.condition.field
      && (!allowedColumns || allowedColumns.includes(item.id)))
    if (!column || !typedCondition(rule.condition, column)) fail()
  }
  return rules
}

/** Compile once per render, then evaluate rows without changing query membership or row data. */
export function compileConditionalRules(rules: readonly ConditionalRule[], columns: readonly ColumnConfig[]): (row: RowData) => ConditionalRule | undefined {
  const prepared = guardConditionalRules(rules, columns).filter(rule => rule.enabled).map(rule => {
    const column = columns.find(item => item.field === rule.condition.field)!
    return { rule, type: defaultColumnFilter(conditionalColumn(column)).type, match: compileFilter(rule.condition) }
  })
  return row => prepared.find(item => {
    const { rule, type, match } = item
    if (rule.condition.operator !== 'empty' && rule.condition.operator !== 'notEmpty') {
      const raw = getValue(row, rule.condition.field)
      if (type === 'number' && (typeof raw !== 'number' || !Number.isFinite(raw))
        || type === 'date' && !isCalendarDay(raw)
        || type === 'boolean' && typeof raw !== 'boolean'
        || type === 'text' && typeof raw !== 'string') return false
    }
    return match(row)
  })?.rule
}
