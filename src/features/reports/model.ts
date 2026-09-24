import type { ColumnConfig, RowData } from '../../types'
import { decimal, evaluateCell, type CellResult } from '../columns/evaluate'
import type { NumberRule } from '../columns/types'
import { numberRuleSchema } from '../columns/schema'
import { getValue, typedKey, withValue } from '../../runtime/value'

export interface NumberSummary { count: number; sum: string; average: string; min: string; max: string }
function decimalText(numerator: bigint, denominator: bigint): string {
  const negative = numerator < 0n, magnitude = negative ? -numerator : numerator
  const places = String(denominator).length - 1
  const fraction = places ? String(magnitude % denominator).padStart(places, '0').replace(/0+$/, '') : ''
  return `${negative ? '-' : ''}${magnitude / denominator}${fraction ? '.' + fraction : ''}`
}
/** Aggregate raw decimal values without converting them to binary floating point. */
export function summarizeNumbers(values: readonly unknown[]): NumberSummary | undefined {
  let sum = 0n, denominator = 1n, count = 0, minimum = 0n, maximum = 0n
  for (const value of values) {
    const fraction = decimal(value)
    if (!fraction) continue
    const [raw, divisor] = fraction, common = divisor > denominator ? divisor : denominator
    const factor = common / denominator, next = raw * (common / divisor)
    sum *= factor; minimum *= factor; maximum *= factor; denominator = common
    sum += next
    if (!count || next < minimum) minimum = next
    if (!count || next > maximum) maximum = next
    count++
  }
  if (!count) return undefined
  const averageScale = 10n ** 20n, divisor = denominator * BigInt(count), magnitude = sum < 0n ? -sum : sum
  const rounded = (magnitude * averageScale * 2n + divisor) / (2n * divisor)
  return { count, sum: decimalText(sum, denominator), average: decimalText(sum < 0n ? -rounded : rounded, averageScale), min: decimalText(minimum, denominator), max: decimalText(maximum, denominator) }
}

export interface ReportField { columnId: string; label?: string; numberFormat?: NumberRule }
export interface GroupingDefinition {
  groupColumns?: readonly string[]; defaultGroups?: readonly string[]
  detailColumns?: readonly ReportField[]; summaryColumns?: readonly ReportField[]
  countLabel?: string; recordUnit?: string; exportName?: string
}
export interface CompareDefinition {
  searchColumns?: readonly string[]; labelColumns?: readonly string[]; recordLabelColumn?: string
  differenceColumns?: readonly ReportField[]; searchPlaceholder?: string; recordName?: string; exportName?: string
}
export interface NormalizedGroupingDefinition {
  groupColumns: string[]; defaultGroups: string[]; detailColumns: ReportField[]; summaryColumns: ReportField[]
  countLabel: string; recordUnit: string; exportName: string
}
export interface NormalizedCompareDefinition {
  searchColumns: string[]; labelColumns: string[]; recordLabelColumn: string; differenceColumns: ReportField[]
  searchPlaceholder: string; recordName: string; exportName: string
}
export type ReportCell = Pick<CellResult, 'text' | 'exportValue' | 'excelFormat'>
export interface ReportTable { headers: string[]; rows: ReportCell[][] }
export interface GroupSummary { columnId: string; label: string; sum: string; cell: ReportCell }
export interface ReportGroup {
  id: string; columnId: string; value: unknown; label: string; rows: readonly RowData[]; count: number
  summaries: GroupSummary[]; children: ReportGroup[]
}
const object = (input: unknown): Record<string, unknown> => input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
const label = (input: unknown, fallback: string) => typeof input === 'string' && input.trim() ? input.trim().slice(0, 100) : fallback
const numeric = (column: ColumnConfig) => ['number', 'currency', 'percent'].includes(column.type ?? '') || column.numberRule?.enabled === true || !!column.numberFormat
export function reportColumns(columns: readonly ColumnConfig[]): ColumnConfig[] {
  const seen = new Set<string>()
  return columns.filter(column => { if (column.kind === 'actions' || !column.id || seen.has(column.id)) return false; seen.add(column.id); return true })
}
function ids(input: unknown, columns: readonly ColumnConfig[], fallback: readonly string[]): string[] {
  const valid = new Set(columns.map(column => column.id))
  return [...new Set((input === undefined ? fallback : Array.isArray(input) ? input : []).filter((id): id is string => typeof id === 'string' && valid.has(id)))]
}
function fields(input: unknown, columns: readonly ColumnConfig[], fallback: readonly string[]): ReportField[] {
  const source: readonly unknown[] = input === undefined ? fallback.map(columnId => ({ columnId })) : Array.isArray(input) ? input : []
  const allowed = new Set(columns.map(column => column.id)), seen = new Set<string>()
  return source.flatMap(item => {
    const value = object(item), columnId = value.columnId
    if (typeof columnId !== 'string' || !allowed.has(columnId) || seen.has(columnId)) return []
    seen.add(columnId)
    const format = numberRuleSchema.safeParse(value.numberFormat)
    return [{ columnId, ...(typeof value.label === 'string' && value.label.trim() ? { label: label(value.label, '') } : {}), ...(format.success ? { numberFormat: format.data } : {}) }]
  })
}
export function normalizeGroupingDefinition(input: unknown, sourceColumns: readonly ColumnConfig[]): NormalizedGroupingDefinition {
  const value = object(input), columns = reportColumns(sourceColumns), numbers = columns.filter(numeric)
  const groupColumns = ids(value.groupColumns, columns, columns.map(column => column.id))
  const groupChoices = columns.filter(column => groupColumns.includes(column.id))
  return {
    groupColumns, defaultGroups: ids(value.defaultGroups, groupChoices, groupColumns.slice(0, 1)).slice(0, 2),
    detailColumns: fields(value.detailColumns, columns, columns.filter(column => column.visible !== false).map(column => column.id)),
    summaryColumns: fields(value.summaryColumns, numbers, numbers.map(column => column.id)),
    countLabel: label(value.countLabel, '记录数'), recordUnit: label(value.recordUnit, '条'), exportName: label(value.exportName, '分组汇总'),
  }
}
export function normalizeCompareDefinition(input: unknown, sourceColumns: readonly ColumnConfig[]): NormalizedCompareDefinition {
  const value = object(input), columns = reportColumns(sourceColumns), visible = columns.filter(column => column.visible !== false)
  return {
    searchColumns: ids(value.searchColumns, columns, visible.map(column => column.id)),
    labelColumns: ids(value.labelColumns, columns, visible.slice(0, 2).map(column => column.id)),
    recordLabelColumn: ids(value.recordLabelColumn === undefined ? undefined : [value.recordLabelColumn], columns, visible.slice(0, 1).map(column => column.id))[0] ?? '',
    differenceColumns: fields(value.differenceColumns, columns.filter(numeric), []),
    searchPlaceholder: label(value.searchPlaceholder, '搜索记录'), recordName: label(value.recordName, '记录'), exportName: label(value.exportName, '记录对比'),
  }
}
export const reportText = (text: string): ReportCell => ({ text, exportValue: text, excelFormat: '@' })
export function reportValue(row: RowData, field: ReportField, columns: readonly ColumnConfig[]): ReportCell {
  const source = columns.find(column => column.id === field.columnId)
  if (!source) return reportText('—')
  const column = field.numberFormat ? { ...source, numberRule: { ...field.numberFormat, enabled: true } } : source
  const result = evaluateCell(row, column, columns)
  return column.mapping?.enabled || column.valueMap?.length || column.template?.enabled ? { ...result, exportValue: result.text, excelFormat: '@' } : result
}
export function reportNumber(raw: unknown, field: ReportField, columns: readonly ColumnConfig[]): ReportCell {
  const source = columns.find(column => column.id === field.columnId)
  if (!source) return reportText('—')
  const column: ColumnConfig = { ...source, mapping: undefined, valueMap: undefined, template: undefined, ...(field.numberFormat ? { numberRule: { ...field.numberFormat, enabled: true } } : {}) }
  return evaluateCell(withValue({}, column.field, raw), column, columns)
}
export function groupRecords(rows: readonly RowData[], columns: readonly ColumnConfig[], definition: NormalizedGroupingDefinition, selected: readonly string[]): ReportGroup[] {
  const keys = [...new Set(selected.filter(key => definition.groupColumns.includes(key)))].slice(0, 2)
  function build(source: readonly RowData[], depth: number, parent: string): ReportGroup[] {
    const column = columns.find(column => column.id === keys[depth])
    if (!column) return []
    const groups = new Map<string, { value: unknown; rows: RowData[] }>()
    for (const row of source) {
      const value = getValue(row, column.field), key = typedKey(value)
      let group = groups.get(key)
      if (!group) { group = { value, rows: [] }; groups.set(key, group) }
      group.rows.push(row)
    }
    return [...groups.entries()].map(([key, group]) => {
      const id = JSON.stringify([parent, column.id, key]), text = evaluateCell(group.rows[0]!, column, columns).text
      const summaries = definition.summaryColumns.flatMap(field => {
        const numericColumn = columns.find(item => item.id === field.columnId)
        if (!numericColumn) return []
        const summary = summarizeNumbers(group.rows.map(row => getValue(row, numericColumn.field)))
        if (!summary) return []
        return [{ columnId: field.columnId, label: field.label ?? `${numericColumn.title}合计`, sum: summary.sum, cell: reportNumber(summary.sum, field, columns) }]
      })
      return { id, columnId: column.id, value: group.value, label: `${column.title}：${text || '未填写'}`, rows: group.rows, count: group.rows.length, summaries, children: depth + 1 < keys.length ? build(group.rows, depth + 1, id) : [] }
    })
  }
  return build(rows, 0, '')
}
export function compareLabel(row: RowData, ids: readonly string[], columns: readonly ColumnConfig[]): string {
  return ids.map(columnId => reportValue(row, { columnId }, columns).text).join(' · ')
}
export function buildComparison(rows: readonly RowData[], columns: readonly ColumnConfig[], definition: NormalizedCompareDefinition, selected: readonly string[], baseline: string, differences: boolean, rowId: (row: RowData) => string): ReportTable {
  const chosen = new Set(selected.slice(0, 4)), eligible = rows.filter(row => chosen.has(rowId(row)))
  const first = eligible.find(row => rowId(row) === baseline) ?? eligible[0]
  if (!first || eligible.length < 2) return { headers: [], rows: [] }
  const ordered = [first, ...eligible.filter(row => row !== first)]
  const headers = ['字段', ...ordered.map((row, index) => `${compareLabel(row, [definition.recordLabelColumn], columns)}${index === 0 ? '（基准）' : ''}`)]
  const data = reportColumns(columns).filter(column => column.visible !== false && (!differences || new Set(ordered.map(row => typedKey(getValue(row, column.field)))).size > 1))
    .map(column => [reportText(column.title), ...ordered.map(row => reportValue(row, { columnId: column.id }, columns))])
  for (const field of definition.differenceColumns) {
    const column = columns.find(column => column.id === field.columnId && column.visible !== false)
    if (!column) continue
    const base = decimal(getValue(first, column.field))
    data.push([reportText(field.label ?? `与基准${column.title}差`), ...ordered.map((row, index) => {
      if (!index) return reportText('—')
      const raw = decimal(getValue(row, column.field))
      if (!base || !raw) return reportText('—')
      const denominator = base[1] > raw[1] ? base[1] : raw[1]
      return reportNumber(decimalText(raw[0] * (denominator / raw[1]) - base[0] * (denominator / base[1]), denominator), field, columns)
    })])
  }
  return { headers, rows: data }
}
