import type {ColumnConfig} from '../../types'
export interface SummaryState {
  status: 'disabled' | 'loading' | 'ready' | 'error'
  scope: 'query' | 'selected'
  columnId: string
  title: string
  value?: string
  text?: string
  error?: string
}
export function isSummaryColumn(column:ColumnConfig):boolean {
  return column.kind!=='actions' && (['number','currency','percent'].includes(column.type??'') || column.numberRule?.enabled===true || !!column.numberFormat)
}
