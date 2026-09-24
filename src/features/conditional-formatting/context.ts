import type { ColumnConfig } from '../../types'
import type { FilterOption } from '../filters/model'
import type { ConditionalRule } from './model'

export interface ConditionalFormattingContext {
  readonly columns: readonly ColumnConfig[]
  readonly rules: readonly ConditionalRule[]
  readonly disabled: boolean
  readonly defaultColumn?: string
  apply(rules: ConditionalRule[]): Promise<void>
  optionsFor(column: ColumnConfig, search: string, signal: AbortSignal): Promise<FilterOption[]>
  close(): void
}
