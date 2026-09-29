<script setup lang="ts">
import {computed,nextTick,onMounted,ref,watch,type VNodeChild} from 'vue'
import type {ColumnConfig,ColumnTextStyle,RowData,SortConfig,UserColumnConfig} from '../types'
import {getColumnWidthBounds,isColumnCapabilityEnabled} from '../config/columns'
import {applySorts} from '../core'
import {columnTextCss,editableColumnWidth} from './settingsTypes'
import TableIcon from './TableIcon.vue'
import FontSelect from './FontSelect.vue'
import ColorSelect from './ColorSelect.vue'
import ColumnRuleEditor from '../features/settings/ColumnRuleEditor.vue'
import ActionSettings from '../features/settings/ActionSettings.vue'
import AppearanceSettings from '../features/settings/AppearanceSettings.vue'
import ToolbarSettings from '../features/settings/ToolbarSettings.vue'
import SettingsPreview from '../features/settings/SettingsPreview.vue'
import SettingsSection from '../features/settings/SettingsSection.vue'
import SettingsRange from '../features/settings/SettingsRange.vue'
import {provideNumericValidation} from '../features/settings/numericValidation'
import {useDragReorder} from '../ui/useDragReorder'
import {useOverlay} from '../ui/useOverlay'
import {useMotion} from '../ui/useMotion'
import {resolvePresentation,availableActions,availableTools,type TablePresentation,type ToolDefinition} from '../features/presentation/model'
import type {SettingsIssue} from '../features/settings/session'
import type {Action} from '../types'
import {cloneData} from '../runtime/value'
import {getColumnSectionAccess,getSettingsColumnFieldAccess,guardSettingsColumnPatch,resolveSettingsPolicy,type SettingsPage,type SettingsPolicy,type ColumnSettingsSection} from '../features/settings/policy'
import type {ColumnCapabilities} from '../config/types'


const props=withDefaults(defineProps<{open?:boolean;settingsPolicy?:SettingsPolicy;tableKey?:string;presentation?:TablePresentation;basePresentation?:TablePresentation;actions?:Action[];tools?:{page:readonly ToolDefinition[];table:readonly ToolDefinition[]};pageSizes?:number[];issues?:SettingsIssue[];changes?:Record<string,UserColumnConfig>;initialColumnId?:string;initialTab?:'columns'|'sorts'|'actions'|'appearance'|'toolbar';columns:ColumnConfig[];baseColumns:ColumnConfig[];sorts:SortConfig[];sortingEnabled:boolean;previewRows:RowData[];previewCell?:(value:unknown,row:RowData,column:ColumnConfig)=>VNodeChild;dirty:boolean;saving:boolean;error:string}>(),{open:true,presentation:()=>resolvePresentation(),basePresentation:()=>resolvePresentation(),actions:()=>[],tools:()=>({page:[],table:[]}),issues:()=>[],changes:()=>({})})
const emit=defineEmits<{afterLeave:[];presentation:[value:TablePresentation];patch:[id:string,patch:UserColumnConfig];reset:[id?:string];sorts:[sorts:SortConfig[]];resetSorts:[];apply:[];cancel:[discarded:boolean];move:[id:string,targetId:string]}>()
const {errors:numericErrors,reset:resetNumericInputs,prune:pruneNumericInputs}=provideNumericValidation()
const selectedId=ref(props.initialColumnId??props.columns.find(column=>column.visible!==false&&!column.fixed&&isColumnCapabilityEnabled(column,'rename'))?.id??props.columns[0]?.id??'')
const selected=computed(()=>props.columns.find(column=>column.id===selectedId.value))
const selectedBase=computed(()=>props.baseColumns.find(column=>column.id===selectedId.value))
const dialog=ref<HTMLElement>(),widthError=ref(''),previewOpen=ref(false),previewMode=ref<'table'|'column'>('column'),sampleIndex=ref(0)
const batchIds=ref<string[]>(selectedId.value?[selectedId.value]:[])
const activeTab=ref<SettingsPage|undefined>(props.initialTab??'columns')
const ruleEditor=ref<InstanceType<typeof ColumnRuleEditor>>(),ruleErrors=ref<Record<string,string[]>>({}),trialRow=ref<RowData>()
const allRuleErrors=computed(()=>Object.values(ruleErrors.value).flat())
const displayedRow=computed(()=>activeTab.value==='columns'&&['number','trial'].includes(activeSection.value??'')?trialRow.value??row.value:row.value)
const pageScrollPositions=new Map<SettingsPage,number>()
const scrollPositions=new Map<string,number>(),columnSections=new Map<string,ColumnSettingsSection>()
const openedSections=ref(new Set<string>())
const sectionKey=(part:string)=>JSON.stringify([selectedId.value,part])
const sectionOpen=(part:string)=>openedSections.value.has(sectionKey(part))
function setSectionOpen(part:string,open:boolean){if(open)openedSections.value.add(sectionKey(part));else openedSections.value.delete(sectionKey(part))}
const activeSection=ref<ColumnSettingsSection|undefined>('basic')
const experienceKey=computed(()=>props.tableKey?'business-table:experience:'+props.tableKey:'')
const sortedSamples=computed(()=>applySorts(props.previewRows,props.sorts,props.columns))
const row=computed(()=>sortedSamples.value[sampleIndex.value]??sortedSamples.value[0])
const sortableColumns=computed(()=>props.columns.filter(column=>column.sortable))
const unusedSortColumns=computed(()=>sortableColumns.value.filter(column=>!props.sorts.some(sort=>sort.field===column.field)))
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
const sectionEntries=[{id:'basic',label:'基本'},{id:'content',label:'内容'},{id:'filter',label:'筛选'},{id:'mapping',label:'映射'},{id:'number',label:'数字'},{id:'template',label:'模板'},{id:'trial',label:'试算'}] as const
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
function pageKey(event:KeyboardEvent){
  if(event.isComposing||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
  event.preventDefault();event.stopPropagation()
  const count=tabs.value.length,current=tabs.value.findIndex(tab=>tab.id===activeTab.value)
  const index=event.key==='Home'?0:event.key==='End'?count-1:(current+(event.key==='ArrowRight'?1:count-1))%count
  const tab=tabs.value[index];if(!tab)return
  openPage(tab.id);void nextTick(()=>dialog.value?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus())
}
const sortReorder=useDragReorder({ids:()=>props.sorts.map(sort=>sort.field),disabled:()=>!canPage('sorts'),move:(id,target)=>{const from=props.sorts.findIndex(sort=>sort.field===id);moveSort(from,props.sorts.findIndex(sort=>sort.field===target)-from)}})
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
function resetColumn(id:string){if(id===selectedId.value&&canResetSelected.value){resetNumericInputs(['columns',id]);clearColorInputs(id);emit('reset',id)}}
function resetStyle(key:StyleKey){if(!can(key))return;resetNumericInputs(['columns',selectedId.value,key]);clearColorInputs(selectedId.value,key);patch({[key]:selectedBase.value?.[key]??{}})}
async function revealColorError(){
  const first=colorErrors.value[0];if(!first)return
  activeTab.value='columns';selectedId.value=first.id;setSectionOpen(first.key,true)
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
const columnReorder=useDragReorder({ids:()=>props.columns.map(column=>column.id),canMove:id=>props.columns.some(column=>column.id===id&&canMove(column)),move:(id,target)=>emit('move',id,target)})
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
  resetNumericInputs([activeTab.value!])
  if(activeTab.value==='columns'){clearColorInputs();ruleErrors.value={};emit('reset')}
  else if(activeTab.value==='sorts')emit('resetSorts')
  else if(activeTab.value){const key=activeTab.value==='actions'?'rowActions':activeTab.value;emit('presentation',{...props.presentation,[key]:cloneData(props.basePresentation[key])})}
}
function resetAll(){
  for(const page of tabs.value)if(canPage(page.id))resetNumericInputs([page.id])
  if(canPage('columns')){clearColorInputs();ruleErrors.value={};emit('reset')}
  if(canPage('sorts'))emit('resetSorts')
  const next=cloneData(props.presentation)
  for(const key of ['appearance','rowActions','toolbar'] as const)if(canPage(key==='rowActions'?'actions':key))Object.assign(next,{[key]:cloneData(props.basePresentation[key])})
  emit('presentation',next)
}
function setPresentation(key:'appearance'|'rowActions'|'toolbar',value:unknown){if(canPage(key==='rowActions'?'actions':key))emit('presentation',{...props.presentation,[key]:value})}
function showSection(section:ColumnSettingsSection){if(!sectionAccess(section).visible)return;activeSection.value=section;columnSections.set(selectedId.value,section);if(section==='basic'){setSectionOpen('basic',true);void nextTick(()=>dialog.value?.querySelector('.bt-settings-detail')?.scrollTo?.({top:0,behavior:'smooth'}))}else void ruleEditor.value?.reveal(section)}
function revealChange(id?:string){openPage('columns');if(id)selectedId.value=id;void nextTick(()=>{const section=sections.value[0]?.id;if(section)showSection(section)})}
function setRuleErrors(id:string,errors:string[]){if(JSON.stringify(ruleErrors.value[id]??[])===JSON.stringify(errors))return;if(errors.length)ruleErrors.value[id]=errors;else delete ruleErrors.value[id]}
function rememberScroll(){const pane=dialog.value?.querySelector<HTMLElement>('.bt-settings-detail');if(pane)scrollPositions.set(selectedId.value,pane.scrollTop)}
function selectColumn(id:string){rememberScroll();selectedId.value=id}
function rememberPreview(){try{if(experienceKey.value)localStorage.setItem(experienceKey.value,JSON.stringify({previewMode:previewMode.value}))}catch{/* Experience persistence is optional. */}}
watch([previewOpen,previewMode],rememberPreview)

function requestClose(){
  if(!props.open||props.saving)return
  emit('cancel',props.dirty||colorErrors.value.length>0||allRuleErrors.value.length>0||Object.keys(numericErrors.value).length>0)
}
function keydown(event:KeyboardEvent){
  if(event.defaultPrevented||event.isComposing||!overlay.isTop())return
  if(event.key==='Escape'){event.stopPropagation();event.preventDefault();requestClose();return}
  if(event.key!=='Tab'||!dialog.value)return
  const scope=dialog.value
  const elements=[...(scope?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')??[])].filter(element=>!element.closest('[inert]')&&element.getClientRects().length>0)
  const first=elements[0],last=elements.at(-1)
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
}
watch(activeTab,(tab,previous)=>{
  const pane=dialog.value?.querySelector<HTMLElement>('.bt-settings-detail,.bt-settings-page,.bt-settings-sort-page')
  if(previous&&pane)pageScrollPositions.set(previous,pane.scrollTop)
  if(previous==='columns')rememberScroll()
  void nextTick(()=>{
    const next=dialog.value?.querySelector<HTMLElement>('.bt-settings-detail,.bt-settings-page,.bt-settings-sort-page')
    next?.scrollTo?.({top:tab==='columns'?scrollPositions.get(selectedId.value)??0:tab?pageScrollPositions.get(tab)??0:0})
  })
})
watch(selectedId,id=>{widthError.value='';trialRow.value=undefined;activeSection.value=sections.value.some(section=>section.id===columnSections.get(id))?columnSections.get(id):sections.value[0]?.id;void nextTick(()=>dialog.value?.querySelector('.bt-settings-detail')?.scrollTo?.({top:scrollPositions.get(id)??0}))})
watch(()=>props.initialColumnId,id=>{if(id)selectColumn(id)})
watch(()=>props.initialTab,tab=>{if(tab&&tabs.value.some(item=>item.id===tab))activeTab.value=tab})
watch(tabs,value=>{if(!value.some(tab=>tab.id===activeTab.value))activeTab.value=value[0]?.id},{immediate:true})
watch([()=>props.columns,settingsPolicy,tabs],()=>pruneNumericInputs(path=>{
  if(path[0]!=='columns')return canPage(path[0] as SettingsPage)
  const column=props.columns.find(column=>column.id===path[1]);if(!column)return false
  const access=fieldAccess(column,path[2] as keyof UserColumnConfig)
  return access.visible&&!access.disabled
}),{deep:true})
watch(sections,value=>{if(!value.some(section=>section.id===activeSection.value))activeSection.value=value[0]?.id},{immediate:true})
watch(sampleIndex,()=>{trialRow.value=undefined})
const overlay=useOverlay(dialog,requestClose),motion=useMotion('drawer')
function beforeLeave(element:Element){element.setAttribute('inert','');overlay.beforeLeave()}
function afterLeave(){overlay.afterLeave();emit('afterLeave')}
function cancelLeave(element:Element){element.removeAttribute('inert');motion.cancel(element);overlay.leaveCancelled()}
onMounted(()=>{try{const saved=experienceKey.value?JSON.parse(localStorage.getItem(experienceKey.value)??'null'):null;if(saved){previewMode.value=saved.previewMode==='table'?'table':'column'}}catch{}})
</script>
<template>
  <Teleport to="body">
    <Transition appear :css="false" @enter="motion.enter" @leave="motion.leave" @enter-cancelled="motion.cancel" @before-leave="beforeLeave" @after-leave="afterLeave" @leave-cancelled="cancelLeave">
    <div v-if="open" class="bt-settings-overlay" @click.self="requestClose">
      <section ref="dialog" class="bt-settings-drawer" data-testid="settings-drawer" role="dialog" aria-modal="true" aria-label="表格设置" tabindex="-1" @keydown="keydown">
        <header class="bt-settings-drawer__header"><div><h2>表格设置 <span v-if="activeTab&&settingsPolicy.pages[activeTab].disabled" class="bt-settings-readonly">只读</span></h2></div><button class="bt-settings-icon" aria-label="关闭表格设置" :disabled="saving" @click="requestClose"><TableIcon name="close" :size="16" /></button></header>
        <nav class="bt-settings-tabs" role="tablist" aria-label="表格设置分类" @keydown="pageKey"><button v-for="tab in tabs" :key="tab.id" :aria-label="tab.label" :class="{'is-active':activeTab===tab.id}" role="tab" :aria-selected="activeTab===tab.id" :tabindex="activeTab===tab.id?0:-1" @click="activeTab=tab.id">{{tab.label}}<span v-if="tab.id==='sorts'&&sorts.length" class="bt-settings-tab-count">{{sorts.length}}</span></button></nav>
        <div v-if="activeTab==='columns'" class="bt-settings-editor">
          <aside class="bt-settings-sidebar">
            <div v-if="batchColumns.length" class="bt-settings-sidebar__caption"><strong>批量样式</strong></div>
            <label v-if="batchColumns.length" class="bt-settings-check bt-settings-sidebar__all"><input type="checkbox" aria-label="全选样式列" :disabled="!batchColumns.some(batchEnabled)" :checked="batchColumns.length>0&&batchColumns.every(column=>batchIds.includes(column.id))" :indeterminate="batchColumns.some(column=>batchIds.includes(column.id))&&!batchColumns.every(column=>batchIds.includes(column.id))" @change="batchIds=($event.target as HTMLInputElement).checked?batchColumns.filter(batchEnabled).map(column=>column.id):[]">全选样式列</label>
            <div :ref="columnReorder.setList" class="bt-settings-sidebar__list">
              <div v-for="column in columns" :key="column.id" class="bt-settings-pick" :class="{'is-active':selectedId===column.id}" v-bind="columnReorder.row(column.id)">
                <input v-if="batchColumns.some(item=>item.id===column.id)" type="checkbox" :disabled="!batchEnabled(column)" :aria-label="'批量样式 '+column.title" :checked="batchIds.includes(column.id)" @change="toggleBatch(column.id,($event.target as HTMLInputElement).checked)">
                <button v-if="fieldAccess(column,'order').visible" class="bt-settings-icon bt-settings-grip" :disabled="!canMove(column)" :aria-label="'拖动排序 '+column.title" v-bind="columnReorder.handle(column.id)" @keydown="moveKey(column.id,$event)"><TableIcon name="grip" :size="12" /></button>
                <button class="bt-settings-pick__label" :aria-label="'编辑列 '+column.title" @click="selectColumn(column.id)"><span>{{column.title}}</span><small :title="column.id===column.field?column.id:column.id+' · '+column.field">{{column.id===column.field?column.id:column.id+' · '+column.field}}</small></button>
              </div>
            </div>
          </aside>
          <main v-if="selected" class="bt-settings-column-editor">
            <div class="bt-settings-editor-header"><div class="bt-settings-detail__heading"><h3>当前编辑：{{selected.title}}</h3><div class="bt-settings-column-meta"><span>{{selected.type==='number'||selected.type==='currency'?'数值字段':'文本字段'}}</span><span class="bt-settings-column-status" :class="{'is-hidden':selected.visible===false}">{{selected.visible===false?'隐藏中':'显示中'}}</span><button v-if="settingsPolicy.pages.columns.visible" class="bt-settings-text" :disabled="!canResetSelected" @click="resetColumn(selected.id)">恢复此列</button></div></div>
            <nav v-if="sections.length" class="bt-settings-sections" aria-label="列设置内容"><button v-for="section in sections" :key="section.id" :class="{'is-active':activeSection===section.id}" @click="showSection(section.id)">{{section.label}}<small v-if="sectionAccess(section.id).disabled">只读</small></button></nav></div>
            <div class="bt-settings-detail" @scroll.passive="rememberScroll">
            <SettingsSection v-if="sectionAccess('basic').visible" title="基本" :open="sectionOpen('basic')" @update:open="setSectionOpen('basic',$event)">
              <div class="bt-settings-form">
                <label v-if="visible('rename')" class="bt-settings-field bt-settings-field--long"><span>显示名称</span><input aria-label="显示名称" :value="selected.title" :disabled="!can('rename')" @input="patch({title:($event.target as HTMLInputElement).value})"><small v-if="selectedBase&&selectedBase.title!==selected.title">原名称：{{selectedBase.title}}</small></label>
                <div v-if="visible('width')" class="bt-settings-field bt-settings-field--range"><span>列宽（px）</span><SettingsRange :path="['columns',selected.id,'width']" :key="selected.id" label="列宽（px）" :slider-label="selected.title+'列宽'" :min="getColumnWidthBounds(selected).min" :max="getColumnWidthBounds(selected).max" step="any" unit="px" :model-value="editableColumnWidth(selected)" :disabled="!can('width')" @update:model-value="width(String($event))" /></div>
              </div>
              <div class="bt-settings-inline"><label v-if="visible('visible')" class="bt-settings-check"><input type="checkbox" aria-label="显示此列" :checked="selected.visible!==false" :disabled="!can('visible')" @change="patch({visible:($event.target as HTMLInputElement).checked})">显示此列</label><label v-if="visible('sortable')" class="bt-settings-check"><input type="checkbox" aria-label="允许排序" :checked="!!selected.sortable" :disabled="!can('sortable')" @change="patch({sortable:($event.target as HTMLInputElement).checked})">允许排序</label><span v-if="visible('fixed')" class="bt-settings-detail-pins">冻结位置<button v-for="side in ['left','right'] as const" :key="side" class="bt-settings-icon" :class="{'is-active':selected.fixed===side}" :disabled="!canPin(side)" :title="(side==='left'?'左冻结 ':'右冻结 ')+selected.title" :aria-pressed="selected.fixed===side" @click="pin(side)"><TableIcon :name="'pin-'+side" :size="15" /></button></span></div>
            </SettingsSection>
            <div v-if="batchIds.length>1&&(can('headerStyle')||can('cellStyle'))" class="bt-settings-batch"><span>已选择 {{batchIds.length}} 列</span><button class="bt-settings-text" @click="copyStyles">将当前文字样式应用到勾选列</button></div>
            <SettingsSection v-for="section in visibleStyles" :key="section.key" :title="section.title" :open="sectionOpen(section.key)" @update:open="setSectionOpen(section.key,$event)">
              <template #actions><button class="bt-settings-text" :disabled="!can(section.key)" @click="resetStyle(section.key)">恢复</button></template>
              <div class="bt-settings-form">
                <div class="bt-settings-field"><span>字体</span><FontSelect :label="section.title" :model-value="selected[section.key]?.fontFamily??''" :disabled="!can(section.key)" @update:model-value="style(section.key,'fontFamily',$event)" /></div>
                <div class="bt-settings-field bt-settings-field--range"><span>字号</span><SettingsRange :path="['columns',selected.id,section.key,'fontSize']" :key="selected.id+section.key" :label="section.title+'字号'" :min="10" :max="32" unit="px" :model-value="selected[section.key]?.fontSize" :inherited-value="section.key==='headerStyle'?presentation.appearance.headerFontSize:presentation.appearance.fontSize" :disabled="!can(section.key)" @update:model-value="style(section.key,'fontSize',$event===undefined?'':String($event))" /></div>
                <label class="bt-settings-field bt-settings-field--short"><span>字重</span><select :aria-label="section.title+'字重'" :value="selected[section.key]?.fontWeight??''" :disabled="!can(section.key)" @change="style(section.key,'fontWeight',($event.target as HTMLSelectElement).value)"><option value="">默认</option><option value="normal">常规</option><option value="500">中等</option><option value="600">半粗</option><option value="bold">粗体</option></select></label>
                <div class="bt-settings-field"><span>对齐方式</span><div class="bt-settings-segmented" role="group" :aria-label="section.title+'对齐方式'" @keydown="alignmentKey(section.key,$event)"><button :tabindex="!selected[section.key]?.align?0:-1" :aria-label="section.title+'默认对齐'" :aria-pressed="!selected[section.key]?.align" :disabled="!can(section.key)" @click="style(section.key,'align','')">默认</button><button v-for="align in alignments" :key="align.id" :tabindex="selected[section.key]?.align===align.id?0:-1" :aria-label="section.title+align.label" :aria-pressed="selected[section.key]?.align===align.id" :disabled="!can(section.key)" @click="style(section.key,'align',align.id)"><TableIcon :name="'align-'+align.id" :size="15" /></button></div></div>
                <div class="bt-settings-field bt-settings-field--color bt-settings-color"><span>文字颜色</span><ColorSelect :label="section.title" :model-value="colorValue(section.key)" :disabled="!can(section.key)" @update:model-value="colorInput(section.key,$event)" /></div>
              </div>
            </SettingsSection>
            <KeepAlive><ColumnRuleEditor v-if="sections.some(section=>section.id!=='basic')" :settings-policy="settingsPolicy" :actions-visible="tabs.some(tab=>tab.id==='actions')" :key="selected.id" ref="ruleEditor" :column="selected" :columns="columns" :row="row" @patch="patch" @validation="setRuleErrors(selectedId,$event)" @trial="trialRow=$event" @actions="openPage('actions')" /></KeepAlive>
            </div>
          </main>
          <div v-else class="bt-settings-empty">暂无可设置的列</div>
        </div>
        <fieldset v-else-if="activeTab==='sorts'" :ref="sortReorder.setList" class="bt-settings-sort-page bt-settings-control-group" :disabled="!canPage('sorts')">
          <div class="bt-settings-sort-heading"><div><h3>按优先级排序</h3><p>从上到下依次比较。空值放最后，排序后再分页。</p></div><button class="bt-settings-button" :disabled="!unusedSortColumns.length" @click="addSort"><TableIcon name="plus" :size="14" />添加排序规则</button></div>
          <div v-for="(sort,index) in sorts" :key="sort.field" class="bt-settings-sort-rule" v-bind="sortReorder.row(sort.field)"><button class="bt-settings-icon bt-settings-sort-grip" :aria-label="'拖动排序规则 '+(index+1)" v-bind="sortReorder.handle(sort.field)" :disabled="!canPage('sorts')"><TableIcon name="grip" :size="12" /></button><span class="bt-settings-sort-index">{{index+1}}</span><label class="bt-settings-field"><span>排序字段</span><select :aria-label="'排序字段 '+(index+1)" :value="sort.field" @change="changeSort(index,{field:($event.target as HTMLSelectElement).value})"><option v-for="column in sortableColumns" :key="column.id" :value="column.field" :disabled="sorts.some((other,position)=>position!==index&&other.field===column.field)">{{column.title}}</option></select></label><label class="bt-settings-field"><span>顺序</span><select :aria-label="'排序方式 '+(index+1)" :value="sort.order" @change="changeSort(index,{order:($event.target as HTMLSelectElement).value as 'asc'|'desc'})"><option value="asc">升序</option><option value="desc">降序</option></select></label><div class="bt-settings-sort-actions"><button class="bt-settings-icon" :aria-label="'上移排序规则 '+(index+1)" :disabled="index===0" @click="moveSort(index,-1)"><TableIcon name="chevron-down" :size="14" class="bt-settings-sort-up" /></button><button class="bt-settings-icon" :aria-label="'下移排序规则 '+(index+1)" :disabled="index===sorts.length-1" @click="moveSort(index,1)"><TableIcon name="chevron-down" :size="14" /></button><button class="bt-settings-icon" :aria-label="'删除排序规则 '+(index+1)" @click="removeSort(index)"><TableIcon name="close" :size="14" /></button></div></div>
          <div v-if="!sorts.length" class="bt-settings-empty"><TableIcon name="sort" :size="30"/><p>未设置排序</p><small>添加规则，或点击表头调整排序。</small></div>
        </fieldset>
        <div v-else-if="activeTab==='actions'" class="bt-settings-pane"><ActionSettings :disabled="!canPage('actions')" :model-value="presentation.rowActions" :actions="actions" @update:model-value="setPresentation('rowActions',$event)" /></div>
        <div v-else-if="activeTab==='appearance'" class="bt-settings-pane"><AppearanceSettings :columns="columns" :disabled="!canPage('appearance')" :model-value="presentation.appearance" :page-sizes="pageSizes" @update:model-value="setPresentation('appearance',$event)" /></div>
        <div v-else-if="activeTab==='toolbar'" class="bt-settings-pane"><ToolbarSettings :disabled="!canPage('toolbar')" :model-value="presentation.toolbar" :tools="tools" @update:model-value="setPresentation('toolbar',$event)" /></div>
        <div v-if="issues.length||allRuleErrors.length" class="bt-settings-validation-summary" role="alert"><span>{{issues[0]?.message??allRuleErrors[0]}}</span><button class="bt-settings-text" @click="revealChange(issues[0]?.columnId)">查看</button></div>
        <div v-if="colorErrors.length" class="bt-settings-validation-summary" role="status"><span>有 {{colorErrors.length}} 项颜色需要修改</span><button class="bt-settings-text" aria-label="定位颜色错误" @click="revealColorError">查看</button></div>
        <div v-if="Object.keys(numericErrors).length" class="bt-settings-validation-summary" role="alert">{{Object.values(numericErrors)[0]}}</div>
        <SettingsPreview v-model:mode="previewMode" v-model:open="previewOpen" v-model:sample-index="sampleIndex" :tab="activeTab" :section="activeSection" :selected="selected" :columns="columns" :rows="sortedSamples" :row="displayedRow" :presentation="presentation" :actions="actions" :tools="tools" :preview-cell="previewCell" />
        <p v-if="error" class="bt-settings-error" role="alert">{{error}}</p>
        <footer class="bt-settings-drawer__footer"><div><button class="bt-settings-text" :disabled="!canPage(activeTab)" @click="resetPage">恢复当前页</button><button class="bt-settings-text" :disabled="!tabs.some(tab=>canPage(tab.id))" @click="resetAll">恢复全部</button></div><button class="bt-settings-button" :disabled="saving" @click="requestClose">取消</button><button class="bt-settings-button bt-settings-button--primary" :disabled="!dirty||saving||!!widthError||Object.keys(numericErrors).length>0||colorErrors.length>0||issues.length>0||allRuleErrors.length>0" @click="emit('apply')">{{saving?'保存中…':'应用'}}</button></footer>
      </section>
    </div>
    </Transition>
  </Teleport>
</template>
