import type {TablePresentation,ToolDefinition} from '../features/presentation/model'
import type {SettingsCommit} from '../features/settings/session'
import type {Action} from '../types'
import type {CSSProperties,VNodeChild} from 'vue'
import type {ColumnConfig,ColumnTextStyle,RowData,SortConfig,UserColumnConfig} from '../types'
import {getColumnWidthBounds} from '../config/columns'
import {fontFamilyCss} from '../config/font-families'

export interface ColumnSettingsContext {
  tableKey?:string
  presentation?:TablePresentation
  basePresentation?:TablePresentation
  actions?:Action[]
  tools?:{page:readonly ToolDefinition[];table:readonly ToolDefinition[]}
  pageSizeOptions?:number[]
  selectedColumnId?:string
  initialTab?:'columns'|'sorts'|'actions'|'appearance'|'toolbar'
  commit?:(change:SettingsCommit)=>Promise<void>
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
  const {fontSize,align,fontFamily,...rest}=style
  return {...rest,...(fontFamily===undefined?{}:{fontFamily:fontFamilyCss(fontFamily)}),...(fontSize===undefined?{}:{fontSize:fontSize+'px'}),...(align===undefined?{}:{textAlign:align})}
}
export function editableColumnWidth(column:ColumnConfig):number {
  if(column.width!==undefined)return column.width
  const {min,max}=getColumnWidthBounds(column)
  return Math.min(max,Math.max(min,160))
}
