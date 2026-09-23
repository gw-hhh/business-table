<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import type {ColumnConfig,UserColumnConfig} from '../types'
import type {ColumnSettingsContext} from './settingsTypes'
import TableIcon from './TableIcon.vue'
import ColumnSettingsDrawer from './ColumnSettingsDrawer.vue'
import './column-settings.css'
import '../features/settings/settings-pages.css'
import {cloneData} from '../runtime/value'
import {resolvePresentation} from '../features/presentation/model'
import {columnDifference,validateSettings,settingsFields,settingsValue} from '../features/settings/session'
import {getSettingsColumnFieldAccess,guardSettingsColumnPatch,guardSettingsCommit,resolveSettingsPolicy,type SettingsPage} from '../features/settings/policy'

const props=defineProps<{context:ColumnSettingsContext}>()
const copy=(columns:ColumnConfig[])=>cloneData(columns)
const original=copy(props.context.columns)
const originalSorts=(props.context.sorts??[]).map(sort=>({...sort}))
const sortDraft=ref(originalSorts.map(sort=>({...sort})))
const draft=ref(copy(original)),drawer=ref(props.context.openMode==='drawer'),panel=ref<HTMLElement>()
const saving=ref(false),error=ref(''),draggedId=ref<string>()
const fields=settingsFields
const value=settingsValue
const presentationDraft=ref(resolvePresentation(props.context.presentation))
const originalPresentation=resolvePresentation(props.context.presentation)
const settingsPolicy=computed(()=>props.context.settingsPolicy??resolveSettingsPolicy())
const canPage=(page:SettingsPage)=>settingsPolicy.value.pages[page].visible&&!settingsPolicy.value.pages[page].disabled
const fieldAccess=(column:ColumnConfig,field:keyof UserColumnConfig)=>getSettingsColumnFieldAccess(column,field,settingsPolicy.value)
const canField=(column:ColumnConfig,field:keyof UserColumnConfig)=>{const access=fieldAccess(column,field);return access.visible&&!access.disabled}
const patches=computed(()=>Object.fromEntries(Object.entries(columnDifference(original,draft.value)).flatMap(([id,change])=>{const source=original.find(column=>column.id===id);const guarded=source?guardSettingsColumnPatch(source,change,settingsPolicy.value):{};return Object.keys(guarded).length?[[id,guarded]]:[]})))
const issues=computed(()=>validateSettings(draft.value))
const sortsDirty=computed(()=>canPage('sorts')&&!!props.context.setSorts&&JSON.stringify(sortDraft.value)!==JSON.stringify(originalSorts))
const dirty=computed(()=>Object.keys(patches.value).length>0||sortsDirty.value||JSON.stringify(presentationDraft.value)!==JSON.stringify(originalPresentation))
const togglable=computed(()=>draft.value.filter(column=>canField(column,'visible')))
const visibilityDeclared=computed(()=>draft.value.some(column=>fieldAccess(column,'visible').visible))
const canResetColumns=computed(()=>draft.value.some(column=>fields.some(field=>canField(column,field))))
const allVisible=computed(()=>togglable.value.every(column=>column.visible!==false))
const someVisible=computed(()=>togglable.value.some(column=>column.visible!==false)&&!allVisible.value)
function patch(id:string,changes:UserColumnConfig){
  const source=original.find(column=>column.id===id),target=draft.value.find(column=>column.id===id)
  if(!source||!target)return
  Object.assign(target,guardSettingsColumnPatch(source,changes,settingsPolicy.value))
}
function all(visible:boolean){togglable.value.forEach(column=>patch(column.id,{visible}))}
function canPin(column:ColumnConfig,side:'left'|'right'){return Object.hasOwn(guardSettingsColumnPatch(column,{fixed:column.fixed===side?false:side},settingsPolicy.value),'fixed')}
function pin(column:ColumnConfig,side:'left'|'right'){patch(column.id,{fixed:column.fixed===side?false:side})}
function move(id:string,targetId:string){
  const movable=draft.value.filter(column=>canField(column,'order'))
  const from=movable.findIndex(column=>column.id===id),to=movable.findIndex(column=>column.id===targetId)
  if(from<0||to<0||from===to)return
  const [column]=movable.splice(from,1);movable.splice(to,0,column!)
  let index=0
  draft.value=draft.value.map(column=>canField(column,'order')?movable[index++]!:column)
}
function moveTarget(id:string,offset:number){
  const movable=draft.value.filter(column=>canField(column,'order'))
  const index=movable.findIndex(column=>column.id===id)
  return index<0?undefined:movable[index+offset]
}
function moveStep(id:string,offset:number){const target=moveTarget(id,offset);if(target)move(id,target.id)}
function moveKey(id:string,event:KeyboardEvent){
  if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return
  event.preventDefault()
  const movable=draft.value.filter(column=>canField(column,'order')),index=movable.findIndex(column=>column.id===id)
  const target=movable[index+(event.key==='ArrowUp'?-1:1)]
  if(target)move(id,target.id)
}
function drop(id:string){if(draggedId.value)move(draggedId.value,id);draggedId.value=undefined}
function reset(id?:string){
  const bases=props.context.baseColumns??original
  draft.value.forEach(column=>{
    if(id&&column.id!==id)return
    const base=bases.find(item=>item.id===column.id)
    if(!base)return
    const defaults:Record<string,unknown>={}
    fields.forEach(key=>{defaults[key]=value(base,key)})
    if(defaults.width===undefined)defaults.width=Math.max(base.minWidth??80,160)
    patch(column.id,defaults)
  })
  if(!id){
    const movable=draft.value.filter(column=>canField(column,'order')).sort((a,b)=>bases.findIndex(c=>c.id===a.id)-bases.findIndex(c=>c.id===b.id))
    let index=0;draft.value=draft.value.map(column=>canField(column,'order')?movable[index++]!:column)
  }
}
async function apply(){
  if(saving.value)return
  if(issues.value.length){error.value=issues.value[0]!.message;return}
  saving.value=true;error.value=''
  try{
    const changes=patches.value
    if(props.context.commit){await props.context.commit({columns:cloneData(changes),sorts:cloneData(canPage('sorts')?sortDraft.value:originalSorts),presentation:guardPresentation(presentationDraft.value)})}
    else {
    if(Object.keys(changes).length){
      if(props.context.apply)await props.context.apply(changes)
      else for(const [id,change] of Object.entries(changes))await props.context.patch(id,change)
    }
    if(sortsDirty.value)await props.context.setSorts?.(sortDraft.value.map(sort=>({...sort})))
    }
    props.context.close()
  }catch(cause){error.value=cause instanceof Error?cause.message:'设置保存失败，请重试。'}
  finally{saving.value=false}
}
function guardPresentation(value:unknown){
  return guardSettingsCommit({columns:{},sorts:[],presentation:resolvePresentation(value,originalPresentation)},{columns:original,sorts:originalSorts,presentation:originalPresentation},settingsPolicy.value).presentation
}
function updatePresentation(value:unknown){presentationDraft.value=guardPresentation(value)}
function updateSorts(value:typeof sortDraft.value){if(canPage('sorts'))sortDraft.value=value}
function restoreBackup(input:{columns?:Record<string,UserColumnConfig>;sorts?:typeof sortDraft.value;presentation?:unknown}){
  for(const [id,change] of Object.entries(input.columns??{}))patch(id,change)
  const order=input.columns??{}
  const movable=draft.value.filter(column=>canField(column,'order')).sort((a,b)=>(order[a.id]?.order??draft.value.indexOf(a))-(order[b.id]?.order??draft.value.indexOf(b)))
  let position=0;draft.value=draft.value.map(column=>canField(column,'order')?movable[position++]!:column)
  if(input.sorts)updateSorts(cloneData(input.sorts).filter(sort=>draft.value.some(column=>column.field===sort.field&&column.sortable)))
  if(input.presentation)updatePresentation(input.presentation)
}
function cancel(){if(!saving.value)props.context.close()}
function outside(event:PointerEvent){
  if(drawer.value||!panel.value)return
  const target=event.target as Element|null
  if(target&&!panel.value.contains(target)&&!target.closest('[data-testid="column-settings"],[data-testid="table-settings"]'))cancel()
}
watch([()=>props.context.openMode,()=>settingsPolicy.value.pages.columns.visible],([mode,columnsVisible])=>{drawer.value=mode==='drawer'||!columnsVisible},{immediate:true})
let previousFocus:HTMLElement|null=null
onMounted(()=>{previousFocus=document.activeElement as HTMLElement;document.addEventListener('pointerdown',outside);void nextTick(()=>{if(!drawer.value)panel.value?.focus()})})
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',outside);if(previousFocus?.isConnected)previousFocus.focus()})
</script>
<template>
  <ColumnSettingsDrawer v-if="drawer" :settings-policy="settingsPolicy" :table-key="context.tableKey" :presentation="presentationDraft" :base-presentation="context.basePresentation" :actions="context.actions??[]" :tools="context.tools??{page:[],table:[]}" :page-sizes="context.pageSizeOptions" :issues="issues" :changes="patches" :initial-column-id="context.selectedColumnId" :initial-tab="context.initialTab" @presentation="updatePresentation" @restore="restoreBackup" :columns="draft" :base-columns="context.baseColumns??original" :sorts="sortDraft" :sorting-enabled="!!context.setSorts" :preview-rows="context.previewRows??[]" :preview-cell="context.previewCell" :dirty="dirty" :saving="saving" :error="error" @patch="patch" @reset="reset" @sorts="updateSorts" @reset-sorts="updateSorts(originalSorts.map(sort=>({...sort})))" @apply="apply" @cancel="cancel" @move="move" />
  <aside v-else-if="settingsPolicy.pages.columns.visible" ref="panel" class="bt-column-popup" data-testid="column-panel" role="dialog" aria-label="列设置" tabindex="-1" @keydown.esc.stop.prevent="cancel">
    <div v-if="visibilityDeclared" class="bt-column-popup__all"><label><input type="checkbox" aria-label="显示全部列" :checked="allVisible" :indeterminate="someVisible" :disabled="!togglable.length" @change="all(($event.target as HTMLInputElement).checked)">全部</label></div>
    <div class="bt-column-popup__list">
      <div v-for="column in draft" :key="column.id" class="bt-column-popup__row" :class="{'is-hidden':column.visible===false}" @dragover.prevent @drop.prevent="drop(column.id)">
        <input v-if="fieldAccess(column,'visible').visible" type="checkbox" :checked="column.visible!==false" :disabled="!canField(column,'visible')" :aria-label="'显示'+column.title" @change="patch(column.id,{visible:($event.target as HTMLInputElement).checked})">
        <button v-if="fieldAccess(column,'order').visible" class="bt-settings-icon bt-column-popup__grip" :aria-label="'拖动排序 '+column.title" :disabled="!canField(column,'order')" :draggable="canField(column,'order')" title="拖动排序，或使用上下方向键" @dragstart="draggedId=column.id" @dragend="draggedId=undefined" @keydown="moveKey(column.id,$event)"><TableIcon name="grip" :size="12" /></button>
        <span class="bt-column-popup__name">{{column.title}}</span>
        <div v-if="fieldAccess(column,'fixed').visible" class="bt-column-popup__pins">
          <button v-for="side in ['left','right'] as const" :key="side" class="bt-settings-icon" :class="{'is-active':column.fixed===side}" :disabled="!canPin(column,side)" :title="(side==='left'?'左冻结 ':'右冻结 ')+column.title" :aria-pressed="column.fixed===side" @click="pin(column,side)"><TableIcon :name="'pin-'+side" :size="14" /></button>
        </div>
        <div v-if="fieldAccess(column,'order').visible" class="bt-column-popup__moves"><button v-for="offset in [-1,1]" :key="offset" type="button" class="bt-settings-icon" :aria-label="(offset<0?'上移 ':'下移 ')+column.title" :disabled="!moveTarget(column.id,offset)" @click="moveStep(column.id,offset)"><TableIcon :name="offset<0?'chevron-up':'chevron-down'" :size="12" /></button></div>
      </div>
    </div>
    <p v-if="error||issues.length" class="bt-settings-error" role="alert">{{error||issues[0]?.message}}</p>
    <button v-if="Object.values(settingsPolicy.pages).some(page=>page.visible)" class="bt-column-popup__more bt-settings-text" @click="drawer=true"><TableIcon name="settings" :size="14" />更多设置</button>
    <footer class="bt-column-popup__footer"><button class="bt-settings-text bt-settings-muted" :disabled="!canResetColumns" @click="reset()">恢复默认</button><span></span><button class="bt-settings-text" :disabled="saving" @click="cancel">取消</button><button class="bt-settings-text" :disabled="saving||issues.length>0" @click="apply">{{saving?'保存中…':'确认'}}</button></footer>
  </aside>
</template>
