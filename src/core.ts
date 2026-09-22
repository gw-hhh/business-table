import type{ColumnConfig,FilterConfig,NumberFormat,RowData,SortConfig,TableConfig,UserColumnConfig,ValueMapItem}from'./types'
import {applyColumnPatches} from './config/columns'
export function getValue(row:RowData,path:string){return path.split('.').reduce<unknown>((v,k)=>v&&typeof v==='object'?(v as RowData)[k]:undefined,row)}
export function displayValue(value:unknown,column:ColumnConfig){if(value==null||value==='')return column.emptyText??'—';const mapped=column.valueMap?.find(x=>Object.is(x.value,value));if(mapped)return mapped.label;if(column.type==='number'||column.type==='currency'||column.type==='percent')return formatNumber(Number(value),column.numberFormat??{style:column.type==='currency'?'currency':column.type==='percent'?'percent':'decimal'});return String(value)}
export function formatNumber(value:number,f:NumberFormat={}){if(!Number.isFinite(value))return'—';const style=f.style??'decimal';const normalized=style==='percent'&&f.percentBase==='percent'?value/100:value;return`${f.prefix??''}${new Intl.NumberFormat('zh-CN',{style,currency:style==='currency'?(f.currency??'CNY'):undefined,useGrouping:f.useGrouping??true,minimumFractionDigits:f.minimumFractionDigits,maximumFractionDigits:Math.max(f.minimumFractionDigits??0,f.maximumFractionDigits??(style==='currency'?2:style==='percent'?2:20))}).format(normalized)}${f.suffix??''}`}
export function applyFilters<T extends RowData>(rows:T[],filters:FilterConfig[]){return rows.filter(row=>filters.every(f=>{const v=getValue(row,f.field),q=f.value;switch(f.operator){case'eq':return Object.is(v,q);case'contains':return String(v??'').toLowerCase().includes(String(q??'').toLowerCase());case'in':return Array.isArray(q)&&q.some(x=>Object.is(x,v));case'gt':return Number(v)>Number(q);case'gte':return Number(v)>=Number(q);case'lt':return Number(v)<Number(q);case'lte':return Number(v)<=Number(q)}}))}
export function applySorts<T extends RowData>(rows:T[],sorts:SortConfig[],columns:readonly ColumnConfig[]=[]){
  const empty=(value:unknown)=>value===null||value===undefined||value===''
  return [...rows].sort((a,b)=>{
    for(const sort of sorts){
      const av=getValue(a,sort.field),bv=getValue(b,sort.field)
      if(Object.is(av,bv))continue
      if(empty(av)||empty(bv))return empty(av)?1:-1
      const column=columns.find(item=>item.field===sort.field)
      if(column?.mapping?.enabled&&column.mapping.sort){
        const items=column.mapping.items,ai=items.findIndex(item=>Object.is(item.value,av)),bi=items.findIndex(item=>Object.is(item.value,bv))
        if(ai!==bi){const difference=(ai<0?items.length:ai)-(bi<0?items.length:bi);return sort.order==='asc'?difference:-difference}
      }
      const result=av!<bv!?-1:1
      return sort.order==='asc'?result:-result
    }
    return 0
  })
}
export function mergeColumns<T extends RowData>(columns:ColumnConfig<T>[],config?:TableConfig){return applyColumnPatches(columns,config?.columns)}
export function makeConfig<T extends RowData>(tableKey:string,columns:ColumnConfig<T>[]):TableConfig{return{schemaVersion:1,tableKey,columns:Object.fromEntries(columns.map((c,i)=>[c.id,{visible:c.visible??true,order:i,width:c.width,fixed:c.fixed??false,align:c.align}]))}}
export function patchColumn(config:TableConfig,id:string,patch:UserColumnConfig){return{...config,columns:{...config.columns,[id]:{...config.columns[id],...patch}}}}
export function mapStyle(value:unknown,map?:ValueMapItem[]){return map?.find(x=>Object.is(x.value,value))}
