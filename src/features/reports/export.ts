import { downloadExport, type ExportBook, type ExportCell } from '../export/model'
import type { NormalizedGroupingDefinition, ReportCell, ReportGroup, ReportTable } from './model'

const textCell = (text: string, header = false): ExportCell => ({ value: text, text, format: '@', ...(header ? { header: true } : {}) })
const valueCell = (cell: ReportCell): ExportCell => ({ value: cell.exportValue, text: cell.text, format: cell.excelFormat })
export function groupingBook(groups: readonly ReportGroup[], definition: NormalizedGroupingDefinition): ExportBook {
  const rows: ExportCell[][] = []
  const summaryLabels = new Map<string, string>()
  function collect(items: readonly ReportGroup[], path: readonly string[]) {
    for (const group of items) {
      const next = [...path, group.label]
      group.summaries.forEach(summary => summaryLabels.set(summary.columnId, summary.label))
      if (group.children.length) collect(group.children, next)
      else rows.push([textCell(next.join(' / ')), { value: group.count, text: String(group.count), format: '0' }, ...definition.summaryColumns.map(field => {
        const summary = group.summaries.find(summary => summary.columnId === field.columnId)
        return summary ? valueCell(summary.cell) : textCell('—')
      })])
    }
  }
  collect(groups, [])
  const headers = ['分组', definition.countLabel, ...definition.summaryColumns.map(field => field.label ?? summaryLabels.get(field.columnId) ?? field.columnId)]
  return { sheets: [{ name: definition.exportName, rows: [headers.map(text => textCell(text, true)), ...rows], widths: headers.map(() => 28) }] }
}
export function comparisonBook(table: ReportTable, name = '记录对比'): ExportBook {
  return { sheets: [{ name, rows: [table.headers.map(text => textCell(text, true)), ...table.rows.map(row => row.map(valueCell))], widths: table.headers.map(() => 28) }] }
}
export async function downloadReport(book: ExportBook, name: string, isCurrent: () => boolean = () => true): Promise<'downloaded' | 'cancelled'> {
  const { writeXlsx, xlsxMime } = await import('../export/xlsx')
  if (!isCurrent()) return 'cancelled'
  const day = new Date(), date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  downloadExport(writeXlsx(book), `${name}_${date}.xlsx`, xlsxMime)
  return 'downloaded'
}
