import type { ColumnConfig, SortConfig, UserColumnConfig } from '../../types'
import { guardColumnPatch } from '../../config/columns'
import { cloneData } from '../../runtime/value'
import type { TablePresentation } from '../presentation/model'
import { richText } from '../rich-text/document'
import { typedKey } from '../../runtime/value'

export interface SettingsCommit { columns: Record<string, UserColumnConfig>; sorts: SortConfig[]; presentation: TablePresentation }
export interface SettingsIssue { columnId?: string; section: string; message: string }
export const settingsFields = ['title','visible','width','fixed','align','sortable','headerStyle','cellStyle','content','mapping','numberRule','template','filter','filterable','emptyText','numberFormat','valueMap'] as const
export function settingsValue(column: ColumnConfig, key: typeof settingsFields[number]): unknown {
  if (key === 'visible') return column.visible ?? true
  if (key === 'fixed') return column.fixed ?? false
  if (key === 'align') return column.align ?? 'left'
  if (key === 'sortable') return column.sortable ?? false
  if (key === 'headerStyle' || key === 'cellStyle' || key === 'content') return column[key] ?? {}
  if (key === 'mapping') return column.mapping ?? { enabled: false, type: 'text', presentation: 'text', empty: '—', unknown: '未匹配', items: [] }
  if (key === 'numberRule') return column.numberRule ?? { enabled: false }
  if (key === 'template') return column.template ?? { enabled: false, document: { ops:[{insert:'\n'}] } }
  return column[key]
}
export function columnDifference(original: readonly ColumnConfig[], draft: readonly ColumnConfig[]): Record<string, UserColumnConfig> {
  const result: Record<string, UserColumnConfig> = Object.create(null)
  draft.forEach((column, index) => {
    const source = original.find(item => item.id === column.id)
    if (!source) return
    const patch: Record<string, unknown> = {}
    for (const key of settingsFields) {
      const value = settingsValue(column, key)
      if (JSON.stringify(value) !== JSON.stringify(settingsValue(source, key))) patch[key] = cloneData(value)
    }
    if (index !== original.findIndex(item => item.id === column.id)) patch.order = index
    const guarded = guardColumnPatch(source, patch)
    if (Object.keys(guarded).length) result[column.id] = guarded
  })
  return result
}
export function validateSettings(columns: readonly ColumnConfig[]): SettingsIssue[] {
  const issues: SettingsIssue[] = [], titles = new Set<string>()
  if (!columns.some(column => column.visible !== false)) issues.push({section:'columns',message:'至少显示一列。'})
  for (const column of columns) {
    const title = column.title.trim()
    if (!title || title.length > 30 || titles.has(title)) issues.push({columnId:column.id,section:'basic',message:'列名不能为空、重复或超过 30 字。'})
    titles.add(title)
    if (column.mapping?.enabled) {
      const keys = column.mapping.items.map(item => typedKey(item.value))
      if (new Set(keys).size !== keys.length) issues.push({columnId:column.id,section:'mapping',message:'映射原值不能重复。'})
    }
    if (column.template?.enabled && !richText(column.template.document).trim()) issues.push({columnId:column.id,section:'template',message:'启用模板前请添加内容。'})
    const format = column.numberRule
    if (format?.enabled && (format.minimumFractionDigits ?? 0) > (format.maximumFractionDigits ?? 2)) issues.push({columnId:column.id,section:'number',message:'最少小数位不能大于最多小数位。'})
  }
  return issues
}
