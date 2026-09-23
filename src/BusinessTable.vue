<script setup lang="ts" generic="T extends RowData">
import{computed,defineAsyncComponent,reactive,ref,shallowReactive,useSlots,type ComponentPublicInstance,type VNodeChild}from'vue'
import type{Action,ColumnConfig,DataSource,Pagination,Persistence,Query,RowData,SortConfig,TableConfig,UserColumnConfig,ViewConfig}from'./types'
import{displayValue,getValue}from'./core'
import {readFeatureDetails,resolveFeatureGate,featureEntryVisible,type TableFeatures} from './config/features'
import type {ConfigDiagnostic} from './config/diagnostics'
import FeatureHost from './components/FeatureHost.vue'
import CellRenderer from './components/CellRenderer'
import TableIcon from './components/TableIcon.vue'
import {columnTextCss as textStyle} from './components/settingsTypes'
import {useNarrowTable} from './presentation/useNarrowTable'
import {useTableViewport,scrollViewportByKey} from './presentation/useTableViewport'
import {resolveColumnLayout} from './presentation/columnLayout'
import {useTableRuntime} from './runtime/useTableRuntime'
import type {RuntimeRegistry} from './runtime/registry'
import type {PresentationDelta,ToolDefinition} from './features/presentation/model'
import type {SettingsCommit} from './features/settings/session'
import {guardSettingsColumnPatch,resolveSettingsPolicy,type SettingsDefinition} from './features/settings/policy'
import BusinessCell from './components/BusinessCell.vue'
import ColumnHeader from './features/columns/ColumnHeader.vue'
import type {ColumnHeaderContext} from './features/columns/header'
import {getSettingsColumnFieldAccess} from './features/settings/policy'
import {cloneData} from './runtime/value'
import {fontFamilyCss} from './config/font-families'
import type {FilterPlanPersistence} from './features/filters/plans'
import type {FiltersContext} from './features/filters/context'
import {defaultColumnFilter} from './features/filters/model'
const FilterChips=defineAsyncComponent(()=>import('./features/filters/FilterChips.vue'))
const defaultSearchDefinition={items:[{id:'keyword',label:'关键词',kind:'keyword',defaultValue:''}]}
const tableElement=ref<HTMLElement>()
const viewportElement=ref<HTMLElement>()
const gridElement=ref<{recalculate:(full?:boolean)=>Promise<void>}>()
function recalculateGrid(){
  void gridElement.value?.recalculate(true).catch(cause=>{error.value=cause instanceof Error?cause.message:String(cause)})
}
const narrow=useNarrowTable(tableElement,recalculateGrid)
const viewportSize=useTableViewport(viewportElement,recalculateGrid,()=>viewportElement.value?.querySelector<HTMLElement>('.vxe-table--main-wrapper .vxe-table--header-wrapper')??undefined)
const props=withDefaults(defineProps<{settingsDefinition?:SettingsDefinition;settingsOverride?:unknown;filterPlanPersistence?:FilterPlanPersistence|null;presentation?:PresentationDelta;tools?:{page:readonly ToolDefinition[];table:readonly ToolDefinition[]};tableKey?:string;rowKey?:string;title?:string;data?:T[];dataSource?:DataSource<T>;columns:ColumnConfig<T>[];pagination?:Partial<Pagination>;config?:TableConfig|null;views?:ViewConfig[];actions?:Action<T>[];persistence?:Persistence|null;preferenceTimeoutMs?:number;loading?:boolean;features?:TableFeatures;remoteFeatures?:Record<string,unknown>;searchDefinition?:unknown;registry?:RuntimeRegistry<T>;actionProvider?:(details:{label?:string;allowedItems?:string[]})=>Action<T>[];cellRenderer?:(value:unknown,row:RowData,column:ColumnConfig)=>VNodeChild;previewCell?:(value:unknown,row:RowData,column:ColumnConfig)=>VNodeChild;selection?:boolean;fill?:boolean;density?:'compact'|'default'|'comfortable'}>(),{tableKey:'',rowKey:'id',data:()=>[],persistence:null,config:null,density:'default',preferenceTimeoutMs:3000})
const emit=defineEmits<{queryChange:[Query];configChange:[TableConfig];viewChange:[string|null];diagnostic:[ConfigDiagnostic];selectionChange:[T[]];cellAction:[{action:'open'|'copy';row:T;column:ColumnConfig<T>}]}>()
const slots=useSlots()
type FeatureName=keyof TableFeatures
const declarations=computed(()=>({
  title:props.features?.title??(props.title!==undefined),
  search:props.features?.search??false,
  views:props.features?.views??(props.views!==undefined),
  toolbar:props.features?.toolbar??false,
  filters:props.features?.filters??false,
  columnSettings:props.features?.columnSettings??false,
  rowActions:props.features?.rowActions??(props.actions!==undefined),
}))
function gate(name:FeatureName){const result=resolveFeatureGate(declarations.value[name],props.remoteFeatures?.[name],(name==='columnSettings'||name==='filters')?'on-interaction':name==='views'?'after-definition':'eager');if(name==='columnSettings'&&result.enabled&&!Object.values(resolveSettingsPolicy(props.settingsDefinition,props.settingsOverride).pages).some(page=>page.visible))return {...result,enabled:false};return result}
const sourceColumns=computed<ColumnConfig<T>[]>(()=>{
  if(!gate('rowActions').enabled||props.columns.some(column=>column.kind==='actions'))return props.columns
  return [...props.columns,{id:'$actions',field:'$actions',kind:'actions',title:'操作',width:196,minWidth:112,fixed:'right',sortable:false,configurable:{visible:true,order:false,rename:true,width:{enabled:true,min:112,max:640},fixed:true,align:true,sortable:false,headerStyle:true,cellStyle:true,content:true,filter:false,mapping:false,format:false,template:false}}]
})
const runtime=useTableRuntime<T>({
  get tableKey(){return props.tableKey},get rowKey(){return props.rowKey},get columns(){return sourceColumns.value},get data(){return props.data},get dataSource(){return props.dataSource},get pagination(){return props.pagination},get config(){return props.config},get persistence(){return props.persistence},get preferenceTimeoutMs(){return props.preferenceTimeoutMs},get selection(){return props.selection},get density(){return props.density},get presentation(){return props.presentation},
  get searchDefinition(){return gate('search').enabled?props.searchDefinition??defaultSearchDefinition:undefined},
  get searchAllowedItems(){
    if(!gate('search').enabled)return undefined
    const definition=props.searchDefinition??defaultSearchDefinition
    const items=typeof definition==='object'&&definition!==null&&'items' in definition?(definition as {items:unknown}).items:undefined
    const ids=Array.isArray(items)?items.flatMap(item=>item&&typeof item==='object'&&typeof item.id==='string'?[item.id]:[]):[]
    return readFeatureDetails(declarations.value.search,props.remoteFeatures?.search,diagnostic=>emit('diagnostic',diagnostic),ids).allowedItems
  },
  get registry(){return props.registry},
  // An explicitly closed declaration stays explicit, so Core commands cannot
  // regain the legacy unrestricted path when the feature is turned off.
  get settingsDefinition(){return gate('columnSettings').enabled?props.settingsDefinition:props.settingsDefinition===undefined?undefined:{}},
  get settingsOverride(){return gate('columnSettings').enabled?props.settingsOverride:undefined},
},{queryChange:query=>emit('queryChange',query),configChange:config=>emit('configChange',config),viewChange:id=>emit('viewChange',id),selectionChange:rows=>emit('selectionChange',rows),diagnostic:diagnostic=>emit('diagnostic',diagnostic)})
const {rows,total,page,pageSize,sorts,columnFilters,filterGroup,activeView,busy,error,config,allResolvedColumns,resolvedColumns,query,pages,jumpPage,pageButtons,selected,allSelected,someSelected,allowedPageSizes,presentation,basePresentation,report,rowId,load,changePageSize,getState,getSelectedRows,clearSelection,selectRow,selectPage,setQuery,goPage,sort,applyView,patch,applyPatches,applySettings,setPresentation,setColumnFilters,setFilterState}=runtime
const dataColumns=computed(()=>resolvedColumns.value.filter(column=>column.kind!=='actions'))
const actionColumn=computed(()=>allResolvedColumns.value.find(column=>column.kind==='actions'))
const tableStyle=computed(()=>({'--bt-font':fontFamilyCss(presentation.value.appearance.fontFamily),'--bt-body-size':presentation.value.appearance.fontSize+'px','--bt-header-size':presentation.value.appearance.headerFontSize+'px','--bt-body-color':presentation.value.appearance.color,'--bt-header-color':presentation.value.appearance.headerColor}))
async function cellAction(action:'open'|'copy',row:T,column:ColumnConfig<T>){
  if(action==='copy'){try{await navigator.clipboard.writeText(String(getValue(row,column.field)??''))}catch{error.value='浏览器未允许复制，请手动选择内容复制。'}}
  emit('cellAction',{action,row,column})
}
const showHeader=computed(()=>(['title','search','views','toolbar','columnSettings','filters'] as const).some(name=>{const value=gate(name);return value.enabled&&value.mode!=='headless'}))
const hasHeaderFeatures=computed(()=>(['title','search','views','toolbar','columnSettings','filters'] as const).some(name=>gate(name).enabled))
const hosts=shallowReactive(new Map<FeatureName,{activate:()=>Promise<object|undefined>;getContext:()=>object|undefined}>())
function setHost(name:FeatureName,value:Element|ComponentPublicInstance|null){if(value)hosts.set(name,value as unknown as ReturnType<typeof hosts.get> & {});else hosts.delete(name)}
function titleContext(details:{label?:string}){return reactive({get label(){return details.label??props.title??'数据列表'},get total(){return total.value}})}
function searchContext(){return runtime.searchContext()}
function viewsContext(){return reactive({get views(){return props.views??[]},get activeId(){return activeView.value},apply(id:string){applyView(props.views?.find(view=>view.id===id))}})}
const tableTools=computed<readonly ToolDefinition[]>(()=>props.tools?.table??(gate('toolbar').enabled?[{id:'refresh',label:'刷新',icon:'refresh',handler:()=>load()}]:[]))
function toolbarContext(){return reactive({get tools(){return tableTools.value},get layout(){return presentation.value.toolbar.table},get gap(){return presentation.value.toolbar.gap},refresh:()=>void load()})}
let pendingFilterColumn:string|undefined
async function filtersContext(details:{allowedItems?:string[]},controls:{close:()=>void;isActive:()=>boolean}){
  const {createFiltersContext}=await import('./features/filters/context')
  return createFiltersContext(runtime,{tableKey:props.tableKey,columnId:pendingFilterColumn,allowedItems:details.allowedItems,persistence:props.filterPlanPersistence},controls)
}
async function openFilters(columnId?:string){
  pendingFilterColumn=columnId
  const context=hosts.get('filters')?.getContext() as FiltersContext|undefined
  if(context){context.columnId=columnId;context.revision++}
  await hosts.get('filters')?.activate()
}
function resetFilterEntry(){pendingFilterColumn=undefined;const context=hosts.get('filters')?.getContext() as FiltersContext|undefined;if(context){context.columnId=undefined;context.revision++}}
async function clearFilter(field?:string){
  if(!gate('filters').enabled)return
  try{await setFilterState({columnFilters:field?columnFilters.value.filter(rule=>rule.field!==field):columnFilters.value,filterGroup:field?filterGroup.value:undefined})}
  catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}

function configuredActions(){return gate('rowActions').enabled?props.actionProvider?.(readFeatureDetails(declarations.value.rowActions,props.remoteFeatures?.rowActions,report))??props.actions??[]:[]}
const settingsEntryLabel=computed(()=>runtime.settingsPolicy.value.pages.columns.visible?'列设置':gate('columnSettings').mode==='custom'?'表格设置':undefined)
function settingsPatches(changes:Record<string,UserColumnConfig>){return Object.fromEntries(Object.entries(changes).flatMap(([id,change])=>{const column=allResolvedColumns.value.find(column=>column.id===id);if(!column)return [];const accepted=guardSettingsColumnPatch(column,change,runtime.settingsPolicy.value,report);return Object.keys(accepted).length?[[id,accepted]]:[]}))}
function columnSettingsContext(_details:unknown,controls:{close:()=>void;isActive:()=>boolean}){return reactive({
  openMode:'quick' as 'quick'|'drawer',initialTab:'columns' as 'columns'|'sorts'|'actions'|'appearance'|'toolbar',selectedColumnId:undefined as string|undefined,
  get tableKey(){return props.tableKey},get settingsPolicy(){return runtime.settingsPolicy.value},get columns(){return cloneData(allResolvedColumns.value.map(column=>({...column,visible:column.visible??true,fixed:column.fixed??false})))},get baseColumns(){return sourceColumns.value},get presentation(){return presentation.value},get basePresentation(){return basePresentation.value},get actions(){return configuredActions() as Action<RowData>[]},get tools(){return {page:props.tools?.page??[],table:tableTools.value}},get pageSizeOptions(){return allowedPageSizes.value},
  get previewRows(){return rows.value as RowData[]},get previewCell(){return props.previewCell},get sorts(){return cloneData(sorts.value)},
  setSorts:(next:SortConfig[])=>controls.isActive()&&runtime.settingsPolicy.value.pages.sorts.visible&&!runtime.settingsPolicy.value.pages.sorts.disabled?setQuery({sorts:next}):Promise.resolve(),patch:(id:string,change:UserColumnConfig)=>controls.isActive()?applyPatches(settingsPatches({[id]:change})):Promise.resolve(),apply:(changes:Record<string,UserColumnConfig>)=>controls.isActive()?applyPatches(settingsPatches(changes)):Promise.resolve(),
  commit:(change:SettingsCommit)=>controls.isActive()?applySettings(change):Promise.reject(new Error('设置已失效，请重新打开。')),close:controls.close,
})}
async function openColumnSettings(mode:'quick'|'drawer'='quick',columnId?:string,tab:'columns'|'sorts'|'actions'|'appearance'|'toolbar'='columns'){
  const context=await hosts.get('columnSettings')?.activate() as ReturnType<typeof columnSettingsContext>|undefined
  if(context){context.openMode=mode==='quick'&&!runtime.settingsPolicy.value.pages.columns.visible?'drawer':mode;context.selectedColumnId=columnId;context.initialTab=tab}
}
function resetSettingsEntry(){
  const context=hosts.get('columnSettings')?.getContext() as ReturnType<typeof columnSettingsContext>|undefined
  if(context){context.openMode=runtime.settingsPolicy.value.pages.columns.visible?'quick':'drawer';context.initialTab='columns';context.selectedColumnId=undefined}
}
function columnHeaderContext(column:ColumnConfig):ColumnHeaderContext {
  return {
    column,baseWidth:sourceColumns.value.find(item=>item.id===column.id)?.width,
    get sorts(){return sorts.value},
    get filterable(){return gate('filters').enabled&&gate('filters').mode!=='headless'&&column.kind!=='actions'&&defaultColumnFilter(column).enabled},
    get filtered(){return columnFilters.value.some(rule=>rule.field===column.field)},
    get settings(){return gate('columnSettings').enabled&&runtime.settingsPolicy.value.pages.columns.visible},
    access:field=>getSettingsColumnFieldAccess(column,field,runtime.settingsPolicy.value),
    patch:change=>applyPatches(settingsPatches({[column.id]:change})),
    sort:order=>order===undefined?sort(column):setQuery({sorts:order===null?sorts.value.filter(rule=>rule.field!==column.field):[{field:column.field,order},...sorts.value.filter(rule=>rule.field!==column.field)]}),
    filter:()=>void openFilters(column.id),configure:()=>void openColumnSettings('drawer',column.id),
  }
}
function rowActionsContext(details:{allowedItems?:string[]}){
  return reactive({get header(){return actionColumn.value?columnHeaderContext(actionColumn.value):undefined},get renderWidth(){return actionColumn.value?columnLayout.value.widths[actionColumn.value.id]:undefined},get fixed(){return narrow.value?false:actionColumn.value?.fixed??'right' as const},get column(){return actionColumn.value},get layout(){return presentation.value.rowActions},get actions(){return props.actionProvider?.(details)??props.actions??[]},rowId,reportError(cause:unknown){report({code:'RuntimeExtensionError',path:'rowActions',message:cause instanceof Error?cause.message:String(cause)})}})
}

const hasRenderedActions=computed(()=>{
  if(!gate('rowActions').enabled||gate('rowActions').mode==='headless')return false
  // Layout consumes an activated feature context; it must never initiate detail or registry reads.
  const context=hosts.get('rowActions')?.getContext() as {actions:readonly Action<T>[]} | undefined
  return Boolean(context?.actions.length)
})
const columnLayout=computed(()=>resolveColumnLayout(
  resolvedColumns.value.filter(column=>column.kind!=='actions'||hasRenderedActions.value),
  viewportSize.value.width,
  (props.selection?44:0)+(presentation.value.appearance.index?48:0),
))
// Native stable gutters absorb small overflows within their reserved space; do not add a second scrollbar row for them.
const gridScrollbars=computed(()=>props.fill?{y:{visible:'visible' as const},x:{visible:columnLayout.value.totalWidth>viewportSize.value.frameWidth}}:undefined)
defineExpose({openFilters,setFilterState,applySettings,setPresentation,setColumnFilters,readRows:runtime.readRows,selectQuery:runtime.selectQuery,optionsFor:runtime.optionsFor,viewSnapshot:runtime.viewSnapshot,getRuntime:()=>runtime,reload:()=>load(),setQuery,applyView,getState,getSelectedRows,clearSelection,openColumnSettings,activateFeature:(name:FeatureName)=>hosts.get(name)?.activate(),getFeatureContext:(name:FeatureName)=>hosts.get(name)?.getContext()})
</script>
<template>
<section ref="tableElement" class="bt" :class="{'bt--narrow':narrow,'bt--fill':fill,['bt--'+presentation.appearance.density]:true,['bt-border--'+presentation.appearance.border]:true,'bt--stripe':presentation.appearance.stripe,'bt--no-hover':!presentation.appearance.hover}" :style="tableStyle" data-business-table :aria-busy="Boolean(loading||busy)">
  <div v-if="error" class="bt__error" role="alert">{{error}}</div>
  <slot name="before" :search="gate('search').enabled?searchContext():undefined"/>
  <header v-if="hasHeaderFeatures||slots['toolbar-start']||slots['toolbar-end']" :class="{'bt__bar':showHeader||slots['toolbar-start']||slots['toolbar-end']}" :style="!showHeader&&!slots['toolbar-start']&&!slots['toolbar-end']?{display:'contents'}:undefined">
    <slot name="toolbar-start" :total="total" :rows="rows"/>
    <FeatureHost :key="tableKey" v-if="gate('title').enabled" :ref="value=>setHost('title',value)" :local="declarations.title" :remote="remoteFeatures?.title" :create-context="titleContext" :loader="()=>import('./components/TableTitle.vue')" @diagnostic="report"><template #custom="{context}"><slot name="title" :context="context"/></template></FeatureHost>
    <div class="bt__tools">
      <slot name="toolbar-end"/>
      <FeatureHost :key="tableKey" v-if="gate('search').enabled" :ref="value=>setHost('search',value)" :local="declarations.search" :remote="remoteFeatures?.search" :create-context="searchContext" :loader="()=>import('./components/TableSearch.vue')" @diagnostic="report"><template #custom="{context}"><slot name="search" :context="context"/></template></FeatureHost>
      <FeatureHost :key="tableKey" v-if="gate('views').enabled" :ref="value=>setHost('views',value)" :local="declarations.views" :remote="remoteFeatures?.views" default-strategy="after-definition" :create-context="viewsContext" :loader="()=>import('./components/ViewSwitcher.vue')" @diagnostic="report"><template #custom="{context}"><slot name="views" :context="context"/></template></FeatureHost>
      <FeatureHost :key="tableKey" v-if="gate('columnSettings').enabled" :ref="value=>setHost('columnSettings',value)" :local="declarations.columnSettings" :remote="remoteFeatures?.columnSettings" default-strategy="on-interaction" :entry-label="settingsEntryLabel" entry-icon="columns" test-id="column-settings" @entry="resetSettingsEntry" :create-context="columnSettingsContext" :loader="()=>import('./components/ColumnSettings.vue')" @diagnostic="report"><template #custom="{context}"><slot name="column-settings" :context="context"/></template></FeatureHost>
      <button v-if="gate('columnSettings').enabled&&gate('columnSettings').mode==='default'&&featureEntryVisible(declarations.columnSettings,remoteFeatures?.columnSettings)" class="bt__settings-trigger" data-testid="table-settings" @click="openColumnSettings('drawer')"><TableIcon name="settings"/>表格设置</button>
      <FeatureHost :key="tableKey" v-if="gate('toolbar').enabled" :ref="value=>setHost('toolbar',value)" :local="declarations.toolbar" :remote="remoteFeatures?.toolbar" :create-context="toolbarContext" :loader="()=>import('./components/TableToolbar.vue')" @diagnostic="report"><template #custom="{context}"><slot name="toolbar" :context="context"/></template></FeatureHost>
      <FeatureHost :key="tableKey" v-if="gate('filters').enabled" :ref="value=>setHost('filters',value)" :local="declarations.filters" :remote="remoteFeatures?.filters" default-strategy="on-interaction" entry-label="组合筛选" entry-icon="filter" test-id="combined-filter" @entry="resetFilterEntry" :create-context="filtersContext" :loader="()=>import('./features/filters/FilterFeature.vue')" @diagnostic="report"><template #custom="{context}"><slot name="filters" :context="context"/></template></FeatureHost>
      <slot name="toolbar-after"/>
    </div>
  </header>
  <slot name="after-toolbar"/>
  <FilterChips v-if="gate('filters').enabled&&gate('filters').mode==='default'&&(columnFilters.length||filterGroup?.rules.length)" :columns="allResolvedColumns" :column-filters="columnFilters" :group="filterGroup" :options-for="runtime.optionsFor" :options-identity="runtime.filterOptionsIdentity.value" @edit="openFilters" @clear="clearFilter"/>
  <div ref="viewportElement" :id="tableKey?tableKey+'-viewport':undefined" class="bt__viewport" tabindex="0" role="region" :aria-label="(title??'数据列表')+'，可横向滚动'" @keydown="scrollViewportByKey($event,viewportElement?.querySelector<HTMLElement>('.vxe-table--main-wrapper .vxe-table--body-inner-wrapper'))">
  <vxe-table ref="gridElement" :auto-resize="false" :height="fill?viewportSize.height||undefined:undefined" :scrollbar-config="gridScrollbars" :row-class-name="({row}:{row:T})=>selected.has(rowId(row))?'is-selected':''" :data="rows" :loading="loading||busy" :border="false" :row-config="{isHover:presentation.appearance.hover,keyField:rowKey}">
    <template #loading><div v-if="loading||busy" class="bt__loading" role="status" aria-label="加载中">加载中…</div></template>
    <vxe-column v-if="selection" width="44" :fixed="narrow?undefined:'left'" class-name="bt__select-cell">
      <template #header><input type="checkbox" aria-label="选择当前页" :checked="allSelected" :indeterminate="someSelected" @change="event=>selectPage((event.target as HTMLInputElement).checked)"></template>
      <template #default="{row}"><input type="checkbox" :aria-label="'选择 '+rowId(row)" :checked="selected.has(rowId(row))" @change="event=>selectRow(row,(event.target as HTMLInputElement).checked)"></template>
    </vxe-column>
    <vxe-column v-if="presentation.appearance.index" type="seq" title="序号" width="48" :fixed="narrow?undefined:'left'" :seq-config="{startIndex:(page-1)*pageSize}"/>
    <vxe-column v-for="c in dataColumns" :key="c.id" :field="c.field" :title="c.title" :width="columnLayout.widths[c.id]" :min-width="c.minWidth??120" :fixed="narrow?undefined:c.fixed||undefined" :align="c.align??'left'" :header-align="c.headerStyle?.align??c.align??'left'" :sortable="false">
      <template #header><ColumnHeader :context="columnHeaderContext(c)"/></template>
      <template #default="{row}"><div class="bt__cell-content" :style="textStyle(c.cellStyle)"><slot name="cell" :row="row" :column="c" :value="getValue(row,c.field)" :text="displayValue(getValue(row,c.field),c)"><CellRenderer v-if="cellRenderer&&c.renderer" :value="getValue(row,c.field)" :row="row" :column="c" :renderer="cellRenderer" @diagnostic="report"/><BusinessCell v-else :row="row" :column="c" :columns="allResolvedColumns" @action="cellAction($event,row,c)"/></slot></div></template>
    </vxe-column>
    <FeatureHost :key="tableKey" v-if="gate('rowActions').enabled" :ref="value=>setHost('rowActions',value)" :local="declarations.rowActions" :remote="remoteFeatures?.rowActions" :create-context="rowActionsContext" :loader="()=>import('./components/RowActions.vue')" @diagnostic="report"><template #custom="{context}"><slot name="row-actions" :context="context"/></template></FeatureHost>
    <template #empty><div class="bt__empty">暂无数据</div></template>
  </vxe-table>
  </div>
  <footer class="bt__footer"><slot name="summary" :total="total" :rows="rows" :page="page" :page-size="pageSize"><span>共 {{total}} 条，第 {{page}} / {{pages}} 页</span></slot><div class="bt__pages"><select v-model.number="pageSize" aria-label="每页条数" @change="changePageSize"><option v-for="n in allowedPageSizes" :key="n" :value="n">{{n}} 条 / 页</option></select><button :class="{'bt__page-arrow':fill}" aria-label="上一页" :disabled="page<=1" @click="goPage(page-1)"><TableIcon v-if="fill" name="chevron-left"/><template v-else>上一页</template></button><template v-if="fill"><button v-for="n in pageButtons" :key="n" :class="{'is-current':n===page}" :aria-current="n===page?'page':undefined" :aria-label="'第 '+n+' 页'" @click="goPage(n)">{{n}}</button></template><button :class="{'bt__page-arrow':fill}" aria-label="下一页" :disabled="page>=pages" @click="goPage(page+1)"><TableIcon v-if="fill" name="chevron-right"/><template v-else>下一页</template></button><label v-if="fill" class="bt__jump">前往 <input v-model.number="jumpPage" type="number" min="1" :max="pages" aria-label="跳转页码" @keyup.enter="goPage(jumpPage)"><button class="bt__link" @click="goPage(jumpPage)">跳转</button></label></div></footer>
</section>
</template>
