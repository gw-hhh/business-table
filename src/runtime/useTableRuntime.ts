import {computed,markRaw,onBeforeUnmount,onMounted,readonly,ref,shallowRef,watch} from 'vue'
import type {ColumnConfig,DataSource,FilterConfig,Pagination,Persistence,Query,RowData,SortConfig,TableConfig,UserColumnConfig,ViewConfig} from '../types'
import type {ConfigDiagnostic} from '../config/diagnostics'
import type {RuntimeRegistry} from './registry'
import {applyFilters,applySorts,makeConfig,mergeColumns,patchColumn} from '../core'
import {applyColumnPatches,guardColumnPatch,isColumnCapabilityEnabled} from '../config/columns'
import {createPreferenceDelta,parsePreference} from '../config/schema'
import {defaultColumnFilter,compileFilterGroup,collectFilterOptions,type FilterOption,type FilterGroup} from '../features/filters/model'
import {defaultPresentation,resolvePresentation,presentationDelta,type PresentationDelta} from '../features/presentation/model'
import {validateSettings,type SettingsCommit} from '../features/settings/session'
import {normalizePagination,clampPage} from './pagination'
import {withDeadline} from './deadline'
import {cloneData,getValue} from './value'
import {type FilterState} from './filter-state'
import {useQueryRuntime,type QueryChange} from './query'
import {getSettingsColumnFieldAccess,guardSettingsColumnPatch,guardSettingsCommit,resolveSettingsPolicy,type SettingsDefinition} from '../features/settings/policy'
import {compileConditionalRules,guardConditionalRules,readConditionalRules,type ConditionalFormattingDefinition,type ConditionalRule} from '../features/conditional-formatting/model'

export interface TableRuntimeInput<T extends RowData> {
  readonly tableKey?:string;readonly rowKey?:string;readonly columns:ColumnConfig<T>[];readonly data?:T[]
  readonly dataSource?:DataSource<T>;readonly pagination?:Partial<Pagination>;readonly config?:TableConfig|null
  readonly persistence?:Persistence|null;readonly preferenceTimeoutMs?:number;readonly selection?:boolean
  readonly presentation?:PresentationDelta;readonly density?:'compact'|'default'|'comfortable'
  readonly searchDefinition?:unknown;readonly searchAllowedItems?:readonly string[];readonly registry?:RuntimeRegistry<T>
  readonly settingsDefinition?:SettingsDefinition;readonly settingsOverride?:unknown
  readonly conditionalFormattingEnabled?:boolean;readonly conditionalFormattingDisabled?:boolean
  readonly conditionalFormattingDefinition?:ConditionalFormattingDefinition
}
export interface TableRuntimeEvents<T extends RowData> {
  queryChange?:(query:Query)=>void;configChange?:(config:TableConfig)=>void;viewChange?:(id:string|null)=>void
  selectionChange?:(rows:T[])=>void;diagnostic?:(diagnostic:ConfigDiagnostic)=>void
}
export type {QueryChange} from './query'
/** The same state and commands are consumed by the default table, custom UI and headless pages. */
export function useTableRuntime<T extends RowData>(input:TableRuntimeInput<T>,events:TableRuntimeEvents<T>={}){
  const key=()=>input.tableKey??'',rowKey=()=>input.rowKey??'id'
  const initial=normalizePagination({...input.pagination,pageSize:input.config?.pageSize??input.pagination?.pageSize})
  const rows=shallowRef<T[]>([]),total=ref(0),page=ref(initial.page),pageSize=ref(initial.pageSize)
  const busy=ref(false),error=ref('')
  const config=ref<TableConfig>(input.config?cloneData(input.config):makeConfig(key(),input.columns))
  const settingsPolicy=computed(()=>resolveSettingsPolicy(input.settingsDefinition,input.settingsOverride))
  const viewColumns=ref<Record<string,UserColumnConfig>>({}),viewPresentation=ref<PresentationDelta>()
  const viewConditionalFormatting=shallowRef<ConditionalRule[]>()
  let viewConditionalRevision=0
  const allowedPageSizes=computed(()=>normalizePagination(input.pagination).pageSizeOptions)
  const basePresentation=computed(()=>resolvePresentation(input.presentation,{...defaultPresentation(),appearance:{...defaultPresentation().appearance,density:input.density??'default',pageSize:normalizePagination(input.pagination).pageSize}}))
  const personalPresentation=computed(()=>resolvePresentation(config.value.presentation,basePresentation.value))
  const presentation=computed(()=>resolvePresentation(viewPresentation.value,personalPresentation.value))
  const personalColumns=computed(()=>mergeColumns(input.columns,config.value))
  const allResolvedColumns=computed(()=>applyColumnPatches(personalColumns.value,viewColumns.value))
  const resolvedColumns=computed(()=>allResolvedColumns.value.filter(column=>column.visible!==false))
  const conditionalRules=computed<readonly ConditionalRule[]>(()=>{
    if(input.conditionalFormattingEnabled!==true)return []
    let definition:ConditionalFormattingDefinition|undefined
    try{definition=input.conditionalFormattingDefinition}
    catch(cause){report({code:'SchemaValidationError',path:'conditionalFormatting',message:cause instanceof Error?cause.message:String(cause)});return []}
    const candidates:[()=>unknown,string][]=[
      [()=>viewConditionalFormatting.value,'view.conditionalFormatting'],
      [()=>config.value.conditionalFormatting,'preference.conditionalFormatting'],
      [()=>definition?.defaultRules,'definition.conditionalFormatting.defaultRules'],
    ]
    for(const [read,path] of candidates){
      try{
        const candidate=read()
        if(candidate===undefined)continue
        return guardConditionalRules(candidate,allResolvedColumns.value,definition?.allowedColumns)
      }
      catch(cause){report({code:'SchemaValidationError',path,message:cause instanceof Error?cause.message:String(cause)})}
    }
    return []
  })
  const compiledConditionalRules=computed(()=>compileConditionalRules(conditionalRules.value,allResolvedColumns.value))
  function conditionalRule(row:T):ConditionalRule|undefined{const matched=compiledConditionalRules.value(row);return matched?cloneData(matched):undefined}
  const pages=computed(()=>Math.max(1,Math.ceil(total.value/pageSize.value)))
  const jumpPage=ref(1),pageButtons=computed(()=>Array.from({length:Math.min(5,pages.value)},(_,index)=>Math.max(1,Math.min(page.value-2,pages.value-4))+index))
  const selected=shallowRef(new Map<string,T>())
  let selectionRequest=0,selectionController:AbortController|undefined
  let sequence=0,identity=0,ready=false,disposed=false,controller:AbortController|null=null,preferenceController=new AbortController(),writeQueue:Promise<void>=Promise.resolve()
  const extensionErrors=new Set<string>(),commitListeners=new Set<(before:TableConfig,after:TableConfig)=>void>()
  function report(diagnostic:ConfigDiagnostic){
    if(diagnostic.code==='RuntimeExtensionError'){const fingerprint=diagnostic.path+':'+diagnostic.message;if(extensionErrors.has(fingerprint))return;extensionErrors.add(fingerprint)}
    events.diagnostic?.(diagnostic)
  }
  const queryRuntime=useQueryRuntime({
    searchDefinition:()=>input.searchDefinition,
    searchAllowedItems:()=>input.searchAllowedItems,
    registry:()=>input.registry,
    columns:()=>allResolvedColumns.value,
    report,
  })
  const {keyword,searchDraft,filters,columnFilters,filterGroup,sorts,activeView}=queryRuntime
  const query=computed<Query>(()=>({page:page.value,pageSize:pageSize.value,...queryRuntime.query.value}))
  // Labels depend on the source and query criteria, never the current page.
  // Keep this an opaque identity so summary watchers do not traverse raw rows.
  const filterOptionsIdentity=computed(()=>markRaw({tableKey:key(),source:input.dataSource??input.data,query:queryRuntime.query.value}))
  let lastSearchSignature=''
  const reportConfigError=(cause:unknown)=>report({code:'RemoteConfigError',path:'preference',message:cause instanceof Error?cause.message:String(cause)})
  function rowId(row:RowData){return String(getValue(row,rowKey())??'')}
  function getSelectedRows():T[]{return [...selected.value.values()]}
  function cancelQuerySelection(){selectionRequest++;selectionController?.abort();selectionController=undefined}
  function clearSelection(){cancelQuerySelection();if(!selected.value.size)return;selected.value=new Map();events.selectionChange?.([])}
  function selectRow(row:T,checked:boolean){cancelQuerySelection();const next=new Map(selected.value);if(checked)next.set(rowId(row),row);else next.delete(rowId(row));selected.value=next;events.selectionChange?.(getSelectedRows())}
  function selectPage(checked:boolean){cancelQuerySelection();const next=new Map(selected.value);for(const row of rows.value){if(checked)next.set(rowId(row),row);else next.delete(rowId(row))}selected.value=next;events.selectionChange?.(getSelectedRows())}
  watch([query,()=>input.tableKey,()=>input.rowKey,()=>input.dataSource,()=>input.data,()=>input.selection],cancelQuerySelection,{flush:'sync'})
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
    result=applyFilters(result,[...request.filters,...(request.columnFilters??[])]).filter(compileFilterGroup(request.filterGroup))
    return applySorts(result,request.sorts,allResolvedColumns.value)
  }
  function validPage(request:Query,count:number){return clampPage(request.page,Math.max(1,Math.ceil(count/request.pageSize)))}
  async function load(snapshot?:Query):Promise<void>{
    if(!ready||disposed)return
    lastSearchSignature=queryRuntime.searchSignature.value
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
          await persistence.save(tableKey,{schemaVersion:1,tableKey,columns:delta.columns,...(delta.pagination?{pageSize:delta.pagination.pageSize}:{}),...(delta.presentation?{presentation:delta.presentation}:{}),...(delta.conditionalFormatting===undefined?{}:{conditionalFormatting:delta.conditionalFormatting})})
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
    for(const [id,change] of Object.entries(patches)){
      const column=input.columns.find(column=>column.id===id);if(!column)continue
      const guarded=input.settingsDefinition===undefined?guardColumnPatch(column,change,report):guardSettingsColumnPatch(column,change,settingsPolicy.value,report)
      if(Object.keys(guarded).length){accepted[id]=guarded;next=patchColumn(next,id,guarded)}
    }
    if(Object.values(accepted).some(change=>Object.hasOwn(change,'order'))){
      // Resolve saved positions first, then move editable columns only. Locked
      // positions remain anchors even when a caller submits one order change.
      const entries=allResolvedColumns.value.map((column,index)=>{
        const access=getSettingsColumnFieldAccess(column,'order',settingsPolicy.value)
        return {column,index,movable:input.settingsDefinition===undefined?isColumnCapabilityEnabled(column,'order'):access.visible&&!access.disabled}
      })
      const movable=entries.filter(entry=>entry.movable).sort((a,b)=>{
        const left=accepted[a.column.id]?.order,right=accepted[b.column.id]?.order
        return (left??a.index)-(right??b.index)||(left===undefined?1:0)-(right===undefined?1:0)||a.index-b.index
      })
      let offset=0
      for(const entry of entries){
        if(!entry.movable)continue
        const id=movable[offset++]!.column.id,change={...accepted[id],order:entry.index}
        accepted[id]=change;next=patchColumn(next,id,change)
      }
    }
    return {next,accepted}
  }
  async function applyPatches(patches:Record<string,UserColumnConfig>){
    let accepted:Record<string,UserColumnConfig>={}
    await saveConfig(current=>{const result=acceptPatches(current,patches);accepted=result.accepted;return result.next},()=>{for(const [id,patch] of Object.entries(accepted))releaseViewOverrides(id,patch)})
  }
  async function patch(id:string,change:UserColumnConfig){return applyPatches({[id]:change})}
  async function setQuery(change:QueryChange){
    queryRuntime.setQuery(change);page.value=1
    clearSelection();await load()
  }
  async function clearQuery(){
    queryRuntime.clearQuery();page.value=1
    clearSelection();await load()
  }
  async function setFilterState(next:FilterState){
    queryRuntime.setFilterState(next)
    page.value=1;clearSelection();await load()
  }
  async function setColumnFilters(next:FilterConfig[]){
    await setFilterState({columnFilters:next,filterGroup:filterGroup.value})
  }
  function search(){queryRuntime.commitSearch();page.value=1;clearSelection();void load()}
  function goPage(next:number){page.value=clampPage(next,pages.value);void load()}
  function changePageSize(){page.value=1;pageSize.value=normalizePagination({...input.pagination,pageSize:pageSize.value}).pageSize;void saveConfig(current=>({...current,pageSize:pageSize.value})).catch(()=>{});void load()}
  function sort(column:ColumnConfig){
    if(!column.sortable)return
    queryRuntime.sort(column)
    page.value=1;void load()
  }
  async function applySettings(change:SettingsCommit){
    const requested=cloneData(change)
    let committed=false,finish=()=>{}
    await saveConfig(current=>{
      // Recheck the complete transaction when its turn in the write queue starts.
      const guarded=guardSettingsCommit(requested,{columns:allResolvedColumns.value,sorts:sorts.value,presentation:presentation.value},settingsPolicy.value,report)
      if(!Object.keys(guarded.columns).length&&JSON.stringify(guarded.sorts)===JSON.stringify(sorts.value)&&JSON.stringify(guarded.presentation)===JSON.stringify(presentation.value))return current
      const result=acceptPatches(current,guarded.columns)
      const target=applyColumnPatches(allResolvedColumns.value,result.accepted,report),issues=validateSettings(target)
      if(issues.length)throw new Error(issues[0]!.message)
      const prepared=resolvePresentation(guarded.presentation,basePresentation.value)
      prepared.appearance.pageSize=normalizePagination({...input.pagination,pageSize:prepared.appearance.pageSize}).pageSize
      const changedSections=(['appearance','rowActions','toolbar'] as const).filter(key=>JSON.stringify(prepared[key])!==JSON.stringify(presentation.value[key]))
      const presentationChange:PresentationDelta=Object.fromEntries(changedSections.map(key=>[key,prepared[key]]))
      const pageSizeChanged=changedSections.includes('appearance')&&prepared.appearance.pageSize!==presentation.value.appearance.pageSize
      const nextSorts=cloneData(guarded.sorts).filter(sort=>target.some(column=>column.field===sort.field&&column.sortable))
      finish=()=>{
        for(const [id,patch] of Object.entries(result.accepted))releaseViewOverrides(id,patch)
        const remaining={...viewPresentation.value};for(const key of changedSections)delete remaining[key]
        viewPresentation.value=Object.keys(remaining).length?remaining:undefined;sorts.value=nextSorts;if(pageSizeChanged)pageSize.value=prepared.appearance.pageSize;page.value=1
        columnFilters.value=columnFilters.value.filter(rule=>{const column=target.find(column=>column.field===rule.field);return column&&defaultColumnFilter(column).enabled&&defaultColumnFilter(column).operators.includes(rule.operator)})
      }
      return {...result.next,...(pageSizeChanged?{pageSize:prepared.appearance.pageSize}:{}),presentation:presentationDelta(resolvePresentation(presentationChange,resolvePresentation(current.presentation,basePresentation.value)),basePresentation.value)}
    },()=>{committed=true;finish()})
    if(committed){clearSelection();await load()}
  }
  async function setPresentation(change:PresentationDelta){await applySettings({columns:{},sorts:sorts.value,presentation:resolvePresentation(change,presentation.value)})}
  async function setConditionalRules(rules:ConditionalRule[]):Promise<void>{
    const requested=readConditionalRules(rules)
    let revisionAtWrite=-1
    await saveConfig(current=>{
      if(input.conditionalFormattingEnabled!==true||input.conditionalFormattingDisabled===true){
        report({code:'FeatureDisabled',path:'conditionalFormatting',message:'条件标记当前不可编辑。'})
        throw new Error('条件标记当前不可编辑。')
      }
      let accepted:ConditionalRule[]
      try{accepted=guardConditionalRules(requested,allResolvedColumns.value,input.conditionalFormattingDefinition?.allowedColumns)}
      catch(cause){report({code:'CapabilityViolation',path:'conditionalFormatting',message:cause instanceof Error?cause.message:String(cause)});throw cause}
      revisionAtWrite=viewConditionalRevision
      return {...current,conditionalFormatting:accepted}
    },()=>{if(viewConditionalRevision===revisionAtWrite){viewConditionalFormatting.value=undefined;viewConditionalRevision++}})
  }
  async function applyView(view?:ViewConfig,searchKeyword?:string){
    queryRuntime.restoreView(view,searchKeyword)
    viewConditionalRevision++
    if(view?.isSystem){/* The base view clears queries, not the user's current layout. */}
    else {
      viewColumns.value=cloneData(view?.columns??{});viewPresentation.value=cloneData(view?.presentation)
      viewConditionalFormatting.value=undefined
      if(input.conditionalFormattingEnabled===true&&view?.conditionalFormatting!==undefined){
        try{viewConditionalFormatting.value=guardConditionalRules(view.conditionalFormatting,allResolvedColumns.value,input.conditionalFormattingDefinition?.allowedColumns)}
        catch(cause){report({code:'SchemaValidationError',path:'view.conditionalFormatting',message:cause instanceof Error?cause.message:String(cause)})}
      }
    }
    if(view?.pageSize!==undefined)pageSize.value=normalizePagination({...input.pagination,pageSize:view.pageSize}).pageSize
    else if(view?.presentation?.appearance?.pageSize!==undefined)pageSize.value=normalizePagination({...input.pagination,pageSize:view.presentation.appearance.pageSize}).pageSize
    else pageSize.value=normalizePagination({...input.pagination,pageSize:config.value.pageSize??input.pagination?.pageSize}).pageSize
    clearSelection();page.value=1;events.viewChange?.(activeView.value);await load()
  }
  function getState(){return {rows:[...rows.value],total:total.value,page:page.value,pageSize:pageSize.value,query:copyQuery(query.value),searchFilters:cloneData(filters.value),columnFilters:cloneData(columnFilters.value),columns:cloneData(allResolvedColumns.value),presentation:cloneData(presentation.value),conditionalFormatting:cloneData(conditionalRules.value),config:cloneData(config.value)}}
  function viewSnapshot():Omit<ViewConfig,'id'|'name'>{
    const columns=Object.fromEntries(allResolvedColumns.value.map((column,index)=>[column.id,{...cloneData(config.value.columns[column.id]??{}),...cloneData(viewColumns.value[column.id]??{}),visible:column.visible!==false,order:index,width:column.width,fixed:column.fixed??false,align:column.align,title:column.title,sortable:column.sortable,headerStyle:column.headerStyle,cellStyle:column.cellStyle,content:column.content,mapping:column.mapping,numberRule:column.numberRule,template:column.template,filter:column.filter}]))
    const display=presentationDelta(presentation.value,basePresentation.value)
    if(!presentation.value.toolbar.followView)delete display.toolbar
    return {columns,...queryRuntime.snapshot(),pageSize:pageSize.value,presentation:display,...(input.conditionalFormattingEnabled===true?{conditionalFormatting:readConditionalRules(conditionalRules.value)}:{})}
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
  async function selectQuery():Promise<void>{
    if(disposed||input.selection!==true)throw new Error('表格当前未启用选择。')
    cancelQuerySelection()
    const requestId=selectionRequest,epoch=identity,active=new AbortController()
    selectionController=active
    const current=()=>!disposed&&epoch===identity&&requestId===selectionRequest&&!active.signal.aborted&&input.selection===true
    try{
      const result=await readRows('query',active.signal)
      if(!current())return
      selected.value=new Map(result.map(row=>[rowId(row),row]))
      events.selectionChange?.(getSelectedRows())
    }catch(cause){if(current())throw cause}
    finally{if(selectionController===active)selectionController=undefined}
  }
  async function optionsFor(column:ColumnConfig,search='',signal?:AbortSignal,values?:readonly FilterOption['value'][]):Promise<FilterOption[]>{
    const resolved=allResolvedColumns.value.find(item=>item.id===column.id&&item.field===column.field)
    if(!resolved||!defaultColumnFilter(resolved).enabled)throw new Error('筛选字段已不可用。')
    column=resolved
    const settings=defaultColumnFilter(column)
    let result:FilterOption[]
    if(settings.source==='manual')result=cloneData(settings.options)
    else if(settings.source==='mapping')result=column.mapping?.items.map(item=>({value:item.value,label:item.label}))??column.valueMap?.map(item=>({value:item.value,label:item.label}))??[]
    else if(input.dataSource?.options)result=await input.dataSource.options(column as ColumnConfig<T>,copyQuery(query.value),{search,signal,...(values?{values:[...values]}:{})})
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
      if(stored){
        const next:TableConfig={schemaVersion:1,tableKey:key(),columns:stored.columns,pageSize:stored.pagination?.pageSize,...(stored.presentation?{presentation:stored.presentation}:{}),...(stored.conditionalFormatting===undefined?{}:{conditionalFormatting:stored.conditionalFormatting})}
        if(input.conditionalFormattingEnabled===true&&next.conditionalFormatting!==undefined){
          try{next.conditionalFormatting=guardConditionalRules(next.conditionalFormatting,applyColumnPatches(mergeColumns(input.columns,next),viewColumns.value),input.conditionalFormattingDefinition?.allowedColumns)}
          catch(cause){delete next.conditionalFormatting;report({code:'SchemaValidationError',path:'preference.conditionalFormatting',message:cause instanceof Error?cause.message:String(cause)})}
        }
        config.value=next;pageSize.value=normalizePagination({...input.pagination,pageSize:stored.pagination?.pageSize??input.pagination?.pageSize}).pageSize
      }
    }catch(cause){if(!disposed&&epoch===identity)reportConfigError(cause)}}
    if(disposed||epoch!==identity)return
    ready=true;void load()
  }
  function updatePageSize(next:number){
    if(pageSize.value!==next){pageSize.value=next;page.value=1;void load()}
  }
  watch(()=>input.config,()=>{
    config.value=input.config?cloneData(input.config):makeConfig(key(),input.columns)
    updatePageSize(normalizePagination({...input.pagination,pageSize:input.config?.pageSize??input.pagination?.pageSize}).pageSize)
  })
  // Inline pagination props may be recreated on every parent render. Only values
  // affect pagination; neither new arrays nor changed sizes replace saved settings.
  watch([()=>normalizePagination(input.pagination).pageSize,()=>normalizePagination(input.pagination).pageSizeOptions.join(',')],([next],[before])=>{
    updatePageSize(normalizePagination({...input.pagination,pageSize:next!==before?next:pageSize.value}).pageSize)
  })
  watch([()=>input.dataSource,()=>input.data],([source],[previous])=>{cancelQuerySelection();if(source!==previous)page.value=1;if(source!==previous||!source)void load()},{deep:true})
  watch(()=>queryRuntime.searchSignature.value,signature=>{
    if(!ready||disposed||signature===lastSearchSignature)return
    page.value=1;clearSelection();void load()
  },{flush:'post'})
  watch(()=>input.tableKey,()=>{config.value=input.config?cloneData(input.config):makeConfig(key(),input.columns);viewColumns.value={};viewPresentation.value=undefined;viewConditionalFormatting.value=undefined;viewConditionalRevision++;queryRuntime.clear();clearSelection();rows.value=[];total.value=0;page.value=1;pageSize.value=normalizePagination(input.pagination).pageSize;extensionErrors.clear();void initialize()})
  onMounted(initialize)
  onBeforeUnmount(()=>{disposed=true;identity++;sequence++;cancelQuerySelection();preferenceController.abort();controller?.abort();commitListeners.clear()})
  const commands={reload:()=>load(),setQuery,clearQuery,setColumnFilters,setFilterState,applyView,applySettings,setPresentation,setConditionalRules,patch,applyPatches,getState,viewSnapshot,getSelectedRows,clearSelection,selectRow,selectPage,selectQuery,goPage,readRows,optionsFor,sort}
  return {rows,total,page,pageSize,keyword,searchDraft,filters,columnFilters,filterGroup,sorts,activeView,busy,error,config,viewColumns,allResolvedColumns,resolvedColumns,query,filterOptionsIdentity,pages,jumpPage,pageButtons,selected,allSelected,someSelected,allowedPageSizes,presentation,basePresentation,conditionalRules,conditionalRule,settingsPolicy,report,rowId,load,search,searchContext:()=>queryRuntime.context(async()=>{page.value=1;clearSelection();await load()}),changePageSize,...commands,onCommit:(listener:(before:TableConfig,after:TableConfig)=>void)=>{commitListeners.add(listener);return ()=>commitListeners.delete(listener)}}
}
export type TableRuntime<T extends RowData=RowData>=ReturnType<typeof useTableRuntime<T>>
