import type { ColumnConfig, ColumnTextStyle, RowData } from '../../types'
import { decimal, evaluateCell } from '../columns/evaluate'
import { getValue } from '../../runtime/value'
import type { Appearance } from '../presentation/model'

export interface ExportField { id:string;label:string;column:ColumnConfig;total?:boolean }
export interface ExportGroup { id:string;label:string;rows:readonly RowData[] }
export interface ExportOptions {keys:string[];format:'xlsx'|'csv';valueMode:'display'|'raw'|'both';aliases:boolean;style:'current'|'standard';total:boolean;metadata:boolean}
export interface ExportPreset {id:string;name:string;options:ExportOptions}
export interface ExportInfo {scope:string;conditions?:readonly string[];time?:string;appearance?:Partial<Appearance>}
export interface ExportCell {value:string|number|boolean|Date|null;text:string;format?:string;style?:ColumnTextStyle;header?:boolean}
export interface ExportValidation {column:number;from:number;to:number;choices:readonly string[]}
export interface ExportBook {sheets:{name:string;rows:ExportCell[][];widths?:number[];validations?:ExportValidation[]}[]}
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
export function exportFields(fields:readonly ExportField[]):ExportField[]{const seen=new Set<string>();return fields.filter(field=>{if(!field.id||seen.has(field.id)||field.column.kind==='actions')return false;seen.add(field.id);return true})}
export function normalizeExportOptions(input:unknown,fields:readonly ExportField[]):ExportOptions{
  const source=object(input),allowed=exportFields(fields).map(field=>field.id)
  return {keys:Array.isArray(source.keys)?[...new Set(source.keys.filter((id):id is string=>typeof id==='string'&&allowed.includes(id)))]:allowed,format:source.format==='csv'?'csv':'xlsx',valueMode:source.valueMode==='raw'||source.valueMode==='both'?source.valueMode:'display',aliases:source.aliases===true,style:source.style==='current'?'current':'standard',total:source.total===true,metadata:source.metadata===true}
}
export function readExportPresets(input:unknown,fields:readonly ExportField[]):ExportPreset[]{
  const value=typeof input==='string'?JSON.parse(input):input;if(!Array.isArray(value))return []
  const names=new Set<string>(),ids=new Set<string>();return value.slice(0,20).flatMap(item=>{const row=object(item);if(typeof row.name!=='string'||!row.name.trim()||row.name.trim().length>30)return [];const name=row.name.trim(),key=name.normalize('NFKC').toLocaleLowerCase();if(names.has(key))return [];names.add(key);let id=typeof row.id==='string'&&row.id?row.id:crypto.randomUUID();if(ids.has(id))id=crypto.randomUUID();ids.add(id);return [{id,name,options:normalizeExportOptions(row.options,fields)}]})
}
export function saveExportPreset(current:readonly ExportPreset[],name:string,options:ExportOptions,fields:readonly ExportField[],replace=false):ExportPreset[]{
  const label=name.trim();if(!label||label.length>30)throw new Error('请输入 1–30 个字符的方案名称。')
  const normalized=normalizeExportOptions(options,fields);if(!normalized.keys.length)throw new Error('请至少选择一个导出字段。')
  const existing=current.find(item=>item.name.normalize('NFKC').toLocaleLowerCase()===label.normalize('NFKC').toLocaleLowerCase())
  if(existing&&!replace)throw new Error('该方案已存在，请确认更新方案。')
  if(!existing&&current.length>=20)throw new Error('最多保存 20 个导出方案。')
  const next={id:existing?.id??crypto.randomUUID(),name:label,options:normalized}
  return existing?current.map(item=>item.id===existing.id?next:item):[...current,next]
}
const cell=(value:ExportCell['value'],extra:Partial<ExportCell>={}):ExportCell=>({value,text:value instanceof Date?value.toISOString().slice(0,10):String(value??''),...extra})
function effectiveStyle(column:ColumnConfig,header:boolean,appearance:Partial<Appearance>={}):ColumnTextStyle{
  const own=(header?column.headerStyle:column.cellStyle)??{},family=own.fontFamily&&own.fontFamily!=='inherit'?own.fontFamily:appearance.fontFamily
  return {fontFamily:family&&family!=='inherit'?family:'system',fontSize:own.fontSize??(header?appearance.headerFontSize:appearance.fontSize)??14,color:own.color??(header?appearance.headerColor:appearance.color)??'#334155',fontWeight:header?'600':own.fontWeight??'normal',align:own.align??column.align??'left'}
}
function valueCell(row:RowData,field:ExportField,all:readonly ExportField[],mode:'display'|'raw',style:boolean,appearance?:Partial<Appearance>):ExportCell{
  const result=evaluateCell(row,field.column,all.map(item=>item.column)),raw=getValue(row,field.column.field)
  const text=mode==='display'?result.text:raw==null?'':typeof raw==='object'?JSON.stringify(raw):String(raw)
  let value:ExportCell['value']=mode==='raw'?(raw==null?null:typeof raw==='number'||typeof raw==='boolean'?raw:text):result.mapping||field.column.mapping?.enabled||field.column.template?.enabled?result.text:result.exportValue
  let format=mode==='display'?result.excelFormat:typeof raw==='number'?'0.###############':'@'
  if(field.column.type==='date'&&(mode==='raw'||(!field.column.mapping?.enabled&&!field.column.template?.enabled))&&typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw)&&!Number.isNaN(Date.parse(raw))){value=new Date(`${raw}T00:00:00Z`);format=style&&field.column.content?.dateFormat==='slash'?'yyyy/mm/dd':style&&field.column.content?.dateFormat==='cn'?'yyyy"年"m"月"d"日"':'yyyy-mm-dd'}
  return cell(value,{text,format,...(style?{style:effectiveStyle(field.column,false,appearance)}:{})})
}
function exactSum(rows:readonly RowData[],field:string):number|string{
  let numerator=0n,denominator=1n
  for(const row of rows){const fraction=decimal(getValue(row,field));if(!fraction)continue;const [next,divisor]=fraction,common=divisor>denominator?divisor:denominator;numerator=numerator*(common/denominator)+next*(common/divisor);denominator=common}
  const sign=numerator<0n?'-':'',magnitude=numerator<0n?-numerator:numerator
  const places=String(denominator).length-1,remainder=places?String(magnitude%denominator).padStart(places,'0').replace(/0+$/,''):''
  const text=sign+String(magnitude/denominator)+(remainder?'.'+remainder:'')
  return text.replace('-','').replace('.','').replace(/^0+/,'').length>15?text:Number(text)
}
export function buildExportBook(rows:readonly RowData[],declared:readonly ExportField[],input:ExportOptions,info:ExportInfo):ExportBook{
  const fields=exportFields(declared),options=normalizeExportOptions(input,fields)
  if(!options.keys.length)throw new Error('请至少选择一个导出字段。')
  const selected=options.keys.map(id=>fields.find(field=>field.id===id)!).flatMap(field=>{
    const paired=options.valueMode==='both'&&!!(field.column.mapping?.enabled||field.column.valueMap?.length||field.column.numberRule?.enabled||field.column.template?.enabled)
    const modes:('display'|'raw')[]=paired?['display','raw']:[options.valueMode==='raw'?'raw':'display']
    return modes.map(mode=>({field,mode,paired}))
  })
  const header=selected.map(({field,mode,paired})=>cell(`${options.aliases?field.column.title:field.label}${paired?(mode==='raw'?'（原值）':'（显示值）'):''}`,{header:true,...(options.style==='current'?{style:effectiveStyle(field.column,true,info.appearance)}:{})}))
  const data=rows.map(row=>selected.map(({field,mode})=>valueCell(row,field,fields,mode,options.style==='current',info.appearance)))
  const canSum=({field,mode}:{field:ExportField;mode:'display'|'raw'})=>field.total&&(mode==='raw'||!(field.column.mapping?.enabled||field.column.valueMap?.length||field.column.template?.enabled||(field.column.numberRule?.enabled?field.column.numberRule.style==='percent':field.column.type==='percent')))
  if(options.total&&selected.some(canSum)){
    const label=selected.findIndex(item=>!item.field.total)
    const totals=selected.map((item,index)=>{const {field,mode}=item;if(!canSum(item))return cell(index===label?'合计':'');const totalRow={value:exactSum(rows,field.column.field)};return valueCell(totalRow,{...field,column:{...field.column,field:'value'}},fields,mode,options.style==='current',info.appearance)});data.push(totals)
  }
  const sheets:ExportBook['sheets']=[{name:'数据',rows:[header,...data],widths:selected.map(({field})=>Math.max(12,Math.min(60,(field.column.width??160)/7)))}]
  if(options.metadata)sheets.push({name:'导出说明',rows:[['导出范围',info.scope],['记录数',rows.length],['导出时间',info.time??new Date().toLocaleString('zh-CN')],...(info.conditions??[]).map(condition=>['查询条件',condition])].map(values=>values.map(value=>cell(value)))})
  return {sheets}
}
/** CSV text never becomes a spreadsheet formula when opened by a desktop spreadsheet editor. */
export function exportCSV(book:ExportBook):string{
  const escape=(cell:ExportCell)=>{
    const value=cell.text,numeric=typeof cell.value==='number'&&/^[+-]?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?(?:e[+-]?\d+)?%?$/i.test(value)
    const safe=!numeric&&(/^[\s]*[=+@\-＝＋＠－]/.test(value)||/^[\t\r\n]/.test(value))?`'${value}`:value
    return /[",\r\n]/.test(safe)?`"${safe.replaceAll('"','""')}"`:safe
  }
  return '\ufeff'+book.sheets.map(sheet=>sheet.rows.map(row=>row.map(escape).join(',')).join('\r\n')).join('\r\n\r\n')
}
export function downloadExport(data:BlobPart,name:string,type:string){const url=URL.createObjectURL(new Blob([data],{type})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
