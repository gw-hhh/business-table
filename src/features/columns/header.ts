import type { ControlAccess } from '../../config/access'
import type { ColumnConfig, SortConfig, UserColumnConfig } from '../../types'

/** UI receives commands owned and guarded by the table Runtime. */
export interface ColumnHeaderContext {
  column: ColumnConfig
  baseWidth?: number
  sorts: readonly SortConfig[]
  filterable: boolean
  filtered: boolean
  settings: boolean
  access: (field: keyof UserColumnConfig) => ControlAccess
  patch: (change: UserColumnConfig) => Promise<void>
  sort: (order?: 'asc' | 'desc' | null) => void | Promise<void>
  filter: () => void
  configure: () => void
}
