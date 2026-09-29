import {computed,onBeforeUnmount,readonly,shallowRef,watch,type Ref} from 'vue'
import type {ColumnConfig,RowData} from '../../types'
import type {Appearance} from '../presentation/model'
import {isSummaryColumn,type SummaryState} from './model'
export function useSummary<T extends RowData>(context:{
  ready:Readonly<Ref<boolean>>
  appearance:Readonly<Ref<Appearance>>;columns:Readonly<Ref<ColumnConfig<T>[]>>
  identity:Readonly<Ref<unknown>>;rows:Readonly<Ref<T[]>>;selected:Readonly<Ref<Map<string,T>>>
  readRows:(scope:'query'|'selected',signal?:AbortSignal)=>Promise<T[]>
}){
  const state=shallowRef<SummaryState>({status:'disabled',scope:'query',columnId:'',title:''})
  const column=computed(()=>context.columns.value.find(item=>item.id===context.appearance.value.summaryColumn))
  let sequence=0,controller:AbortController|undefined
  const cancel=()=>{sequence++;controller?.abort();controller=undefined}
  watch([context.ready,()=>context.appearance.value.summaryEnabled,()=>context.appearance.value.summaryColumn,column,context.identity,context.rows,context.selected],async()=>{
    cancel()
    const scope=context.selected.value.size?'selected':'query'
    const metadata={scope,columnId:context.appearance.value.summaryColumn,title:column.value?.title??''} as const
    if(!context.appearance.value.summaryEnabled){state.value={...metadata,status:'disabled'};return}
    if(!context.ready.value){state.value={...metadata,status:'loading'};return}
    const target=column.value
    if(!target || !isSummaryColumn(target)){state.value={...metadata,status:'error',error:'请选择有效的数值汇总列。'};return}
    const request=sequence,active=new AbortController();controller=active
    const current=()=>sequence===request&&!active.signal.aborted
    state.value={...metadata,status:'loading'}
    try{
      const [rows,{sumColumn}]=await Promise.all([context.readRows(scope,active.signal),import('./aggregate')])
      if(current())state.value={...metadata,status:'ready',...sumColumn(rows,target)}
    }catch(cause){if(current())state.value={...metadata,status:'error',error:cause instanceof Error?cause.message:String(cause)}}
  },{immediate:true})
  onBeforeUnmount(cancel)
  return readonly(state)
}
