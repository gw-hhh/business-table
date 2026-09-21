import type {CSSProperties,VNodeChild} from 'vue'
import type {ColumnConfig,ColumnTextStyle,RowData,SortConfig,UserColumnConfig} from '../types'
import {getColumnWidthBounds} from '../config/columns'

export interface ColumnSettingsContext {
  columns:ColumnConfig[]
  baseColumns?:ColumnConfig[]
  previewRows?:RowData[]
  previewCell?:(value:unknown,row:RowData,column:ColumnConfig)=>VNodeChild
  openMode?:'quick'|'drawer'
  sorts?:SortConfig[]
  setSorts?:(sorts:SortConfig[])=>Promise<void>
  patch:(id:string,patch:UserColumnConfig)=>Promise<void>
  apply?:(patches:Record<string,UserColumnConfig>)=>Promise<void>
  close:()=>void
}
export function columnTextCss(style?:ColumnTextStyle):CSSProperties {
  if(!style)return {}
  const {fontSize,align,...rest}=style
  return {...rest,...(fontSize===undefined?{}:{fontSize:fontSize+'px'}),...(align===undefined?{}:{textAlign:align})}
}
export function editableColumnWidth(column:ColumnConfig):number {
  if(column.width!==undefined)return column.width
  const {min,max}=getColumnWidthBounds(column)
  return Math.min(max,Math.max(min,160))
}
