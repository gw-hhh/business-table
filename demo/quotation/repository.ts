import { computed, readonly, shallowRef } from 'vue'
import { cloneData } from '../../src/runtime/value'
import { makeExampleQuotations, parseQuotationBackup, serializeQuotationBackup, type Quotation } from './model'

export const quotationDataKey='business-table.quotation-demo.data.v1'
export interface QuotationRepositoryOptions {
  storage:Pick<Storage,'getItem'|'setItem'>|null
  key?:string
  events?:Pick<EventTarget,'addEventListener'|'removeEventListener'>
  onWarning?:(message:string)=>void
}
export interface QuotationSnapshot {version:number;rows:Quotation[]}
class QuotationConflictError extends Error {}

/** Domain persistence owns the published snapshot; a failed write never changes the table's rows. */
export function createQuotationRepository(options:QuotationRepositoryOptions){
  const key=options.key??quotationDataKey,storedRows=shallowRef<Quotation[]>([])
  const temporary=shallowRef(!options.storage),externalChanged=shallowRef(false)
  let loaded=false,lastRaw:string|null=null,storedRevision=0,version=0
  const copy=()=>cloneData(storedRows.value)
  function validate(rows:Quotation[]):Quotation[]{
    if(rows.length>10000)throw new Error('本地演示最多保存 10000 条记录。')
    return parseQuotationBackup(serializeQuotationBackup(rows))
  }
  function publish(rows:Quotation[],raw:string|null,revision:number){
    storedRows.value=rows;lastRaw=raw;storedRevision=revision;loaded=true;version++;externalChanged.value=false
  }
  function serialize(rows:Quotation[],revision:number){return JSON.stringify({kind:'quotation-demo',version:1,revision,rows})}
  function read(reload=false):Quotation[]{
    if(loaded&&(!reload||temporary.value))return copy()
    if(temporary.value){
      publish(makeExampleQuotations(),null,0)
      options.onWarning?.('本地存储不可用，当前修改只保留到页面关闭。')
      return copy()
    }
    try{
      const raw=options.storage!.getItem(key)
      if(raw===null){
        const rows=makeExampleQuotations(),initial=serialize(rows,1)
        options.storage!.setItem(key,initial)
        publish(rows,initial,1)
      }else{
        const rows=parseQuotationBackup(raw),payload:unknown=JSON.parse(raw)
        const revision=payload&&typeof payload==='object'&&'revision' in payload?payload.revision:0
        if(typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<0||rows.length>10000)throw new Error('不支持此数据版本。')
        publish(rows,raw,revision)
      }
    }catch{
      if(loaded)throw new Error('读取本地数据失败，当前列表未被覆盖。请检查浏览器存储或备份数据。')
      temporary.value=true;publish(makeExampleQuotations(),null,0)
      options.onWarning?.('本地数据无法读取，已切换临时模式；原存储内容未覆盖。')
    }
    return copy()
  }
  function snapshot():QuotationSnapshot{read();return {version,rows:copy()}}
  function commit(nextRows:Quotation[],expectedVersion?:number):Quotation[]{
    read()
    if(expectedVersion!==undefined&&expectedVersion!==version)throw new QuotationConflictError('这份报价数据已被修改，请重新打开后再试。')
    const rows=validate(nextRows),revision=storedRevision+1
    if(!Number.isSafeInteger(revision))throw new Error('数据版本已超出允许范围，请导出备份。')
    if(!temporary.value){
      const raw=serialize(rows,revision)
      try{
        if(options.storage!.getItem(key)!==lastRaw){externalChanged.value=true;throw new QuotationConflictError('数据已被其他页面修改，请刷新列表后再试。')}
        options.storage!.setItem(key,raw)
      }catch(cause){
        if(cause instanceof QuotationConflictError)throw cause
        throw new Error('保存失败，数据未更改。请检查浏览器存储空间或导出备份。')
      }
      publish(rows,raw,revision)
    }else publish(rows,lastRaw,revision)
    return copy()
  }
  function storageChanged(event:Event){
    if(!loaded||temporary.value||!(event instanceof StorageEvent)||(event.key!==null&&event.key!==key))return
    if(event.storageArea&&event.storageArea!==options.storage)return
    externalChanged.value=event.newValue!==lastRaw
  }
  options.events?.addEventListener('storage',storageChanged)
  return {rows:computed<Quotation[]>(()=>copy()),externalChanged:readonly(externalChanged),temporary:readonly(temporary),read,commit,snapshot,
    dispose:()=>options.events?.removeEventListener('storage',storageChanged)}
}
