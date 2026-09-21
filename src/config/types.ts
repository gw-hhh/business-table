import type { ColumnConfig, FixedSide, UserColumnConfig } from '../types'
import type { ConfigDiagnostic } from './diagnostics'

export interface ColumnCapabilities {
  visible?: boolean
  order?: boolean
  rename?: boolean
  align?: boolean
  sortable?: boolean
  headerStyle?: boolean
  cellStyle?: boolean
  width?: boolean | { enabled: boolean; min?: number; max?: number }
  fixed?: boolean | { enabled: boolean; allowedValues?: FixedSide[] }
}
export interface ColumnDefinition extends ColumnConfig {
  access?: boolean
  default?: UserColumnConfig
  configurable?: ColumnCapabilities
}
export type ConfigurableColumn = ColumnConfig & { configurable?: ColumnCapabilities }
export interface TableDefinition {
  schemaVersion: 3
  tableKey: string
  rowKey?: string
  title?: string
  columns: ColumnDefinition[]
  features?: Record<string, unknown>
  pagination?: { pageSize?: number; pageSizeOptions?: number[] }
}
export interface PreferenceV2 {
  kind: 'business-table-preference'
  schemaVersion: 2
  tableKey: string
  columns: Record<string, UserColumnConfig>
  pageSize?: number
}
export interface PreferenceV3 {
  kind: 'business-table-preference'
  schemaVersion: 3
  tableKey: string
  columns: Record<string, UserColumnConfig>
  pagination?: { pageSize: number }
}
export interface ResolveConfigurationInput {
  definition: unknown
  remoteOverride?: unknown
  preference?: unknown
  viewColumns?: unknown
}
export interface ResolvedConfiguration {
  columns: ConfigurableColumn[]
  baseColumns: ConfigurableColumn[]
  preference: PreferenceV3 | null
  basePageSize: number
  pageSize: number
  pageSizeOptions: number[]
  diagnostics: ConfigDiagnostic[]
}
