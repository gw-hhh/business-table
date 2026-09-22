import type { ColumnConfig, RowData } from '../../types'
import type { NumberRule, MappingItem } from './types'
import { getValue, typedKey } from '../../runtime/value'
import { readRichDocument, richText, type RichDocument } from '../rich-text/document'
export { typedKey }
export interface CellResult {
  raw: unknown; text: string; exportValue: string | number | boolean | null
  excelFormat: string; mapping?: MappingItem; document?: RichDocument
}

function decimal(value: unknown): [bigint, bigint] | null {
  if (typeof value === 'bigint') return [value, 1n]
  if (!['string', 'number'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value)) return null
  const text = String(value).trim()
  if (text.length > 180) return null
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text)
  if (!match) return null
  const exponent = Number(match[4] ?? 0)
  if (Math.abs(exponent) > 100) return null
  const places = (match[3]?.length ?? 0) - exponent
  const numerator = BigInt(match[2]! + (match[3] ?? '')) * (match[1] === '-' ? -1n : 1n)
  return places >= 0 ? [numerator, 10n ** BigInt(places)] : [numerator * 10n ** BigInt(-places), 1n]
}
const quoteFormat = (value: string) => `"${value.replaceAll('"', '""')}"`
export function formatNumeric(value: unknown, rule: NumberRule = {}): { text: string; exportValue: string | number | null; excelFormat: string } {
  const fraction = decimal(value)
  if (!fraction || value === '' || value === null) return { text: '—', exportValue: null, excelFormat: '@' }
  const minimum = Math.max(0, Math.min(20, rule.minimumFractionDigits ?? 0))
  const maximum = Math.max(minimum, Math.min(20, rule.maximumFractionDigits ?? 2))
  const mode = rule.style ?? 'decimal'
  const scale = [1, 1000, 10000, 100000000].includes(rule.scale ?? 1) ? rule.scale ?? 1 : 1
  let [numerator, denominator] = fraction
  let excelDenominator = denominator
  if (mode === 'percent') {
    if (rule.percentBase === 'percent') excelDenominator *= 100n
    else numerator *= 100n
  } else { denominator *= BigInt(scale); excelDenominator *= BigInt(scale) }
  const negative = numerator < 0n
  const magnitude = negative ? -numerator : numerator
  const factor = 10n ** BigInt(maximum)
  const rounded = (magnitude * factor * 2n + denominator) / (2n * denominator)
  let digits = maximum ? String(rounded % factor).padStart(maximum, '0') : ''
  while (digits.length > minimum && digits.endsWith('0')) digits = digits.slice(0, -1)
  const whole = String(rounded / factor)
  const grouped = rule.useGrouping === false ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const symbol = mode === 'currency' ? ({ CNY: '¥', USD: '$', EUR: '€', JPY: '¥' }[rule.currency ?? 'CNY'] ?? rule.currency ?? '¥') : ''
  let text = `${rule.prefix ?? ''}${symbol}${grouped}${digits ? '.' + digits : ''}${mode === 'percent' ? '%' : ''}${rule.suffix ?? ''}`
  if (negative && rounded) text = rule.sign === 'accounting' ? `(${text})` : '-' + text
  else if (rounded && rule.sign === 'always') text = '+' + text
  const [rawNumerator] = fraction
  const numeric = Number(rawNumerator) / Number(excelDenominator)
  const significant = String(rawNumerator < 0n ? -rawNumerator : rawNumerator).replace(/^0+/, '').length
  const exportValue = significant > 15 || !Number.isFinite(numeric) ? String(value) : numeric
  const places = '0'.repeat(minimum) + '#'.repeat(maximum - minimum)
  let excelFormat = (rule.prefix ? quoteFormat(rule.prefix) : '') + (symbol ? quoteFormat(symbol) : '')
    + (rule.useGrouping === false ? '0' : '#,##0') + (places ? '.' + places : '') + (mode === 'percent' ? '%' : '')
    + (rule.suffix ? quoteFormat(rule.suffix) : '')
  if (rule.sign === 'accounting') excelFormat += `;(${excelFormat})`
  else if (rule.sign === 'always') excelFormat = `+${excelFormat};-${excelFormat};0`
  return { text, exportValue, excelFormat }
}
function scalar(row: RowData, column: ColumnConfig): CellResult {
  const raw = getValue(row, column.field)
  const empty = raw === null || raw === undefined || raw === ''
  const mapping = column.mapping
  const legacyMapping = column.valueMap?.find(item => Object.is(item.value, raw))
  if (mapping?.enabled) {
    const item = mapping.items.find(item => Object.is(item.value, raw))
    const text = item?.label ?? (empty ? mapping.empty : `${mapping.unknown}（${String(raw)}）`)
    return { raw, text, exportValue: raw == null ? null : typeof raw === 'number' || typeof raw === 'boolean' ? raw : String(raw), excelFormat: '@', mapping: item }
  }
  if (legacyMapping) return { raw, text: legacyMapping.label, exportValue: typeof raw === 'number' || typeof raw === 'boolean' ? raw : String(raw ?? ''), excelFormat: '@', mapping: legacyMapping }
  if (empty) return { raw, text: column.content?.emptyText ?? column.emptyText ?? '—', exportValue: null, excelFormat: '@' }
  if (column.numberRule?.enabled || ['number', 'currency', 'percent'].includes(column.type ?? '')) {
    const rule: NumberRule = column.numberRule?.enabled ? column.numberRule : column.numberFormat
      ?? { style: column.type === 'currency' ? 'currency' : column.type === 'percent' ? 'percent' : 'decimal', minimumFractionDigits: column.type === 'currency' ? 2 : 0, maximumFractionDigits: column.type === 'currency' ? 2 : 20 }
    return { raw, ...formatNumeric(raw, rule) }
  }
  let text = String(raw)
  if (column.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    if (column.content?.dateFormat === 'slash') text = text.replaceAll('-', '/')
    if (column.content?.dateFormat === 'cn') text = text.replace(/^(\d+)-(\d+)-(\d+)$/, '$1年$2月$3日')
  }
  return { raw, text, exportValue: typeof raw === 'boolean' ? raw : text, excelFormat: '@' }
}
/** One display/export interpretation for the live table, previews and rule trial. */
export function evaluateCell(row: RowData, column: ColumnConfig, columns: readonly ColumnConfig[] = [column]): CellResult {
  const result = scalar(row, column)
  if (!column.template?.enabled) return result
  const document = readRichDocument(column.template.document, { template: true, fields: columns.map(item => item.id) })
  return { ...result, document, text: richText(document, id => {
    const field = columns.find(item => item.id === id)
    return field ? scalar(row, field).text : '—'
  }) }
}
