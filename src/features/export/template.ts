import type { RowData } from '../../types'
import { buildExportBook, exportFields, normalizeExportOptions, type ExportBook, type ExportField } from './model'

export interface TemplateField extends ExportField {hint:string;choices?:readonly string[]}
export interface TemplateDefinition {fields:readonly TemplateField[];examples?:readonly RowData[];notes?:readonly (readonly [string,string])[]}
/** Fixed business definitions are independent of personal visibility, aliases and column order. */
export function createTemplateBook(definition:TemplateDefinition,withExample=false):ExportBook{
  const fields=exportFields(definition.fields),options=normalizeExportOptions({valueMode:'raw'},fields)
  const first=buildExportBook([],fields,options,{scope:''}).sheets[0]!
  first.name='数据填写'
  for(let index=0;index<100;index++)first.rows.push(fields.map(field=>({value:null,text:'',format:field.column.type==='date'?'yyyy-mm-dd':field.column.type==='number'||field.column.type==='currency'?'0.00':'@'})))
  first.validations=fields.flatMap((field,column)=>{const source=definition.fields.find(item=>item.id===field.id);return source?.choices?.length?[{column,from:2,to:10001,choices:source.choices}]:[]})
  const instructions=[['字段','填写说明'],...fields.map(field=>[field.label,definition.fields.find(item=>item.id===field.id)?.hint??'']),...(definition.notes??[])]
  const book:ExportBook={sheets:[first,{name:'填写说明',widths:[24,64],rows:instructions.map((row,index)=>row.map(value=>({value,text:value,header:index===0,format:'@'})))}]}
  if(withExample){const example=buildExportBook(definition.examples??[],fields,options,{scope:''}).sheets[0]!;example.name='示例';book.sheets.push(example)}
  return book
}
