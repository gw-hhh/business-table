<script setup lang="ts" generic="T extends RowData">
import{computed,onBeforeUnmount,onMounted,reactive,ref,shallowRef,toRaw,useSlots,watch,type ComponentPublicInstance,type VNodeChild}from'vue'
import type{Action,ColumnConfig,DataSource,FilterConfig,Pagination,Persistence,Query,RowData,SortConfig,TableConfig,UserColumnConfig,ViewConfig}from'./types'
import{applyFilters,applySorts,displayValue,getValue,makeConfig,mapStyle,mergeColumns,patchColumn}from'./core'
import {guardColumnPatch,applyColumnPatches} from './config/columns'
import {parsePreference} from './config/schema'
import {resolveFeatureGate,type TableFeatures} from './config/features'
import type {ConfigDiagnostic} from './config/diagnostics'
import FeatureHost from './components/FeatureHost.vue'
import CellRenderer from './components/CellRenderer'
import TableIcon from './components/TableIcon.vue'
import {columnTextCss as textStyle} from './components/settingsTypes'
import {useNarrowTable} from './presentation/useNarrowTable'
const props=withDefaults(defineProps<{tableKey?:string;rowKey?:string;title?:string;data?:T[];dataSource?:DataSource<T>;columns:ColumnConfig<T>[];pagination?:Partial<Pagination>;config?:TableConfig|null;views?:ViewConfig[];actions?:Action<T>[];persistence?:Persistence|null;loading?:boolean;features?:TableFeatures;remoteFeatures?:Record<string,unknown>;actionProvider?:(details:{label?:string;allowedItems?:string[]})=>Action<T>[];cellRenderer?:(value:unknown,row:RowData,column:ColumnConfig)=>VNodeChild;previewCell?:(value:unknown,row:RowData,column:ColumnConfig)=>VNodeChild;selection?:boolean;fill?:boolean;density?:'compact'|'default'|'comfortable'}>(),{tableKey:'',rowKey:'id',data:()=>[],persistence:null,config:null,density:'default'})
const emit=defineEmits<{queryChange:[Query];configChange:[TableConfig];viewChange:[string|null];diagnostic:[ConfigDiagnostic];selectionChange:[T[]]}>()
const slots=useSlots()
const tableElement=ref<HTMLElement>()
const narrow=useNarrowTable(tableElement)
const rows=ref<T[]>([]),total=ref(0),page=ref(props.pagination?.page??1),pageSize=ref(props.pagination?.pageSize??20),keyword=ref(''),sorts=ref<SortConfig[]>([]),filters=ref<FilterConfig[]>([]),activeView=ref<string|null>(null),busy=ref(false),error=ref('')
const config=ref<TableConfig>(props.config??makeConfig(props.tableKey,props.columns))
const viewColumns=ref<Record<string,UserColumnConfig>>({})
const personalColumns=computed(()=>mergeColumns(props.columns,config.value))
const allResolvedColumns=computed(()=>applyColumnPatches(personalColumns.value,viewColumns.value))
const resolvedColumns=computed(()=>allResolvedColumns.value.filter(c=>c.visible!==false))
const query=computed<Query>(()=>({page:page.value,pageSize:pageSize.value,sorts:sorts.value,filters:filters.value,keyword:keyword.value,viewId:activeView.value}))
const pages=computed(()=>Math.max(1,Math.ceil(total.value/pageSize.value)))
const jumpPage=ref(1)
const pageButtons=computed(()=>Array.from({length:Math.min(5,pages.value)},(_,index)=>Math.max(1,Math.min(page.value-2,pages.value-4))+index))
const selected=shallowRef(new Map<string,T>())
function getSelectedRows(){return [...selected.value.values()] as T[]}
function clearSelection(){if(!selected.value.size)return;selected.value=new Map();emit('selectionChange',[])}
function selectRow(row:T,checked:boolean){const next=new Map(selected.value);if(checked)next.set(rowId(row),row);else next.delete(rowId(row));selected.value=next;emit('selectionChange',getSelectedRows())}
function selectPage(checked:boolean){const next=new Map(selected.value);for(const row of rows.value as T[]){if(checked)next.set(rowId(row),row);else next.delete(rowId(row))}selected.value=next;emit('selectionChange',getSelectedRows())}
const allSelected=computed(()=>rows.value.length>0&&rows.value.every(row=>selected.value.has(rowId(row))))
const someSelected=computed(()=>!allSelected.value&&rows.value.some(row=>selected.value.has(rowId(row))))
watch(rows,current=>{
  if(!selected.value.size)return
  const fresh=new Map((current as T[]).map(row=>[rowId(row),row]))
  const available=!props.dataSource?new Set(props.data.map(rowId)):undefined
  const next=new Map(selected.value)
  let changed=false
  for(const [id,previous] of next){
    const row=fresh.get(id)
    if(total.value===0||(available&&!available.has(id))){next.delete(id);changed=true}
    else if(row&&row!==previous){next.set(id,row);changed=true}
  }
  if(changed){selected.value=next;emit('selectionChange',getSelectedRows())}
})
watch(()=>props.selection,enabled=>{if(!enabled)clearSelection()})
function rowId(row:RowData){return String(getValue(row,props.rowKey)??'')}
let requestSequence=0
let activeController:AbortController|null=null
let ready=false
let disposed=false
function unwrapQueryValue(value:unknown,seen=new WeakMap<object,unknown>()):unknown{
  if(value===null||typeof value!=='object')return value
  const raw=toRaw(value)
  if(seen.has(raw))return seen.get(raw)
  if(raw instanceof Map){
    const result=new Map<unknown,unknown>()
    seen.set(raw,result)
    for(const [key,item] of raw)result.set(unwrapQueryValue(key,seen),unwrapQueryValue(item,seen))
    return result
  }
  if(raw instanceof Set){
    const result=new Set<unknown>()
    seen.set(raw,result)
    for(const item of raw)result.add(unwrapQueryValue(item,seen))
    return result
  }
  if(Array.isArray(raw)||Object.prototype.toString.call(raw)==='[object Object]'){
    const result=Array.isArray(raw)?new Array(raw.length):{}
    seen.set(raw,result)
    for(const [key,item] of Object.entries(raw)){
      Object.defineProperty(result,key,{value:unwrapQueryValue(item,seen),enumerable:true,writable:true,configurable:true})
    }
    return result
  }
  return raw
}
function copyQuery(source:Query):Query{
  return {...source,sorts:source.sorts.map(s=>({...s})),filters:source.filters.map(f=>({...f,value:structuredClone(unwrapQueryValue(f.value))}))}
}
function validPage(request:Query,count:number){return Math.max(1,Math.min(request.page,Math.ceil(count/request.pageSize)))}
async function load(snapshot?:Query){
  if(!ready||disposed)return
  const sequence=++requestSequence
  activeController?.abort()
  const controller=new AbortController()
  activeController=controller
  const isCurrent=()=>!disposed&&sequence===requestSequence&&!controller.signal.aborted
  busy.value=true
  error.value=''
  try{
    const request=copyQuery(snapshot??query.value)
    emit('queryChange',copyQuery(request))
    if(props.dataSource){
      const result=await props.dataSource.query({...copyQuery(request),signal:controller.signal})
      if(!isCurrent())return
      const correctedPage=validPage(request,result.total)
      if(correctedPage!==request.page){
        page.value=correctedPage
        void load({...request,page:correctedPage})
        return
      }
      rows.value=result.rows
      total.value=result.total
    }else{
      let result=[...(props.data??[])]
      if(request.keyword){
        const keyword=request.keyword.toLowerCase()
        result=result.filter(row=>resolvedColumns.value.some(column=>String(getValue(row,column.field)??'').toLowerCase().includes(keyword)))
      }
      result=applySorts(applyFilters(result,request.filters),request.sorts)
      total.value=result.length
      page.value=validPage(request,result.length)
      rows.value=result.slice((page.value-1)*request.pageSize,page.value*request.pageSize)
    }
  }catch(cause){
    if(isCurrent())error.value=cause instanceof Error?cause.message:String(cause)
  }finally{
    if(isCurrent()){
      busy.value=false
      activeController=null
    }
  }
}
function search(){clearSelection();page.value=1;void load()}
function goPage(next:number){page.value=Math.max(1,Math.min(next,pages.value));void load()}
function changePageSize(){page.value=1;void saveConfig({...config.value,pageSize:pageSize.value});void load()}
const extensionErrors=new Set<string>()
function report(diagnostic:ConfigDiagnostic){
  if(diagnostic.code==='RuntimeExtensionError'){
    const key=diagnostic.path+':'+diagnostic.message
    if(extensionErrors.has(key))return
    extensionErrors.add(key)
  }
  emit('diagnostic',diagnostic)
}
function reportConfigError(cause:unknown){report({code:'RemoteConfigError',path:'preference',message:cause instanceof Error?cause.message:String(cause)})}
async function saveConfig(next:TableConfig){
  config.value=next;emit('configChange',next)
  try{if(props.persistence)await props.persistence.save(props.tableKey,next)}catch(cause){reportConfigError(cause)}
}
function releaseViewOverrides(id:string,change:UserColumnConfig){
  if(!Object.hasOwn(viewColumns.value,id))return
  const columns={...viewColumns.value},patch={...columns[id]}
  for(const key of Object.keys(change) as (keyof UserColumnConfig)[])delete patch[key]
  if(Object.keys(patch).length)columns[id]=patch;else delete columns[id]
  viewColumns.value=columns
}
async function patch(id:string,change:UserColumnConfig){
  const column=props.columns.find(item=>item.id===id)
  if(!column)return
  const guarded=guardColumnPatch(column,change,report)
  if(Object.keys(guarded).length){releaseViewOverrides(id,guarded);await saveConfig(patchColumn(config.value,id,guarded))}
}
async function applyPatches(patches:Record<string,UserColumnConfig>){
  let next=config.value
  for(const [id,change] of Object.entries(patches)){
    const column=props.columns.find(item=>item.id===id)
    if(!column)continue
    const guarded=guardColumnPatch(column,change,report)
    if(Object.keys(guarded).length){releaseViewOverrides(id,guarded);next=patchColumn(next,id,guarded)}
  }
  if(next!==config.value)await saveConfig(next)
}
async function setQuery(change:Partial<Pick<Query,'keyword'|'filters'|'sorts'|'viewId'>>){
  const snapshot=copyQuery({...query.value,...change,page:1})
  keyword.value=snapshot.keyword??'';filters.value=snapshot.filters;sorts.value=snapshot.sorts;activeView.value=snapshot.viewId??null;page.value=1
  clearSelection()
  await load(snapshot)
}
function getState(){return {rows:[...rows.value] as T[],total:total.value,page:page.value,pageSize:pageSize.value,query:copyQuery(query.value),columns:allResolvedColumns.value.map(column=>({...column}))}}
function sort(column:ColumnConfig){if(!column.sortable)return;const old=sorts.value.find(s=>s.field===column.field);sorts.value=old?[{field:column.field,order:old.order==='asc'?'desc':'asc'}]:[{field:column.field,order:'asc'}];page.value=1;void load()}
function applyView(view?:ViewConfig,searchKeyword?:string){activeView.value=view?.id??null;filters.value=view?.filters??[];sorts.value=view?.sorts??[];viewColumns.value=view?.columns??{};if(searchKeyword!==undefined)keyword.value=searchKeyword;clearSelection();page.value=1;emit('viewChange',activeView.value);return load()}
type FeatureName=keyof TableFeatures
const declarations=computed(()=>({
  title:props.features?.title??(props.title!==undefined),
  search:props.features?.search??false,
  views:props.features?.views??(props.views!==undefined),
  toolbar:props.features?.toolbar??false,
  columnSettings:props.features?.columnSettings??false,
  rowActions:props.features?.rowActions??(props.actions!==undefined),
}))
function gate(name:FeatureName){return resolveFeatureGate(declarations.value[name],props.remoteFeatures?.[name],name==='columnSettings'?'on-interaction':name==='views'?'after-definition':'eager')}
const showHeader=computed(()=>(['title','search','views','toolbar','columnSettings'] as const).some(name=>{const value=gate(name);return value.enabled&&value.mode!=='headless'}))
const hasHeaderFeatures=computed(()=>(['title','search','views','toolbar','columnSettings'] as const).some(name=>gate(name).enabled))
const hosts=new Map<FeatureName,{activate:()=>Promise<object|undefined>;getContext:()=>object|undefined}>()
function setHost(name:FeatureName,value:Element|ComponentPublicInstance|null){if(value)hosts.set(name,value as unknown as ReturnType<typeof hosts.get> & {});else hosts.delete(name)}
function titleContext(details:{label?:string}){return reactive({get label(){return details.label??props.title??'数据列表'},get total(){return total.value}})}
function searchContext(){const context=reactive({draft:keyword.value,submit(){keyword.value=context.draft;search()}});return context}
function viewsContext(){return reactive({get views(){return props.views??[]},get activeId(){return activeView.value},apply(id:string){applyView(props.views?.find(view=>view.id===id))}})}
function toolbarContext(){return {refresh:()=>void load()}}
function columnSettingsContext(_details:unknown,controls:{close:()=>void;isActive:()=>boolean}){return reactive({openMode:'quick' as 'quick'|'drawer',get columns(){return allResolvedColumns.value.map(column=>({...column,visible:column.visible??true,fixed:column.fixed??false}))},get baseColumns(){return props.columns},get previewRows(){return rows.value as RowData[]},get previewCell(){return props.previewCell},get sorts(){return sorts.value.map(sort=>({...sort}))},setSorts:(next:SortConfig[])=>controls.isActive()?setQuery({sorts:next}):Promise.resolve(),patch:(id:string,change:UserColumnConfig)=>controls.isActive()?patch(id,change):Promise.resolve(),apply:(changes:Record<string,UserColumnConfig>)=>controls.isActive()?applyPatches(changes):Promise.resolve(),close:controls.close})}
async function openColumnSettings(mode:'quick'|'drawer'='quick'){
  const context=await hosts.get('columnSettings')?.activate() as ReturnType<typeof columnSettingsContext>|undefined
  if(context)context.openMode=mode
}
function resetSettingsEntry(){
  const context=hosts.get('columnSettings')?.getContext() as ReturnType<typeof columnSettingsContext>|undefined
  if(context)context.openMode='quick'
}
function rowActionsContext(details:{allowedItems?:string[]}){
  return reactive({get fixed(){return narrow.value?false:'right' as const},get actions(){return props.actionProvider?.(details)??props.actions??[]},rowId,reportError(cause:unknown){report({code:'RuntimeExtensionError',path:'rowActions',message:cause instanceof Error?cause.message:String(cause)})}})
}
defineExpose({reload:()=>load(),setQuery,applyView,getState,getSelectedRows,clearSelection,openColumnSettings,activateFeature:(name:FeatureName)=>hosts.get(name)?.activate(),getFeatureContext:(name:FeatureName)=>hosts.get(name)?.getContext()})
watch([()=>props.config,()=>props.pagination?.pageSize,()=>props.pagination?.pageSizeOptions],()=>{
  config.value=props.config??makeConfig(props.tableKey,props.columns)
  const options=props.pagination?.pageSizeOptions??[10,20,50,100]
  const requested=props.config?.pageSize??props.pagination?.pageSize??20
  const nextSize=Number.isInteger(requested)&&requested>0&&options.includes(requested)?requested:options[0]??20
  if(pageSize.value!==nextSize){pageSize.value=nextSize;page.value=1;void load()}
})
watch([()=>props.dataSource,()=>props.data],([source],[previousSource])=>{
  if(source!==previousSource)page.value=1
  if(source!==previousSource||!source)void load()
},{deep:true})
onMounted(async()=>{
  if(props.persistence){
    try{
      const stored=parsePreference(await props.persistence.load(props.tableKey),props.tableKey,report)
      if(disposed)return
      if(stored){config.value={schemaVersion:1,tableKey:props.tableKey,columns:stored.columns,pageSize:stored.pagination?.pageSize};if(stored.pagination?.pageSize)pageSize.value=stored.pagination.pageSize}
    }catch(cause){reportConfigError(cause)}
  }
  if(disposed)return
  ready=true
  void load()
})
onBeforeUnmount(()=>{disposed=true;requestSequence++;activeController?.abort()})
</script>
<template>
<section ref="tableElement" class="bt" :class="{'bt--narrow':narrow,'bt--fill':fill,['bt--'+density]:true}" data-business-table :aria-busy="Boolean(loading||busy)">
  <div v-if="error" class="bt__error" role="alert">{{error}}</div>
  <slot name="before"/>
  <header v-if="hasHeaderFeatures||slots['toolbar-start']||slots['toolbar-end']" :class="{'bt__bar':showHeader||slots['toolbar-start']||slots['toolbar-end']}" :style="!showHeader&&!slots['toolbar-start']&&!slots['toolbar-end']?{display:'contents'}:undefined">
    <slot name="toolbar-start" :total="total" :rows="rows"/>
    <FeatureHost v-if="gate('title').enabled" :ref="value=>setHost('title',value)" :local="declarations.title" :remote="remoteFeatures?.title" :create-context="titleContext" :loader="()=>import('./components/TableTitle.vue')" @diagnostic="report"><template #custom="{context}"><slot name="title" :context="context"/></template></FeatureHost>
    <div class="bt__tools">
      <slot name="toolbar-end"/>
      <FeatureHost v-if="gate('search').enabled" :ref="value=>setHost('search',value)" :local="declarations.search" :remote="remoteFeatures?.search" :create-context="searchContext" :loader="()=>import('./components/TableSearch.vue')" @diagnostic="report"><template #custom="{context}"><slot name="search" :context="context"/></template></FeatureHost>
      <FeatureHost v-if="gate('views').enabled" :ref="value=>setHost('views',value)" :local="declarations.views" :remote="remoteFeatures?.views" default-strategy="after-definition" :create-context="viewsContext" :loader="()=>import('./components/ViewSwitcher.vue')" @diagnostic="report"><template #custom="{context}"><slot name="views" :context="context"/></template></FeatureHost>
      <FeatureHost v-if="gate('columnSettings').enabled" :ref="value=>setHost('columnSettings',value)" :local="declarations.columnSettings" :remote="remoteFeatures?.columnSettings" default-strategy="on-interaction" entry-label="列设置" entry-icon="columns" test-id="column-settings" @entry="resetSettingsEntry" :create-context="columnSettingsContext" :loader="()=>import('./components/ColumnSettings.vue')" @diagnostic="report"><template #custom="{context}"><slot name="column-settings" :context="context"/></template></FeatureHost>
      <button v-if="gate('columnSettings').enabled&&gate('columnSettings').mode==='default'" class="bt__settings-trigger" data-testid="table-settings" @click="openColumnSettings('drawer')"><TableIcon name="settings"/>表格设置</button>
      <FeatureHost v-if="gate('toolbar').enabled" :ref="value=>setHost('toolbar',value)" :local="declarations.toolbar" :remote="remoteFeatures?.toolbar" :create-context="toolbarContext" :loader="()=>import('./components/TableToolbar.vue')" @diagnostic="report"><template #custom="{context}"><slot name="toolbar" :context="context"/></template></FeatureHost>
      <slot name="toolbar-after"/>
    </div>
  </header>
  <slot name="after-toolbar"/>
  <div class="bt__viewport">
  <vxe-table :data="rows" :loading="loading||busy" :border="false" :row-config="{isHover:true,keyField:rowKey}">
    <template #loading><div v-if="loading||busy" class="bt__loading" role="status" aria-label="加载中">加载中…</div></template>
    <vxe-column v-if="selection" width="42" :fixed="narrow?undefined:'left'" class-name="bt__select-cell">
      <template #header><input type="checkbox" aria-label="选择当前页" :checked="allSelected" :indeterminate="someSelected" @change="event=>selectPage((event.target as HTMLInputElement).checked)"></template>
      <template #default="{row}"><input type="checkbox" :aria-label="'选择 '+rowId(row)" :checked="selected.has(rowId(row))" @change="event=>selectRow(row,(event.target as HTMLInputElement).checked)"></template>
    </vxe-column>
    <vxe-column v-for="c in resolvedColumns" :key="c.id" :field="c.field" :title="c.title" :width="c.width" :min-width="c.minWidth??120" :fixed="narrow?undefined:c.fixed||undefined" :align="c.align??'left'" :header-align="c.headerStyle?.align??c.align??'left'" :sortable="false">
      <template #header><button v-if="c.sortable" class="bt__sort" :class="{'is-sorted':sorts[0]?.field===c.field}" :style="textStyle(c.headerStyle)" @click="sort(c)"><span>{{c.title}}</span><span class="bt__sort-mark">{{sorts[0]?.field===c.field?(sorts[0]?.order==='asc'?'↑':'↓'):'↑↓'}}</span></button><span v-else :style="textStyle(c.headerStyle)">{{c.title}}</span></template>
      <template #default="{row}"><div class="bt__cell-content" :style="textStyle(c.cellStyle)"><slot name="cell" :row="row" :column="c" :value="getValue(row,c.field)" :text="displayValue(getValue(row,c.field),c)"><CellRenderer v-if="cellRenderer&&c.renderer" :value="getValue(row,c.field)" :row="row" :column="c" :renderer="cellRenderer" @diagnostic="report"/><span v-else-if="c.valueMap" class="bt-tag" :style="{color:mapStyle(getValue(row,c.field),c.valueMap)?.color,background:mapStyle(getValue(row,c.field),c.valueMap)?.background}">{{displayValue(getValue(row,c.field),c)}}</span><span v-else>{{displayValue(getValue(row,c.field),c)}}</span></slot></div></template>
    </vxe-column>
    <FeatureHost v-if="gate('rowActions').enabled" :ref="value=>setHost('rowActions',value)" :local="declarations.rowActions" :remote="remoteFeatures?.rowActions" :create-context="rowActionsContext" :loader="()=>import('./components/RowActions.vue')" @diagnostic="report"><template #custom="{context}"><slot name="row-actions" :context="context"/></template></FeatureHost>
    <template #empty><div class="bt__empty">暂无数据</div></template>
  </vxe-table>
  </div>
  <footer class="bt__footer"><slot name="summary" :total="total" :rows="rows" :page="page" :page-size="pageSize"><span>共 {{total}} 条，第 {{page}} / {{pages}} 页</span></slot><div class="bt__pages"><select v-model.number="pageSize" aria-label="每页条数" @change="changePageSize"><option v-for="n in pagination?.pageSizeOptions??[10,20,50,100]" :key="n" :value="n">{{n}} 条 / 页</option></select><button :class="{'bt__page-arrow':fill}" aria-label="上一页" :disabled="page<=1" @click="goPage(page-1)"><TableIcon v-if="fill" name="chevron-left"/><template v-else>上一页</template></button><template v-if="fill"><button v-for="n in pageButtons" :key="n" :class="{'is-current':n===page}" :aria-current="n===page?'page':undefined" :aria-label="'第 '+n+' 页'" @click="goPage(n)">{{n}}</button></template><button :class="{'bt__page-arrow':fill}" aria-label="下一页" :disabled="page>=pages" @click="goPage(page+1)"><TableIcon v-if="fill" name="chevron-right"/><template v-else>下一页</template></button><label v-if="fill" class="bt__jump">前往 <input v-model.number="jumpPage" type="number" min="1" :max="pages" aria-label="跳转页码" @keyup.enter="goPage(jumpPage)"><button class="bt__link" @click="goPage(jumpPage)">跳转</button></label></div></footer>
</section>
</template>
