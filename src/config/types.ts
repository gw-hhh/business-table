import type {PresentationDelta,TablePresentation} from '../features/presentation/model'
import type { ColumnConfig, FixedSide, UserColumnConfig } from '../types'
import type { SearchDefinition } from '../features/search/model'
import type { ConfigDiagnostic } from './diagnostics'
import type { ControlConfig, ControlDeclaration } from './access'
import type { SettingsDefinition } from '../features/settings/policy'

export interface ColumnCapabilities {
  content?:ControlConfig
  format?:ControlConfig
  mapping?:ControlConfig
  template?:ControlConfig
  filter?:ControlConfig
  trial?:ControlConfig
  visible?: ControlConfig
  order?: ControlConfig
  rename?: ControlConfig
  align?: ControlConfig
  sortable?: ControlConfig
  headerStyle?: ControlConfig
  cellStyle?: ControlConfig
  width?: boolean | (ControlDeclaration & { min?: number; max?: number })
  fixed?: boolean | (ControlDeclaration & { allowedValues?: FixedSide[] })
}
export interface ColumnDefinition extends ColumnConfig {
  access?: boolean
  default?: UserColumnConfig
  configurable?: ColumnCapabilities
}
export type ConfigurableColumn = ColumnConfig & { configurable?: ColumnCapabilities }
export interface TableDefinition {
  presentation?:PresentationDelta
  schemaVersion: 3
  tableKey: string
  rowKey?: string
  title?: string
  columns: ColumnDefinition[]
  features?: Record<string, unknown>
  search?: SearchDefinition
  settings?: SettingsDefinition
  pagination?: { pageSize?: number; pageSizeOptions?: number[] }
}
export interface PreferenceV2 {
  presentation?:PresentationDelta
  kind: 'business-table-preference'
  schemaVersion: 2
  tableKey: string
  columns: Record<string, UserColumnConfig>
  pageSize?: number
}
export interface PreferenceV3 {
  presentation?:PresentationDelta
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
  presentation:TablePresentation
  basePresentation:TablePresentation
  columns: ConfigurableColumn[]
  baseColumns: ConfigurableColumn[]
  preference: PreferenceV3 | null
  basePageSize: number
  pageSize: number
  pageSizeOptions: number[]
  diagnostics: ConfigDiagnostic[]
}
