<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch,type VNodeChild} from 'vue'
import type {ColumnConfig,ColumnTextStyle,RowData,SortConfig,UserColumnConfig} from '../types'
import {getColumnWidthBounds,isColumnCapabilityEnabled} from '../config/columns'
import {applySorts,displayValue,getValue,mapStyle} from '../core'
import {columnTextCss,editableColumnWidth} from './settingsTypes'
import CellRenderer from './CellRenderer'
import TableIcon from './TableIcon.vue'
import FontSelect from './FontSelect.vue'
import ColorSelect from './ColorSelect.vue'
import BusinessCell from './BusinessCell.vue'
import ColumnRuleEditor from '../features/settings/ColumnRuleEditor.vue'
import ActionSettings from '../features/settings/ActionSettings.vue'
import AppearanceSettings from '../features/settings/AppearanceSettings.vue'
import ToolbarSettings from '../features/settings/ToolbarSettings.vue'
import DialogFrame from '../ui/DialogFrame.vue'
import {resolvePresentation,presentActions,presentTools,availableActions,availableTools,type TablePresentation,type ToolDefinition} from '../features/presentation/model'
import type {SettingsIssue} from '../features/settings/session'
import type {Action} from '../types'
import {cloneData} from '../runtime/value'
import {fontFamilyCss} from '../config/font-families'
import {parseColumnPatch} from '../config/columns'
import {getColumnSectionAccess,getSettingsColumnFieldAccess,guardSettingsColumnPatch,resolveSettingsPolicy,type SettingsPage,type SettingsPolicy,type ColumnSettingsSection} from '../features/settings/policy'
import type {ColumnCapabilities} from '../config/types'


const props=withDefaults(defineProps<{settingsPolicy?:SettingsPolicy;tableKey?:string;presentation?:TablePresentation;basePresentation?:TablePresentation;actions?:Action[];tools?:{page:readonly ToolDefinition[];table:readonly ToolDefinition[]};pageSizes?:number[];issues?:SettingsIssue[];changes?:Record<string,UserColumnConfig>;initialColumnId?:string;initialTab?:'columns'|'sorts'|'actions'|'appearance'|'toolbar';columns:ColumnConfig[];baseColumns:ColumnConfig[];sorts:SortConfig[];sortingEnabled:boolean;previewRows:RowData[];previewCell?:(value:unknown,row:RowData,column:ColumnConfig)=>VNodeChild;dirty:boolean;saving:boolean;error:string}>(),{presentation:()=>resolvePresentation(),basePresentation:()=>resolvePresentation(),actions:()=>[],tools:()=>({page:[],table:[]}),issues:()=>[],changes:()=>({})})
const emit=defineEmits<{presentation:[value:TablePresentation];restore:[input:{columns?:Record<string,UserColumnConfig>;sorts?:SortConfig[];presentation?:unknown}];patch:[id:string,patch:UserColumnConfig];reset:[id?:string];sorts:[sorts:SortConfig[]];resetSorts:[];apply:[];cancel:[];move:[id:string,targetId:string]}>()
const selectedId=ref(props.initialColumnId??props.columns.find(column=>column.visible!==false&&!column.fixed&&isColumnCapabilityEnabled(column,'rename'))?.id??props.columns[0]?.id??'')
const selected=computed(()=>props.columns.find(column=>column.id===selectedId.value))
const selectedBase=computed(()=>props.baseColumns.find(column=>column.id===selectedId.value))
const dialog=ref<HTMLElement>(),widthError=ref(''),previewOpen=ref(true),previewMode=ref<'table'|'column'>('table'),sampleIndex=ref(0)
const batchIds=ref<string[]>(selectedId.value?[selectedId.value]:[]),draggedId=ref<string>()
const activeTab=ref<SettingsPage|undefined>(props.initialTab??'columns')
const ruleEditor=ref<InstanceType<typeof ColumnRuleEditor>>(),ruleErrors=ref<Record<string,string[]>>({}),reviewOpen=ref(false),backupError=ref(''),restoreInput=ref<HTMLInputElement>(),trialRow=ref<RowData>()
const allRuleErrors=computed(()=>Object.values(ruleErrors.value).flat())
const displayedRow=computed(()=>trialRow.value??row.value)
const previewActions=computed(()=>presentActions(props.actions,props.presentation.rowActions))
const scrollPositions=new Map<string,number>()
const activeSection=ref<ColumnSettingsSection|undefined>('basic')
const experienceKey=computed(()=>props.tableKey?'business-table:experience:'+props.tableKey:'')
const discardConfirmation=ref(false),discardDialog=ref<HTMLElement>()
const sortedSamples=computed(()=>applySorts(props.previewRows,props.sorts,props.columns))
const row=computed(()=>sortedSamples.value[sampleIndex.value]??sortedSamples.value[0])
const sortableColumns=computed(()=>props.columns.filter(column=>column.sortable))
const unusedSortColumns=computed(()=>sortableColumns.value.filter(column=>!props.sorts.some(sort=>sort.field===column.field)))
const previewColumns=computed(()=>previewMode.value==='column'?(selected.value?[selected.value]:[]):props.columns.filter(column=>column.visible!==false))
type StyleKey='headerStyle'|'cellStyle'
const colorDrafts=ref<Record<string,{id:string;key:StyleKey;value:string}>>({})
const invalidColor=(value:string)=>value.trim()!==''&&!/^#[\da-f]{6}$/i.test(value.trim())
const colorErrors=computed(()=>Object.values(colorDrafts.value).filter(entry=>invalidColor(entry.value)))
const styleSections=[{key:'headerStyle' as const,title:'表头文字'},{key:'cellStyle' as const,title:'单元格文字'}]
const alignments=[{id:'left' as const,label:'左对齐'},{id:'center' as const,label:'居中'},{id:'right' as const,label:'右对齐'}]
const settingsPolicy=computed(()=>props.settingsPolicy??resolveSettingsPolicy())
const pageEntries=[{id:'columns',label:'列设置'},{id:'sorts',label:'排序规则'},{id:'actions',label:'操作按钮'},{id:'appearance',label:'表格外观'},{id:'toolbar',label:'工具栏'}] as const
const localTools=computed(()=>({page:availableTools(props.tools.page),table:availableTools(props.tools.table)}))
const localActions=computed(()=>availableActions(props.actions))
const tabs=computed(()=>pageEntries.filter(tab=>settingsPolicy.value.pages[tab.id].visible&&(tab.id!=='actions'||localActions.value.length>0)&&(tab.id!=='toolbar'||localTools.value.page.length+localTools.value.table.length>0)&&(tab.id!=='sorts'||props.sortingEnabled)))
const canPage=(page:SettingsPage|undefined)=>!!page&&tabs.value.some(tab=>tab.id===page)&&!settingsPolicy.value.pages[page].disabled
const sectionEntries=[{id:'basic',label:'基本'},{id:'content',label:'内容'},{id:'number',label:'数字'},{id:'filter',label:'筛选'},{id:'mapping',label:'映射'},{id:'template',label:'模板'},{id:'trial',label:'试算'}] as const
const sectionAccess=(section:ColumnSettingsSection)=>selected.value?getColumnSectionAccess(selected.value,section,settingsPolicy.value):{visible:false,disabled:false}
const sections=computed(()=>sectionEntries.filter(section=>sectionAccess(section.id).visible))
const capabilityFields:Record<keyof ColumnCapabilities,keyof UserColumnConfig|undefined>={rename:'title',visible:'visible',order:'order',width:'width',fixed:'fixed',align:'align',sortable:'sortable',headerStyle:'headerStyle',cellStyle:'cellStyle',content:'content',format:'numberRule',filter:'filter',mapping:'mapping',template:'template',trial:undefined}
const fieldAccess=(column:ColumnConfig,key:keyof UserColumnConfig)=>getSettingsColumnFieldAccess(column,key,settingsPolicy.value)
const visible=(key:keyof ColumnCapabilities)=>!!selected.value&&!!capabilityFields[key]&&fieldAccess(selected.value,capabilityFields[key]!).visible
const can=(key:keyof ColumnCapabilities)=>!!selected.value&&!!capabilityFields[key]&&fieldAccess(selected.value,capabilityFields[key]!).visible&&!fieldAccess(selected.value,capabilityFields[key]!).disabled
const canResetSelected=computed(()=>canPage('columns')&&(Object.keys(capabilityFields) as (keyof ColumnCapabilities)[]).some(can))
const visibleStyles=computed(()=>styleSections.filter(section=>visible(section.key)))
const canMove=(column:ColumnConfig)=>{const access=fieldAccess(column,'order');return access.visible&&!access.disabled}
const batchColumns=computed(()=>props.columns.filter(column=>['headerStyle','cellStyle'].some(field=>fieldAccess(column,field as StyleKey).visible)))
const batchEnabled=(column:ColumnConfig)=>['headerStyle','cellStyle'].some(field=>{const access=fieldAccess(column,field as StyleKey);return access.visible&&!access.disabled})
function openPage(page:SettingsPage){if(tabs.value.some(tab=>tab.id===page))activeTab.value=page}
function patch(changes:UserColumnConfig){if(selected.value){const guarded=guardSettingsColumnPatch(selected.value,changes,settingsPolicy.value);if(Object.keys(guarded).length)emit('patch',selected.value.id,guarded)}}
function pin(side:'left'|'right'){if(selected.value)patch({fixed:selected.value.fixed===side?false:side})}
function canPin(side:'left'|'right'){return !!selected.value&&Object.hasOwn(guardSettingsColumnPatch(selected.value,{fixed:selected.value.fixed===side?false:side},settingsPolicy.value),'fixed')}
function width(value:string){
  if(!selected.value||!can('width'))return
  const bounds=getColumnWidthBounds(selected.value),amount=Number(value)
  widthError.value=!Number.isFinite(amount)||amount<bounds.min||amount>bounds.max?`请输入 ${bounds.min}–${bounds.max} px。`:''
  if(!widthError.value)patch({width:amount})
}
function style(key:'headerStyle'|'cellStyle',field:keyof ColumnTextStyle,value:string){
  if(!can(key))return
  const next={...selected.value?.[key]}
  if(value==='')delete next[field]
  else Object.assign(next,{[field]:field==='fontSize'?Number(value):value})
  patch({[key]:next})
}
function colorValue(key:StyleKey){return colorDrafts.value[JSON.stringify([selectedId.value,key])]?.value??selected.value?.[key]?.color??''}
function colorInput(key:StyleKey,value:string){
  if(!selected.value||!can(key))return
  colorDrafts.value[JSON.stringify([selectedId.value,key])]={id:selectedId.value,key,value}
  if(!invalidColor(value))style(key,'color',value.trim().toLowerCase())
}
function clearColorInputs(id?:string,part?:StyleKey){
  for(const [token,entry] of Object.entries(colorDrafts.value))if((!id||entry.id===id)&&(!part||entry.key===part))delete colorDrafts.value[token]
}
function resetColumn(id:string){if(id===selectedId.value&&canResetSelected.value){clearColorInputs(id);emit('reset',id)}}
function resetStyle(key:StyleKey){clearColorInputs(selectedId.value,key);patch({[key]:selectedBase.value?.[key]??{}})}
async function revealColorError(){
  const first=colorErrors.value[0];if(!first)return
  activeTab.value='columns';selectedId.value=first.id
  await nextTick()
  const label=first.key==='headerStyle'?'表头文字':'单元格文字'
  const input=dialog.value?.querySelector<HTMLInputElement>(`[data-color-picker="${label}"] input[type="text"]`)
  input?.scrollIntoView?.({block:'nearest'});input?.focus({preventScroll:true})
}
function alignmentKey(key:StyleKey,event:KeyboardEvent){
  if(event.isComposing||!can(key)||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
  event.preventDefault();event.stopPropagation()
  const values=['','left','center','right'],current=values.indexOf(selected.value?.[key]?.align??'')
  const index=event.key==='Home'?0:event.key==='End'?3:(current+(event.key==='ArrowRight'?1:3))%4
  style(key,'align',values[index]!)
  const group=event.currentTarget as HTMLElement
  void nextTick(()=>group.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus())
}
function sampleName(item:RowData,index:number){
  const values=props.columns.filter(column=>column.type!=='number'&&column.type!=='currency').slice(0,2).map(column=>displayValue(getValue(item,column.field),column))
  return values.join(' · ')||`样例 ${index+1}`
}
function toggleBatch(id:string,checked:boolean){if(!props.columns.some(column=>column.id===id&&batchEnabled(column)))return;batchIds.value=checked?[...new Set([...batchIds.value,id])]:batchIds.value.filter(value=>value!==id)}
function copyStyles(){
  if(!selected.value||(!can('headerStyle')&&!can('cellStyle')))return
  const sourceId=selected.value.id
  const changes={headerStyle:{...selected.value.headerStyle},cellStyle:{...selected.value.cellStyle}}
  for(const id of batchIds.value){
    const target=props.columns.find(column=>column.id===id)
    if(!target)continue
    const guarded=guardSettingsColumnPatch(target,changes,settingsPolicy.value)
    // An explicit batch replacement supersedes the target's buffered input,
    // but never clears an uncorrected source or a capability-locked field.
    if(id!==sourceId)for(const key of ['headerStyle','cellStyle'] as const){
      if(Object.hasOwn(guarded,key))clearColorInputs(id,key)
    }
    emit('patch',id,guarded)
  }
}
function moveKey(id:string,event:KeyboardEvent){
  if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return
  event.preventDefault()
  const columns=props.columns.filter(canMove),index=columns.findIndex(column=>column.id===id)
  const target=columns[index+(event.key==='ArrowUp'?-1:1)]
  if(target)emit('move',id,target.id)
}
function drop(id:string){if(draggedId.value&&props.columns.some(column=>column.id===draggedId.value&&canMove(column))&&props.columns.some(column=>column.id===id&&canMove(column)))emit('move',draggedId.value,id);draggedId.value=undefined}
function changeSort(index:number,patch:Partial<SortConfig>){
  if(!canPage('sorts'))return
  emit('sorts',props.sorts.map((sort,position)=>position===index?{...sort,...patch}:{...sort}))
}
function addSort(){const column=unusedSortColumns.value[0];if(column&&canPage('sorts'))emit('sorts',[...props.sorts,{field:column.field,order:'asc'}])}
function removeSort(index:number){if(canPage('sorts'))emit('sorts',props.sorts.filter((_,position)=>position!==index))}
function moveSort(index:number,offset:number){
  if(!canPage('sorts'))return
  const target=index+offset
  if(target<0||target>=props.sorts.length)return
  const next=props.sorts.map(sort=>({...sort})),[sort]=next.splice(index,1)
  next.splice(target,0,sort!);emit('sorts',next)
}
function resetPage(){
  if(!canPage(activeTab.value))return
  if(activeTab.value==='columns'){clearColorInputs();ruleErrors.value={};emit('reset')}
  else if(activeTab.value==='sorts')emit('resetSorts')
  else if(activeTab.value){const key=activeTab.value==='actions'?'rowActions':activeTab.value;emit('presentation',{...props.presentation,[key]:cloneData(props.basePresentation[key])})}
}
function resetAll(){
  if(canPage('columns')){clearColorInputs();ruleErrors.value={};emit('reset')}
  if(canPage('sorts'))emit('resetSorts')
  const next=cloneData(props.presentation)
  for(const key of ['appearance','rowActions','toolbar'] as const)if(canPage(key==='rowActions'?'actions':key))Object.assign(next,{[key]:cloneData(props.basePresentation[key])})
  emit('presentation',next)
}
function setPresentation(key:'appearance'|'rowActions'|'toolbar',value:unknown){if(canPage(key==='rowActions'?'actions':key))emit('presentation',{...props.presentation,[key]:value})}
function showSection(section:ColumnSettingsSection){if(!sectionAccess(section).visible)return;activeSection.value=section;if(section==='basic')dialog.value?.querySelector('.bt-settings-detail')?.scrollTo?.({top:0,behavior:'smooth'});else void ruleEditor.value?.reveal(section)}
function revealChange(id?:string){reviewOpen.value=false;openPage('columns');if(id)selectedId.value=id;void nextTick(()=>{const section=sections.value[0]?.id;if(section)showSection(section)})}
function setRuleErrors(id:string,errors:string[]){if(JSON.stringify(ruleErrors.value[id]??[])===JSON.stringify(errors))return;if(errors.length)ruleErrors.value[id]=errors;else delete ruleErrors.value[id]}
function rememberScroll(){const pane=dialog.value?.querySelector<HTMLElement>('.bt-settings-detail');if(pane)scrollPositions.set(selectedId.value,pane.scrollTop)}
function selectColumn(id:string){rememberScroll();selectedId.value=id}
function currentBackup(){return {kind:'business-table-settings',schemaVersion:3,tableKey:props.tableKey,columns:Object.fromEntries(props.columns.map((column,index)=>[column.id,{...parseColumnPatch(Object.fromEntries(Object.entries(column).filter(([key])=>['title','visible','width','fixed','align','sortable','headerStyle','cellStyle','content','mapping','numberRule','template','filter','filterable','emptyText','numberFormat','valueMap'].includes(key)))),order:index}])),sorts:cloneData(props.sorts),presentation:cloneData(props.presentation)}}
function exportBackup(){const url=URL.createObjectURL(new Blob([JSON.stringify(currentBackup(),null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='表格设置.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),0)}
async function restoreBackup(event:Event){
  if(!canPage('appearance'))return
  const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return
  try{if(file.size>2_000_000)throw new Error('设置文件不能超过 2 MB');const data=JSON.parse(await file.text());if(!data||data.kind!=='business-table-settings'||data.schemaVersion!==3||!data.columns||typeof data.columns!=='object')throw new Error('请选择有效的表格设置备份');emit('restore',data);backupError.value=''}catch(cause){backupError.value=cause instanceof Error?cause.message:'设置备份无法读取'}
}
function rememberPreview(){try{if(experienceKey.value)localStorage.setItem(experienceKey.value,JSON.stringify({previewOpen:previewOpen.value,previewMode:previewMode.value}))}catch{/* Experience persistence is optional. */}}
watch([previewOpen,previewMode],rememberPreview)

function requestClose(){
  if(props.saving)return
  if(props.dirty||colorErrors.value.length||allRuleErrors.value.length){discardConfirmation.value=true;void nextTick(()=>discardDialog.value?.querySelector<HTMLButtonElement>('button')?.focus())}
  else emit('cancel')
}
function continueEditing(){discardConfirmation.value=false;void nextTick(()=>dialog.value?.querySelector<HTMLButtonElement>('[aria-label="关闭表格设置"]')?.focus())}
function keydown(event:KeyboardEvent){
  if(event.key==='Escape'){event.stopPropagation();event.preventDefault();if(discardConfirmation.value)continueEditing();else requestClose();return}
  if(event.key!=='Tab'||!dialog.value)return
  const scope=discardConfirmation.value?discardDialog.value:dialog.value
  const elements=[...(scope?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')??[])].filter(element=>!element.closest('[inert]'))
  const first=elements[0],last=elements.at(-1)
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
}
watch(selectedId,id=>{widthError.value='';trialRow.value=undefined;activeSection.value=sections.value[0]?.id;void nextTick(()=>dialog.value?.querySelector('.bt-settings-detail')?.scrollTo?.({top:scrollPositions.get(id)??0}))})
watch(()=>props.initialColumnId,id=>{if(id)selectColumn(id)})
watch(()=>props.initialTab,tab=>{if(tab&&tabs.value.some(item=>item.id===tab))activeTab.value=tab})
watch(tabs,value=>{if(!value.some(tab=>tab.id===activeTab.value))activeTab.value=value[0]?.id},{immediate:true})
watch(sections,value=>{if(!value.some(section=>section.id===activeSection.value))activeSection.value=value[0]?.id},{immediate:true})
watch(sampleIndex,()=>{trialRow.value=undefined})
let previousOverflow=''
onMounted(()=>{try{const saved=experienceKey.value?JSON.parse(localStorage.getItem(experienceKey.value)??'null'):null;if(saved){previewOpen.value=saved.previewOpen!==false;previewMode.value=saved.previewMode==='column'?'column':'table'}}catch{}previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';void nextTick(()=>dialog.value?.focus())})
onBeforeUnmount(()=>{document.body.style.overflow=previousOverflow})
</script>
<template>
  <Teleport to="body">
    <div class="bt-settings-overlay" @click.self="requestClose">
      <section ref="dialog" class="bt-settings-drawer" data-testid="settings-drawer" role="dialog" aria-modal="true" aria-label="表格设置" tabindex="-1" @keydown="keydown">
        <header class="bt-settings-drawer__header"><div><h2>表格设置</h2><p>修改先预览，应用后生效。</p></div><button class="bt-settings-icon" aria-label="关闭表格设置" :disabled="saving" @click="requestClose"><TableIcon name="close" :size="16" /></button></header>
        <nav class="bt-settings-tabs" aria-label="表格设置分类"><button v-for="tab in tabs" :key="tab.id" :aria-label="tab.label" :class="{'is-active':activeTab===tab.id}" :aria-current="activeTab===tab.id?'page':undefined" @click="activeTab=tab.id">{{tab.label}}<span v-if="tab.id==='sorts'&&sorts.length" class="bt-settings-tab-count">{{sorts.length}}</span></button></nav>
        <div class="bt-settings-summary" :class="{'is-dirty':dirty}"><span>{{dirty?'修改尚未应用':'当前设置已应用'}}</span><span v-if="activeTab&&settingsPolicy.pages[activeTab].disabled" class="bt-settings-readonly">只读</span><button v-if="dirty" class="bt-settings-text" @click="reviewOpen=true">查看修改</button></div>
        <div v-if="activeTab==='columns'" class="bt-settings-editor">
          <aside class="bt-settings-sidebar">
            <div v-if="batchColumns.length" class="bt-settings-sidebar__caption"><strong>批量样式</strong><span>勾选仅用于复制文字样式</span></div>
            <label v-if="batchColumns.length" class="bt-settings-check bt-settings-sidebar__all"><input type="checkbox" aria-label="全选样式列" :disabled="!batchColumns.some(batchEnabled)" :checked="batchColumns.length>0&&batchColumns.every(column=>batchIds.includes(column.id))" :indeterminate="batchColumns.some(column=>batchIds.includes(column.id))&&!batchColumns.every(column=>batchIds.includes(column.id))" @change="batchIds=($event.target as HTMLInputElement).checked?batchColumns.filter(batchEnabled).map(column=>column.id):[]">全选样式列</label>
            <div class="bt-settings-sidebar__list">
              <div v-for="column in columns" :key="column.id" class="bt-settings-pick" :class="{'is-active':selectedId===column.id}" @dragover.prevent @drop.prevent="drop(column.id)">
                <input v-if="batchColumns.some(item=>item.id===column.id)" type="checkbox" :disabled="!batchEnabled(column)" :aria-label="'批量样式 '+column.title" :checked="batchIds.includes(column.id)" @change="toggleBatch(column.id,($event.target as HTMLInputElement).checked)">
                <button v-if="fieldAccess(column,'order').visible" class="bt-settings-icon bt-settings-grip" :disabled="!canMove(column)" :aria-label="'拖动排序 '+column.title" :draggable="canMove(column)" @dragstart="draggedId=column.id" @dragend="draggedId=undefined" @keydown="moveKey(column.id,$event)"><TableIcon name="grip" :size="12" /></button>
                <button class="bt-settings-pick__label" :aria-label="'编辑列 '+column.title" @click="selectColumn(column.id)"><span>{{column.title}}</span><small>{{column.visible===false?'隐藏':column.fixed==='left'?'左侧冻结':column.fixed==='right'?'右侧冻结':'显示'}}</small></button>
              </div>
            </div>
            <p v-if="batchColumns.length">勾选用于批量样式，不会隐藏列。</p>
          </aside>
          <main v-if="selected" class="bt-settings-detail" @scroll.passive="rememberScroll">
            <div class="bt-settings-editor-header"><div class="bt-settings-detail__heading"><div><h3>当前编辑：{{selected.title}}</h3><small>{{selected.type==='number'||selected.type==='currency'?'数值字段':'文本字段'}} · {{selected.visible===false?'隐藏中':'显示中'}}</small></div><button v-if="settingsPolicy.pages.columns.visible" class="bt-settings-text" :disabled="!canResetSelected" @click="resetColumn(selected.id)">恢复此列</button></div>
            <nav v-if="sections.length" class="bt-settings-sections" aria-label="列设置内容"><button v-for="section in sections" :key="section.id" :class="{'is-active':activeSection===section.id}" @click="showSection(section.id)">{{section.label}}<small v-if="sectionAccess(section.id).disabled">只读</small></button></nav></div>
            <section v-if="sectionAccess('basic').visible" class="bt-settings-section">
              <div class="bt-settings-grid bt-settings-grid--two">
                <label v-if="visible('rename')" class="bt-settings-field"><span>显示名称</span><input aria-label="显示名称" :value="selected.title" :disabled="!can('rename')" @input="patch({title:($event.target as HTMLInputElement).value})"><small>原名称：{{selectedBase?.title??selected.title}}</small></label>
                <label v-if="visible('width')" class="bt-settings-field"><span>列宽（px）</span><input type="number" aria-label="列宽（px）" :min="getColumnWidthBounds(selected).min" :max="getColumnWidthBounds(selected).max" :value="editableColumnWidth(selected)" :disabled="!can('width')" :aria-invalid="!!widthError" @input="width(($event.target as HTMLInputElement).value)"><small v-if="!widthError">允许 {{getColumnWidthBounds(selected).min}}–{{getColumnWidthBounds(selected).max}} px</small><small v-else class="bt-settings-error">{{widthError}}</small><input class="bt-settings-width-range" type="range" :aria-label="selected.title+'列宽'" :min="getColumnWidthBounds(selected).min" :max="getColumnWidthBounds(selected).max" :value="editableColumnWidth(selected)" :disabled="!can('width')" @input="width(($event.target as HTMLInputElement).value)"></label>
              </div>
              <div class="bt-settings-inline"><label v-if="visible('visible')" class="bt-settings-check"><input type="checkbox" aria-label="显示此列" :checked="selected.visible!==false" :disabled="!can('visible')" @change="patch({visible:($event.target as HTMLInputElement).checked})">显示此列</label><label v-if="visible('sortable')" class="bt-settings-check"><input type="checkbox" aria-label="允许排序" :checked="!!selected.sortable" :disabled="!can('sortable')" @change="patch({sortable:($event.target as HTMLInputElement).checked})">允许排序</label><span v-if="visible('fixed')" class="bt-settings-detail-pins">冻结位置<button v-for="side in ['left','right'] as const" :key="side" class="bt-settings-icon" :class="{'is-active':selected.fixed===side}" :disabled="!canPin(side)" :title="(side==='left'?'左冻结 ':'右冻结 ')+selected.title" :aria-pressed="selected.fixed===side" @click="pin(side)"><TableIcon :name="'pin-'+side" :size="15" /></button></span></div>
            </section>
            <div v-if="batchIds.length>1&&(can('headerStyle')||can('cellStyle'))" class="bt-settings-batch"><span>已选择 {{batchIds.length}} 列</span><button class="bt-settings-text" @click="copyStyles">将当前文字样式应用到勾选列</button></div>
            <section v-for="section in visibleStyles" :key="section.key" class="bt-settings-section">
              <div class="bt-settings-section__heading"><h4>{{section.title}}</h4><button class="bt-settings-text" :disabled="!can(section.key)" @click="resetStyle(section.key)">恢复</button></div>
              <div class="bt-settings-grid bt-settings-grid--three">
                <div class="bt-settings-field"><span>字体</span><FontSelect :label="section.title" :model-value="selected[section.key]?.fontFamily??''" :disabled="!can(section.key)" @update:model-value="style(section.key,'fontFamily',$event)" /></div>
                <label class="bt-settings-field"><span>字号</span><select :aria-label="section.title+'字号'" :value="selected[section.key]?.fontSize??''" :disabled="!can(section.key)" @change="style(section.key,'fontSize',($event.target as HTMLSelectElement).value)"><option value="">跟随表格</option><option v-for="size in [10,11,12,13,14,15,16,18,20,22,24,28,32]" :key="size" :value="size">{{size}} px</option></select></label>
                <label class="bt-settings-field"><span>字重</span><select :aria-label="section.title+'字重'" :value="selected[section.key]?.fontWeight??''" :disabled="!can(section.key)" @change="style(section.key,'fontWeight',($event.target as HTMLSelectElement).value)"><option value="">默认</option><option value="normal">常规</option><option value="500">中等</option><option value="600">半粗</option><option value="bold">粗体</option></select></label>
                <div class="bt-settings-field"><span>对齐方式</span><div class="bt-settings-segmented" role="group" :aria-label="section.title+'对齐方式'" @keydown="alignmentKey(section.key,$event)"><button :tabindex="!selected[section.key]?.align?0:-1" :aria-label="section.title+'默认对齐'" :aria-pressed="!selected[section.key]?.align" :disabled="!can(section.key)" @click="style(section.key,'align','')">默认</button><button v-for="align in alignments" :key="align.id" :tabindex="selected[section.key]?.align===align.id?0:-1" :aria-label="section.title+align.label" :aria-pressed="selected[section.key]?.align===align.id" :disabled="!can(section.key)" @click="style(section.key,'align',align.id)"><TableIcon :name="'align-'+align.id" :size="15" /></button></div></div>
                <div class="bt-settings-field bt-settings-color"><span>文字颜色</span><ColorSelect :label="section.title" :model-value="colorValue(section.key)" :disabled="!can(section.key)" @update:model-value="colorInput(section.key,$event)" /></div>
              </div>
            </section>
            <KeepAlive><ColumnRuleEditor v-if="sections.some(section=>section.id!=='basic')" :settings-policy="settingsPolicy" :actions-visible="tabs.some(tab=>tab.id==='actions')" :key="selected.id" ref="ruleEditor" :column="selected" :columns="columns" :row="row" @patch="patch" @validation="setRuleErrors(selectedId,$event)" @trial="trialRow=$event" @actions="openPage('actions')" /></KeepAlive>
          </main>
          <div v-else class="bt-settings-empty">暂无可设置的列</div>
        </div>
        <fieldset v-else-if="activeTab==='sorts'" class="bt-settings-sort-page bt-settings-control-group" :disabled="!canPage('sorts')">
          <div class="bt-settings-sort-heading"><div><h3>按优先级排序</h3><p>从上到下依次比较，排序后再分页。</p></div><button class="bt-settings-button" :disabled="!unusedSortColumns.length" @click="addSort"><TableIcon name="plus" :size="14" />添加排序规则</button></div>
          <div v-for="(sort,index) in sorts" :key="index" class="bt-settings-sort-rule"><span class="bt-settings-sort-index">{{index+1}}</span><label class="bt-settings-field"><span>排序字段</span><select :aria-label="'排序字段 '+(index+1)" :value="sort.field" @change="changeSort(index,{field:($event.target as HTMLSelectElement).value})"><option v-for="column in sortableColumns" :key="column.id" :value="column.field" :disabled="sorts.some((other,position)=>position!==index&&other.field===column.field)">{{column.title}}</option></select></label><label class="bt-settings-field"><span>顺序</span><select :aria-label="'排序方式 '+(index+1)" :value="sort.order" @change="changeSort(index,{order:($event.target as HTMLSelectElement).value as 'asc'|'desc'})"><option value="asc">升序</option><option value="desc">降序</option></select></label><div class="bt-settings-sort-actions"><button class="bt-settings-icon" :aria-label="'上移排序规则 '+(index+1)" :disabled="index===0" @click="moveSort(index,-1)"><TableIcon name="chevron-down" :size="14" class="bt-settings-sort-up" /></button><button class="bt-settings-icon" :aria-label="'下移排序规则 '+(index+1)" :disabled="index===sorts.length-1" @click="moveSort(index,1)"><TableIcon name="chevron-down" :size="14" /></button><button class="bt-settings-icon" :aria-label="'删除排序规则 '+(index+1)" @click="removeSort(index)"><TableIcon name="close" :size="14" /></button></div></div>
          <div v-if="!sorts.length" class="bt-settings-empty"><TableIcon name="sort" :size="30"/><p>未设置排序</p><small>添加规则，或点击表头调整排序。</small></div>
        </fieldset>
        <fieldset v-else-if="activeTab==='actions'" class="bt-settings-pane" :disabled="!canPage('actions')"><ActionSettings :disabled="!canPage('actions')" :model-value="presentation.rowActions" :actions="actions" @update:model-value="setPresentation('rowActions',$event)" /></fieldset>
        <fieldset v-else-if="activeTab==='appearance'" class="bt-settings-pane" :disabled="!canPage('appearance')"><AppearanceSettings :model-value="presentation.appearance" :page-sizes="pageSizes" @update:model-value="setPresentation('appearance',$event)" @backup="exportBackup" @restore="restoreInput?.click()" /></fieldset>
        <fieldset v-else-if="activeTab==='toolbar'" class="bt-settings-pane" :disabled="!canPage('toolbar')"><ToolbarSettings :disabled="!canPage('toolbar')" :model-value="presentation.toolbar" :tools="tools" @update:model-value="setPresentation('toolbar',$event)" /></fieldset>
        <input ref="restoreInput" type="file" accept="application/json,.json" hidden aria-label="恢复表格设置文件" @change="restoreBackup" />
        <p v-if="backupError" class="bt-settings-error" role="alert">{{backupError}}</p>
        <div v-if="issues.length||allRuleErrors.length" class="bt-settings-validation-summary" role="alert"><span>{{issues[0]?.message??allRuleErrors[0]}}</span><button class="bt-settings-text" @click="revealChange(issues[0]?.columnId)">查看</button></div>
        <div v-if="colorErrors.length" class="bt-settings-validation-summary" role="status"><span>有 {{colorErrors.length}} 项颜色需要修改</span><button class="bt-settings-text" aria-label="定位颜色错误" @click="revealColorError">查看</button></div>
        <section class="bt-settings-preview" data-testid="settings-preview">
          <header><strong>{{previewMode==='table'?'整表预览':'当前对象预览'}}</strong><span>仅预览，不执行业务操作</span><div class="bt-settings-preview__controls"><div class="bt-settings-segmented"><button :aria-pressed="previewMode==='column'" @click="previewMode='column'">当前对象</button><button :aria-pressed="previewMode==='table'" @click="previewMode='table'">整表</button></div><button class="bt-settings-text" :aria-expanded="previewOpen" @click="previewOpen=!previewOpen">{{previewOpen?'收起预览':'展开预览'}}</button></div></header>
          <div v-if="previewOpen" class="bt-settings-preview__content">
            <label v-if="sortedSamples.length" class="bt-settings-preview__sample">样例<select v-model="sampleIndex" aria-label="预览样例"><option v-for="(item,index) in sortedSamples" :key="index" :value="index">{{sampleName(item,index)}}</option></select></label>
            <div v-if="previewMode==='column'&&activeTab==='actions'" class="bt-preview-action-context"><span v-for="action in previewActions" :key="action.id" :class="{'danger':action.danger}"><TableIcon v-if="action.display!=='text'" :name="action.icon??'file'" :size="14"/><span v-if="action.display!=='icon'">{{action.label}}</span></span></div>
            <div v-else-if="previewMode==='column'&&activeTab==='toolbar'" class="bt-preview-tool-context"><div v-for="scope in (['page','table'] as const).filter(scope=>localTools[scope].length)" :key="scope"><strong>{{scope==='page'?'页面工具栏':'表格工具栏'}}</strong><span v-for="tool in presentTools(localTools[scope],presentation.toolbar[scope])" :key="tool.id"><TableIcon v-if="tool.display!=='text'" :name="tool.icon??'file'" :size="14"/><span v-if="tool.display!=='icon'">{{tool.label}}</span></span></div></div>
            <div v-else class="bt-settings-preview__scroll"><table class="bt-settings-preview__table" :style="{width:previewColumns.reduce((total,column)=>total+editableColumnWidth(column),0)+'px',fontFamily:fontFamilyCss(presentation.appearance.fontFamily),fontSize:presentation.appearance.fontSize+'px',color:presentation.appearance.color}" inert><colgroup><col v-for="column in previewColumns" :key="column.id" :style="{width:editableColumnWidth(column)+'px'}"></colgroup><thead><tr><th v-for="column in previewColumns" :key="column.id" :style="{textAlign:column.align,fontSize:presentation.appearance.headerFontSize+'px',color:presentation.appearance.headerColor,...columnTextCss(column.headerStyle)}">{{column.title}}<small v-if="column.sortable"> ↕</small></th></tr></thead><tbody><tr v-if="displayedRow"><td v-for="column in previewColumns" :key="column.id" :style="{textAlign:column.align,...columnTextCss(column.cellStyle)}"><CellRenderer v-if="previewCell" :value="getValue(displayedRow,column.field)" :row="displayedRow" :column="column" :renderer="previewCell"/><span v-else-if="column.kind==='actions'" class="bt-preview-actions"><span v-for="action in previewActions.filter(action=>action.position!=='more').slice(0,presentation.rowActions.maxInline)" :key="action.id" :class="{'danger':action.danger}">{{action.label}}</span><span v-if="previewActions.length>presentation.rowActions.maxInline">更多⌄</span></span><BusinessCell v-else :row="displayedRow" :column="column" :columns="columns" preview /></td></tr><tr v-else><td :colspan="Math.max(previewColumns.length,1)" class="bt-settings-empty">暂无样例数据</td></tr></tbody></table></div>
          </div>
        </section>
        <p v-if="error" class="bt-settings-error" role="alert">{{error}}</p>
        <footer class="bt-settings-drawer__footer"><div><button class="bt-settings-text" :disabled="!canPage(activeTab)" @click="resetPage">恢复当前页</button><button class="bt-settings-text" :disabled="!tabs.some(tab=>canPage(tab.id))" @click="resetAll">恢复全部</button></div><button class="bt-settings-button" :disabled="saving" @click="emit('cancel')">取消</button><button class="bt-settings-button bt-settings-button--primary" :disabled="!dirty||saving||!!widthError||colorErrors.length>0||issues.length>0||allRuleErrors.length>0" @click="emit('apply')">{{saving?'保存中…':'应用'}}</button></footer>
        <DialogFrame v-if="reviewOpen" title="本次修改" @close="reviewOpen=false"><div class="bt-change-list"><button v-for="(change,id) in changes" :key="id" class="bt-ui-button text" @click="revealChange(String(id))">{{columns.find(column=>column.id===id)?.title??id}}：{{Object.keys(change).map(key=>({title:'名称',visible:'显隐',width:'宽度',fixed:'冻结',order:'顺序',align:'对齐',headerStyle:'表头文字',cellStyle:'单元格文字',mapping:'值映射',numberRule:'数字格式',filter:'列筛选',template:'模板',content:'内容显示'} as Record<string,string>)[key]??key).join('、')}}</button><button v-if="tabs.some(tab=>tab.id==='appearance')&&JSON.stringify(presentation)!==JSON.stringify(basePresentation)" class="bt-ui-button text" @click="reviewOpen=false;openPage('appearance')">表格外观、按钮或工具栏设置</button><button v-if="tabs.some(tab=>tab.id==='sorts')&&sorts.length" class="bt-ui-button text" @click="reviewOpen=false;openPage('sorts')">排序规则</button></div><template #footer><button class="bt-ui-button primary" @click="reviewOpen=false">返回编辑</button></template></DialogFrame>
        <div v-if="discardConfirmation" class="bt-settings-discard-backdrop"><section ref="discardDialog" class="bt-settings-discard" role="alertdialog" aria-modal="true" aria-label="放弃未应用的修改"><h3>修改尚未应用</h3><p>离开后，本次修改不会保存。</p><footer><button class="bt-settings-button" @click="continueEditing">继续编辑</button><button class="bt-settings-button bt-settings-button--primary" @click="emit('cancel')">放弃修改</button></footer></section></div>
      </section>
    </div>
  </Teleport>
</template>
