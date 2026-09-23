import { resolveControlAccess, type ControlAccess, type ControlConfig } from '../../config/access'
import { getColumnCapabilityAccess, guardColumnPatch } from '../../config/columns'
import type { ColumnCapabilities } from '../../config/types'
import type { ColumnConfig, SortConfig, UserColumnConfig } from '../../types'
import { cloneData } from '../../runtime/value'
import type { TablePresentation } from '../presentation/model'
import type { SettingsCommit } from './session'
import type { DiagnosticReporter } from '../../config/diagnostics'

export type { ControlAccess, ControlConfig } from '../../config/access'
export const settingsPages = ['columns', 'sorts', 'actions', 'appearance', 'toolbar'] as const
export const columnSettingsSections = ['basic', 'content', 'number', 'filter', 'mapping', 'template', 'trial'] as const
export type SettingsPage = typeof settingsPages[number]
export type ColumnSettingsSection = typeof columnSettingsSections[number]
export interface SettingsDefinition {
  pages?: Partial<Record<SettingsPage, ControlConfig>>
  columnSections?: Partial<Record<ColumnSettingsSection, ControlConfig>>
}
export interface SettingsPolicy {
  pages: Record<SettingsPage, ControlAccess>
  columnSections: Record<ColumnSettingsSection, ControlAccess>
}
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const hidden = (): ControlAccess => ({ visible: false, disabled: false })
function combine(parent: ControlAccess, child: ControlAccess): ControlAccess {
  return parent.visible && child.visible ? { visible: true, disabled: parent.disabled || child.disabled } : hidden()
}
export function resolveSettingsPolicy(input?: unknown, remote?: unknown): SettingsPolicy {
  const local = object(input), override = object(remote)
  const pages = Object.fromEntries(settingsPages.map(id => [id, resolveControlAccess(object(local.pages)[id], object(override.pages)[id])])) as SettingsPolicy['pages']
  const columnSections = Object.fromEntries(columnSettingsSections.map(id => [id, combine(pages.columns,
    resolveControlAccess(object(local.columnSections)[id], object(override.columnSections)[id]))])) as SettingsPolicy['columnSections']
  return { pages, columnSections }
}
const sectionCapabilities: Record<ColumnSettingsSection, readonly (keyof ColumnCapabilities)[]> = {
  basic: ['rename', 'visible', 'order', 'width', 'fixed', 'align', 'sortable', 'headerStyle', 'cellStyle'],
  content: ['content'], number: ['format'], filter: ['filter'], mapping: ['mapping'], template: ['template'], trial: ['trial'],
}
const fields: Record<keyof UserColumnConfig, { section: ColumnSettingsSection; capability: keyof ColumnCapabilities }> = {
  title: { section: 'basic', capability: 'rename' }, visible: { section: 'basic', capability: 'visible' },
  order: { section: 'basic', capability: 'order' }, width: { section: 'basic', capability: 'width' }, fixed: { section: 'basic', capability: 'fixed' },
  align: { section: 'basic', capability: 'align' }, sortable: { section: 'basic', capability: 'sortable' },
  headerStyle: { section: 'basic', capability: 'headerStyle' }, cellStyle: { section: 'basic', capability: 'cellStyle' },
  content: { section: 'content', capability: 'content' }, emptyText: { section: 'content', capability: 'content' },
  mapping: { section: 'mapping', capability: 'mapping' }, valueMap: { section: 'mapping', capability: 'mapping' },
  numberRule: { section: 'number', capability: 'format' }, numberFormat: { section: 'number', capability: 'format' },
  template: { section: 'template', capability: 'template' }, filter: { section: 'filter', capability: 'filter' }, filterable: { section: 'filter', capability: 'filter' },
}
export function getColumnSectionAccess(column: ColumnConfig, section: ColumnSettingsSection, policy: SettingsPolicy): ControlAccess {
  if (section === 'number' && !['number', 'currency', 'percent'].includes(column.type ?? '')) return hidden()
  if (column.kind === 'actions' && section !== 'basic') return hidden()
  const capabilities = sectionCapabilities[section].map(key => getColumnCapabilityAccess(column, key)).filter(value => value.visible)
  if (!capabilities.length) return hidden()
  return combine(policy.columnSections[section], { visible: true, disabled: capabilities.every(value => value.disabled) })
}
export function getSettingsColumnFieldAccess(column: ColumnConfig, field: keyof UserColumnConfig, policy: SettingsPolicy): ControlAccess {
  const rule = fields[field]
  return combine(getColumnSectionAccess(column, rule.section, policy), getColumnCapabilityAccess(column, rule.capability))
}
export function guardSettingsColumnPatch(column: ColumnConfig, patch: UserColumnConfig, policy: SettingsPolicy, report?: DiagnosticReporter): UserColumnConfig {
  const allowed: Record<string, unknown> = {}
  for (const field of Object.keys(patch) as (keyof UserColumnConfig)[]) {
    if (!Object.hasOwn(fields, field)) continue
    const access = getSettingsColumnFieldAccess(column, field, policy)
    if (access.visible && !access.disabled) allowed[field] = patch[field]
    else report?.({code:'CapabilityViolation',path:`columns.${column.id}.${field}`,message:'此设置未开放编辑。'})
  }
  return guardColumnPatch(column, allowed, report)
}
/** Used by both direct Runtime commands and the settings draft/backup paths. */
export function guardSettingsCommit(change: SettingsCommit, current: { columns: readonly ColumnConfig[]; sorts: readonly SortConfig[]; presentation: TablePresentation }, policy: SettingsPolicy, report?: DiagnosticReporter): SettingsCommit {
  const editable = (page: SettingsPage) => policy.pages[page].visible && !policy.pages[page].disabled
  const columns: Record<string, UserColumnConfig> = Object.create(null)
  for (const [id, patch] of Object.entries(change.columns)) {
    const column = current.columns.find(item => item.id === id)
    if (!column) continue
    const accepted = guardSettingsColumnPatch(column, patch, policy, report)
    if (Object.keys(accepted).length) columns[id] = accepted
  }
  return { columns, sorts: cloneData(editable('sorts') ? change.sorts : [...current.sorts]), presentation: {
    appearance: cloneData(editable('appearance') ? change.presentation.appearance : current.presentation.appearance),
    rowActions: cloneData(editable('actions') ? change.presentation.rowActions : current.presentation.rowActions),
    toolbar: cloneData(editable('toolbar') ? change.presentation.toolbar : current.presentation.toolbar),
  } }
}
