import {computed,onBeforeUnmount,onMounted,readonly,ref,shallowRef,watch} from 'vue'
import type {ColumnConfig,DataSource,FilterConfig,Pagination,Persistence,Query,RowData,SortConfig,TableConfig,UserColumnConfig,ViewConfig} from '../types'
import type {ConfigDiagnostic} from '../config/diagnostics'
import {applyFilters,applySorts,makeConfig,mergeColumns,patchColumn} from '../core'
import {applyColumnPatches,guardColumnPatch} from '../config/columns'
import {createPreferenceDelta,parsePreference} from '../config/schema'
import {defaultColumnFilter,matchesFilterGroup,collectFilterOptions,type FilterOption,type FilterGroup} from '../features/filters/model'
import {defaultPresentation,resolvePresentation,presentationDelta,type PresentationDelta} from '../features/presentation/model'
import {validateSettings,type SettingsCommit} from '../features/settings/session'
import {normalizePagination,clampPage} from './pagination'
import {withDeadline} from './deadline'
import {cloneData,getValue} from './value'

export interface TableRuntimeInput<T extends RowData> {
  readonly tableKey?:string;readonly rowKey?:string;readonly columns:ColumnConfig<T>[];readonly data?:T[]
  readonly dataSource?:DataSource<T>;readonly pagination?:Partial<Pagination>;readonly config?:TableConfig|null
  readonly persistence?:Persistence|null;readonly preferenceTimeoutMs?:number;readonly selection?:boolean
  readonly presentation?:PresentationDelta;readonly density?:'compact'|'default'|'comfortable'
}
export interface TableRuntimeEvents<T extends RowData> {
  queryChange?:(query:Query)=>void;configChange?:(config:TableConfig)=>void;viewChange?:(id:string|null)=>void
  selectionChange?:(rows:T[])=>void;diagnostic?:(diagnostic:ConfigDiagnostic)=>void
}
export type QueryChange=Partial<Pick<Query,'keyword'|'filters'|'sorts'|'viewId'|'filterGroup'>>
/** The same state and commands are consumed by the default table, custom UI and headless pages. */
export function useTableRuntime<T extends RowData>(input:TableRuntimeInput<T>,events:TableRuntimeEvents<T>={}){
  const key=()=>input.tableKey??'',rowKey=()=>input.rowKey??'id'
  const initial=normalizePagination({...input.pagination,pageSize:input.config?.pageSize??input.pagination?.pageSize})
  const rows=shallowRef<T[]>([]),total=ref(0),page=ref(initial.page),pageSize=ref(initial.pageSize)
  const keyword=ref(''),searchDraft=ref(''),filters=ref<FilterConfig[]>([]),columnFilters=ref<FilterConfig[]>([]),filterGroup=ref<FilterGroup>()
  const sorts=ref<SortConfig[]>([]),activeView=ref<string|null>(null),busy=ref(false),error=ref('')
  const config=ref<TableConfig>(input.config?cloneData(input.config):makeConfig(key(),input.columns))
  const viewColumns=ref<Record<string,UserColumnConfig>>({}),viewPresentation=ref<PresentationDelta>()
  const allowedPageSizes=computed(()=>normalizePagination(input.pagination).pageSizeOptions)
  const basePresentation=computed(()=>resolvePresentation(input.presentation,{...defaultPresentation(),appearance:{...defaultPresentation().appearance,density:input.density??'default',pageSize:normalizePagination(input.pagination).pageSize}}))
  const personalPresentation=computed(()=>resolvePresentation(config.value.presentation,basePresentation.value))
  const presentation=computed(()=>resolvePresentation(viewPresentation.value,personalPresentation.value))
  const personalColumns=computed(()=>mergeColumns(input.columns,config.value))
  const allResolvedColumns=computed(()=>applyColumnPatches(personalColumns.value,viewColumns.value))
  const resolvedColumns=computed(()=>allResolvedColumns.value.filter(column=>column.visible!==false))
  const query=computed<Query>(()=>({page:page.value,pageSize:pageSize.value,sorts:sorts.value,filters:[...filters.value,...columnFilters.value],keyword:keyword.value,viewId:activeView.value,...(columnFilters.value.length?{columnFilters:columnFilters.value}:{}),...(filterGroup.value?{filterGroup:filterGroup.value}:{})}))
  const pages=computed(()=>Math.max(1,Math.ceil(total.value/pageSize.value)))
  const jumpPage=ref(1),pageButtons=computed(()=>Array.from({length:Math.min(5,pages.value)},(_,index)=>Math.max(1,Math.min(page.value-2,pages.value-4))+index))
  const selected=shallowRef(new Map<string,T>())
  let sequence=0,identity=0,ready=false,disposed=false,controller:AbortController|null=null,preferenceController=new AbortController(),writeQueue:Promise<void>=Promise.resolve()
  const extensionErrors=new Set<string>(),commitListeners=new Set<(before:TableConfig,after:TableConfig)=>void>()
  function report(diagnostic:ConfigDiagnostic){
    if(diagnostic.code==='RuntimeExtensionError'){const fingerprint=diagnostic.path+':'+diagnostic.message;if(extensionErrors.has(fingerprint))return;extensionErrors.add(fingerprint)}
    events.diagnostic?.(diagnostic)
  }
  const reportConfigError=(cause:unknown)=>report({code:'RemoteConfigError',path:'preference',message:cause instanceof Error?cause.message:String(cause)})
  function rowId(row:RowData){return String(getValue(row,rowKey())??'')}
  function getSelectedRows():T[]{return [...selected.value.values()]}
  function clearSelection(){if(!selected.value.size)return;selected.value=new Map();events.selectionChange?.([])}
  function selectRow(row:T,checked:boolean){const next=new Map(selected.value);if(checked)next.set(rowId(row),row);else next.delete(rowId(row));selected.value=next;events.selectionChange?.(getSelectedRows())}
  function selectPage(checked:boolean){const next=new Map(selected.value);for(const row of rows.value){if(checked)next.set(rowId(row),row);else next.delete(rowId(row))}selected.value=next;events.selectionChange?.(getSelectedRows())}
  const allSelected=computed(()=>rows.value.length>0&&rows.value.every(row=>selected.value.has(rowId(row))))
  const someSelected=computed(()=>!allSelected.value&&rows.value.some(row=>selected.value.has(rowId(row))))
  watch(rows,current=>{
    if(!selected.value.size)return
    const fresh=new Map(current.map(row=>[rowId(row),row])),available=!input.dataSource?new Set((input.data??[]).map(rowId)):undefined,next=new Map(selected.value)
    let changed=false
    for(const [id,previous] of next){const row=fresh.get(id);if(total.value===0||available&&!available.has(id)){next.delete(id);changed=true}else if(row&&row!==previous){next.set(id,row);changed=true}}
    if(changed){selected.value=next;events.selectionChange?.(getSelectedRows())}
  })
  watch(()=>input.selection,enabled=>{if(!enabled)clearSelection()})
  function copyQuery(source:Query):Query{const {signal,...snapshot}=source;return cloneData(snapshot)}
  function filterLocal(data:readonly T[],request:Query):T[]{
    let result=[...data]
    if(request.keyword){const search=request.keyword.toLocaleLowerCase();result=result.filter(row=>resolvedColumns.value.filter(column=>column.kind!=='actions').some(column=>String(getValue(row,column.field)??'').toLocaleLowerCase().includes(search)))}
    result=applyFilters(result,request.filters).filter(row=>matchesFilterGroup(row,request.filterGroup))
    return applySorts(result,request.sorts,allResolvedColumns.value)
  }
  function validPage(request:Query,count:number){return clampPage(request.page,Math.max(1,Math.ceil(count/request.pageSize)))}
  async function load(snapshot?:Query):Promise<void>{
    if(!ready||disposed)return
    const requestId=++sequence;controller?.abort();const active=new AbortController();controller=active
    const current=()=>!disposed&&requestId===sequence&&!active.signal.aborted
    busy.value=true;error.value=''
    try{
      const request=copyQuery(snapshot??query.value);events.queryChange?.(copyQuery(request))
      if(input.dataSource){
        const result=await input.dataSource.query({...copyQuery(request),signal:active.signal})
        if(!current())return
        if(!result||!Array.isArray(result.rows)||!Number.isSafeInteger(result.total)||result.total<0)throw new Error('数据接口返回了无效的记录或总数。')
        const corrected=validPage(request,result.total)
        if(corrected!==request.page){page.value=corrected;void load({...request,page:corrected});return}
        rows.value=result.rows;total.value=result.total
      }else{
        const result=filterLocal(input.data??[],request);total.value=result.length;page.value=validPage(request,result.length)
        rows.value=result.slice((page.value-1)*request.pageSize,page.value*request.pageSize)
      }
    }catch(cause){if(current())error.value=cause instanceof Error?cause.message:String(cause)}
    finally{if(current()){busy.value=false;controller=null}}
  }
  function releaseViewOverrides(id:string,change:UserColumnConfig){
    if(!Object.hasOwn(viewColumns.value,id))return
    const columns={...viewColumns.value},patch={...columns[id]}
    for(const field of Object.keys(change) as (keyof UserColumnConfig)[])delete patch[field]
    if(Object.keys(patch).length)columns[id]=patch;else delete columns[id]
    viewColumns.value=columns
  }
  /** Durable writes are serialized. Failed writes never publish partially applied state. */
  function saveConfig(update:(current:TableConfig)=>TableConfig,afterCommit?:()=>void):Promise<void>{
    const tableKey=key(),epoch=identity,persistence=input.persistence
    const task=writeQueue.catch(()=>{}).then(async()=>{
      if(disposed||epoch!==identity||tableKey!==key())throw new Error('表格已切换，请重新打开设置。')
      const before=cloneData(config.value),next=update(config.value)
      if(next===config.value)return
      try{
        if(persistence){
          const delta=createPreferenceDelta(tableKey,input.columns,next,basePresentation.value.appearance.pageSize,basePresentation.value)
          await persistence.save(tableKey,{schemaVersion:1,tableKey,columns:delta.columns,...(delta.pagination?{pageSize:delta.pagination.pageSize}:{}),...(delta.presentation?{presentation:delta.presentation}:{})})
        }
      }catch(cause){reportConfigError(cause);throw cause}
      if(disposed||epoch!==identity||tableKey!==key())return
      config.value=next;afterCommit?.();events.configChange?.(cloneData(next))
      for(const listener of commitListeners){try{listener(before,cloneData(next))}catch(cause){reportConfigError(cause)}}
    })
    writeQueue=task;return task
  }
  function acceptPatches(current:TableConfig,patches:Record<string,UserColumnConfig>){
    let next=current;const accepted:Record<string,UserColumnConfig>=Object.create(null)
    for(const [id,change] of Object.entries(patches)){const column=input.columns.find(column=>column.id===id);if(!column)continue;const guarded=guardColumnPatch(column,change,report);if(Object.keys(guarded).length){accepted[id]=guarded;next=patchColumn(next,id,guarded)}}
    return {next,accepted}
  }
  async function applyPatches(patches:Record<string,UserColumnConfig>){
    let accepted:Record<string,UserColumnConfig>={}
    await saveConfig(current=>{const result=acceptPatches(current,patches);accepted=result.accepted;return result.next},()=>{for(const [id,patch] of Object.entries(accepted))releaseViewOverrides(id,patch)})
  }
  async function patch(id:string,change:UserColumnConfig){return applyPatches({[id]:change})}
  async function setQuery(change:QueryChange){
    const base:Query={...query.value,filters:filters.value,...change,page:1},snapshot=copyQuery(base)
    keyword.value=snapshot.keyword??'';searchDraft.value=keyword.value;filters.value=snapshot.filters;sorts.value=snapshot.sorts;activeView.value=snapshot.viewId??null;filterGroup.value=snapshot.filterGroup;page.value=1
    clearSelection();await load()
  }
  async function setColumnFilters(next:FilterConfig[]){
    const columns=new Map(allResolvedColumns.value.map(column=>[column.field,column]))
    columnFilters.value=cloneData(next).filter(filter=>{const column=columns.get(filter.field);return column&&defaultColumnFilter(column).enabled&&defaultColumnFilter(column).operators.includes(filter.operator)})
    page.value=1;clearSelection();await load()
  }
  function search(){keyword.value=searchDraft.value;page.value=1;clearSelection();void load()}
  function goPage(next:number){page.value=clampPage(next,pages.value);void load()}
  function changePageSize(){page.value=1;pageSize.value=normalizePagination({...input.pagination,pageSize:pageSize.value}).pageSize;void saveConfig(current=>({...current,pageSize:pageSize.value})).catch(()=>{});void load()}
  function sort(column:ColumnConfig){
    if(!column.sortable)return
    const old=sorts.value.find(sort=>sort.field===column.field)
    sorts.value=old?.order==='desc'?[]:[{field:column.field,order:old?'desc':'asc'}]
    page.value=1;void load()
  }
  async function applySettings(change:SettingsCommit){
    const target=applyColumnPatches(allResolvedColumns.value,change.columns,report),issues=validateSettings(target)
    if(issues.length)throw new Error(issues[0]!.message)
    const prepared=resolvePresentation(change.presentation,basePresentation.value)
    prepared.appearance.pageSize=normalizePagination({...input.pagination,pageSize:prepared.appearance.pageSize}).pageSize
    const nextSorts=cloneData(change.sorts).filter(sort=>target.some(column=>column.field===sort.field&&column.sortable))
    let accepted:Record<string,UserColumnConfig>={}
    await saveConfig(current=>{const result=acceptPatches(current,change.columns);accepted=result.accepted;return {...result.next,pageSize:prepared.appearance.pageSize,presentation:presentationDelta(prepared,basePresentation.value)}},()=>{
      for(const [id,patch] of Object.entries(accepted))releaseViewOverrides(id,patch)
      viewPresentation.value=undefined;sorts.value=nextSorts;pageSize.value=prepared.appearance.pageSize;page.value=1
      columnFilters.value=columnFilters.value.filter(rule=>{const column=target.find(column=>column.field===rule.field);return column&&defaultColumnFilter(column).enabled&&defaultColumnFilter(column).operators.includes(rule.operator)})
    })
    clearSelection();await load()
  }
  async function setPresentation(change:PresentationDelta){await applySettings({columns:{},sorts:sorts.value,presentation:resolvePresentation(change,presentation.value)})}
  async function applyView(view?:ViewConfig,searchKeyword?:string){
    activeView.value=view?.id??null
    filters.value=cloneData(view?.filters??[]);sorts.value=cloneData(view?.sorts??[]);columnFilters.value=cloneData(view?.columnFilters??[]);filterGroup.value=cloneData(view?.filterGroup)
    if(view?.isSystem){/* The base view clears queries, not the user's current layout. */}
    else {viewColumns.value=cloneData(view?.columns??{});viewPresentation.value=cloneData(view?.presentation)}
    if(searchKeyword!==undefined||view?.keyword!==undefined||view?.isSystem)keyword.value=searchKeyword??view?.keyword??''
    searchDraft.value=keyword.value
    if(view?.pageSize!==undefined)pageSize.value=normalizePagination({...input.pagination,pageSize:view.pageSize}).pageSize
    else if(view?.presentation?.appearance?.pageSize!==undefined)pageSize.value=normalizePagination({...input.pagination,pageSize:view.presentation.appearance.pageSize}).pageSize
    clearSelection();page.value=1;events.viewChange?.(activeView.value);await load()
  }
  function getState(){return {rows:[...rows.value],total:total.value,page:page.value,pageSize:pageSize.value,query:copyQuery(query.value),searchFilters:cloneData(filters.value),columnFilters:cloneData(columnFilters.value),columns:cloneData(allResolvedColumns.value),presentation:cloneData(presentation.value),config:cloneData(config.value)}}
  function viewSnapshot():Omit<ViewConfig,'id'|'name'>{
    const columns=Object.fromEntries(allResolvedColumns.value.map((column,index)=>[column.id,{...cloneData(config.value.columns[column.id]??{}),...cloneData(viewColumns.value[column.id]??{}),visible:column.visible!==false,order:index,width:column.width,fixed:column.fixed??false,align:column.align,title:column.title,sortable:column.sortable,headerStyle:column.headerStyle,cellStyle:column.cellStyle,content:column.content,mapping:column.mapping,numberRule:column.numberRule,template:column.template,filter:column.filter}]))
    const display=presentationDelta(presentation.value,basePresentation.value)
    if(!presentation.value.toolbar.followView)delete display.toolbar
    return {columns,keyword:keyword.value,filters:cloneData(filters.value),columnFilters:cloneData(columnFilters.value),filterGroup:cloneData(filterGroup.value),sorts:cloneData(sorts.value),pageSize:pageSize.value,presentation:display}
  }
  async function readRows(scope:'page'|'query'|'selected'|'all'='query',signal?:AbortSignal):Promise<T[]>{
    if(scope==='page')return [...rows.value]
    if(scope==='selected')return getSelectedRows()
    const request=copyQuery(query.value)
    if(scope==='all'){request.keyword='';request.filters=[];delete request.columnFilters;delete request.filterGroup}
    if(!input.dataSource)return scope==='all'?[...(input.data??[])]:filterLocal(input.data??[],request)
    if(!input.dataSource.readAll)throw new Error('该数据源未提供完整结果接口，请使用当前页或服务端导出。')
    const result=await input.dataSource.readAll({...request,signal},{limit:10000,signal})
    if(!Array.isArray(result)||result.length>10000)throw new Error('浏览器最多处理 10000 条记录，请使用服务端导出。')
    return result
  }
  async function optionsFor(column:ColumnConfig,search='',signal?:AbortSignal):Promise<FilterOption[]>{
    const settings=defaultColumnFilter(column)
    let result:FilterOption[]
    if(settings.source==='manual')result=cloneData(settings.options)
    else if(settings.source==='mapping')result=column.mapping?.items.map(item=>({value:item.value,label:item.label}))??column.valueMap?.map(item=>({value:item.value,label:item.label}))??[]
    else if(input.dataSource?.options)result=await input.dataSource.options(column as ColumnConfig<T>,copyQuery(query.value),{search,signal})
    else if(settings.source==='remote')throw new Error('此列未配置选项接口。')
    else result=collectFilterOptions(await readRows('all',signal),column)
    const needle=search.trim().toLocaleLowerCase()
    return needle?result.filter(option=>option.label.toLocaleLowerCase().includes(needle)||String(option.value??'').toLocaleLowerCase().includes(needle)):result
  }
  async function initialize(){
    const epoch=++identity;ready=false;controller?.abort();sequence++;preferenceController.abort();preferenceController=new AbortController()
    if(input.persistence){try{
      const stored=parsePreference(await withDeadline(signal=>input.persistence!.load(key(),{signal}),input.preferenceTimeoutMs??3000,preferenceController.signal),key(),report)
      if(disposed||epoch!==identity)return
      if(stored){config.value={schemaVersion:1,tableKey:key(),columns:stored.columns,pageSize:stored.pagination?.pageSize,...(stored.presentation?{presentation:stored.presentation}:{})};pageSize.value=normalizePagination({...input.pagination,pageSize:stored.pagination?.pageSize??input.pagination?.pageSize}).pageSize}
    }catch(cause){if(!disposed&&epoch===identity)reportConfigError(cause)}}
    if(disposed||epoch!==identity)return
    ready=true;void load()
  }
  watch([()=>input.config,()=>input.pagination?.pageSize,()=>input.pagination?.pageSizeOptions],()=>{
    config.value=input.config?cloneData(input.config):makeConfig(key(),input.columns)
    const next=normalizePagination({...input.pagination,pageSize:input.config?.pageSize??input.pagination?.pageSize}).pageSize
    if(pageSize.value!==next){pageSize.value=next;page.value=1;void load()}
  })
  watch([()=>input.dataSource,()=>input.data],([source],[previous])=>{if(source!==previous)page.value=1;if(source!==previous||!source)void load()},{deep:true})
  watch(()=>input.tableKey,()=>{config.value=input.config?cloneData(input.config):makeConfig(key(),input.columns);viewColumns.value={};viewPresentation.value=undefined;keyword.value='';searchDraft.value='';filters.value=[];columnFilters.value=[];filterGroup.value=undefined;sorts.value=[];activeView.value=null;clearSelection();rows.value=[];total.value=0;page.value=1;pageSize.value=normalizePagination(input.pagination).pageSize;extensionErrors.clear();void initialize()})
  onMounted(initialize)
  onBeforeUnmount(()=>{disposed=true;identity++;sequence++;preferenceController.abort();controller?.abort();commitListeners.clear()})
  const commands={reload:()=>load(),setQuery,setColumnFilters,applyView,applySettings,setPresentation,patch,applyPatches,getState,viewSnapshot,getSelectedRows,clearSelection,selectRow,selectPage,goPage,readRows,optionsFor,sort}
  return {rows,total,page,pageSize,keyword,searchDraft,filters,columnFilters,filterGroup,sorts,activeView,busy,error,config,viewColumns,allResolvedColumns,resolvedColumns,query,pages,jumpPage,pageButtons,selected,allSelected,someSelected,allowedPageSizes,presentation,basePresentation,report,rowId,load,search,changePageSize,...commands,onCommit:(listener:(before:TableConfig,after:TableConfig)=>void)=>{commitListeners.add(listener);return ()=>commitListeners.delete(listener)}}
}
export type TableRuntime<T extends RowData=RowData>=ReturnType<typeof useTableRuntime<T>>
