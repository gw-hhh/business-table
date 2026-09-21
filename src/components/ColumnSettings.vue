<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import type {ColumnConfig,UserColumnConfig} from '../types'
import {guardColumnPatch,isColumnCapabilityEnabled} from '../config/columns'
import type {ColumnSettingsContext} from './settingsTypes'
import TableIcon from './TableIcon.vue'
import ColumnSettingsDrawer from './ColumnSettingsDrawer.vue'
import './column-settings.css'

const props=defineProps<{context:ColumnSettingsContext}>()
const copy=(columns:ColumnConfig[])=>columns.map(column=>({...column,headerStyle:column.headerStyle?{...column.headerStyle}:undefined,cellStyle:column.cellStyle?{...column.cellStyle}:undefined}))
const original=copy(props.context.columns)
const originalSorts=(props.context.sorts??[]).map(sort=>({...sort}))
const sortDraft=ref(originalSorts.map(sort=>({...sort})))
const draft=ref(copy(original)),drawer=ref(props.context.openMode==='drawer'),panel=ref<HTMLElement>()
const saving=ref(false),error=ref(''),draggedId=ref<string>()
const fields=['title','visible','width','fixed','align','sortable','headerStyle','cellStyle'] as const
function value(column:ColumnConfig,key:typeof fields[number]){
  if(key==='visible')return column.visible??true
  if(key==='fixed')return column.fixed??false
  if(key==='align')return column.align??'left'
  if(key==='sortable')return column.sortable??false
  if(key==='headerStyle'||key==='cellStyle')return column[key]??{}
  return column[key]
}
function equal(a:unknown,b:unknown){
  if(a===b)return true
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false
  const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>
  return Object.keys({...aa,...bb}).every(key=>aa[key]===bb[key])
}
const patches=computed(()=>{
  const result:Record<string,UserColumnConfig>=Object.create(null)
  draft.value.forEach((column,index)=>{
    const source=original.find(item=>item.id===column.id)!
    const patch:Record<string,unknown>={}
    fields.forEach(key=>{if(!equal(value(column,key),value(source,key)))patch[key]=value(column,key)})
    if(index!==original.findIndex(item=>item.id===column.id))patch.order=index
    const guarded=guardColumnPatch(source,patch)
    if(Object.keys(guarded).length)result[column.id]=guarded
  })
  return result
})
const sortsDirty=computed(()=>!!props.context.setSorts&&JSON.stringify(sortDraft.value)!==JSON.stringify(originalSorts))
const dirty=computed(()=>Object.keys(patches.value).length>0||sortsDirty.value)
const togglable=computed(()=>draft.value.filter(column=>isColumnCapabilityEnabled(column,'visible')))
const allVisible=computed(()=>togglable.value.every(column=>column.visible!==false))
const someVisible=computed(()=>togglable.value.some(column=>column.visible!==false)&&!allVisible.value)
function patch(id:string,changes:UserColumnConfig){
  const source=original.find(column=>column.id===id),target=draft.value.find(column=>column.id===id)
  if(!source||!target)return
  Object.assign(target,guardColumnPatch(source,changes))
}
function all(visible:boolean){togglable.value.forEach(column=>patch(column.id,{visible}))}
function canPin(column:ColumnConfig,side:'left'|'right'){return Object.hasOwn(guardColumnPatch(column,{fixed:column.fixed===side?false:side}),'fixed')}
function pin(column:ColumnConfig,side:'left'|'right'){patch(column.id,{fixed:column.fixed===side?false:side})}
function move(id:string,targetId:string){
  const movable=draft.value.filter(column=>isColumnCapabilityEnabled(column,'order'))
  const from=movable.findIndex(column=>column.id===id),to=movable.findIndex(column=>column.id===targetId)
  if(from<0||to<0||from===to)return
  const [column]=movable.splice(from,1);movable.splice(to,0,column!)
  let index=0
  draft.value=draft.value.map(column=>isColumnCapabilityEnabled(column,'order')?movable[index++]!:column)
}
function moveKey(id:string,event:KeyboardEvent){
  if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return
  event.preventDefault()
  const movable=draft.value.filter(column=>isColumnCapabilityEnabled(column,'order')),index=movable.findIndex(column=>column.id===id)
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
    const movable=draft.value.filter(column=>isColumnCapabilityEnabled(column,'order')).sort((a,b)=>bases.findIndex(c=>c.id===a.id)-bases.findIndex(c=>c.id===b.id))
    let index=0;draft.value=draft.value.map(column=>isColumnCapabilityEnabled(column,'order')?movable[index++]!:column)
  }
}
async function apply(){
  if(saving.value)return
  saving.value=true;error.value=''
  try{
    const changes=patches.value
    if(Object.keys(changes).length){
      if(props.context.apply)await props.context.apply(changes)
      else for(const [id,change] of Object.entries(changes))await props.context.patch(id,change)
    }
    if(sortsDirty.value)await props.context.setSorts?.(sortDraft.value.map(sort=>({...sort})))
    props.context.close()
  }catch(cause){error.value=cause instanceof Error?cause.message:'设置保存失败，请重试。'}
  finally{saving.value=false}
}
function cancel(){if(!saving.value)props.context.close()}
function outside(event:PointerEvent){
  if(drawer.value||!panel.value)return
  const target=event.target as Element|null
  if(target&&!panel.value.contains(target)&&!target.closest('[data-testid="column-settings"],[data-testid="table-settings"]'))cancel()
}
watch(()=>props.context.openMode,mode=>{drawer.value=mode==='drawer'})
let previousFocus:HTMLElement|null=null
onMounted(()=>{previousFocus=document.activeElement as HTMLElement;document.addEventListener('pointerdown',outside);void nextTick(()=>{if(!drawer.value)panel.value?.focus()})})
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',outside);if(previousFocus?.isConnected)previousFocus.focus()})
</script>
<template>
  <ColumnSettingsDrawer v-if="drawer" :columns="draft" :base-columns="context.baseColumns??original" :sorts="sortDraft" :sorting-enabled="!!context.setSorts" :preview-rows="context.previewRows??[]" :preview-cell="context.previewCell" :dirty="dirty" :saving="saving" :error="error" @patch="patch" @reset="reset" @sorts="sortDraft=$event" @reset-sorts="sortDraft=originalSorts.map(sort=>({...sort}))" @apply="apply" @cancel="cancel" @move="move" />
  <aside v-else ref="panel" class="bt-column-popup" data-testid="column-panel" role="dialog" aria-label="列设置" tabindex="-1" @keydown.esc.stop.prevent="cancel">
    <div class="bt-column-popup__all"><label><input type="checkbox" aria-label="显示全部列" :checked="allVisible" :indeterminate="someVisible" :disabled="!togglable.length" @change="all(($event.target as HTMLInputElement).checked)">全部</label></div>
    <div class="bt-column-popup__list">
      <div v-for="column in draft" :key="column.id" class="bt-column-popup__row" :class="{'is-hidden':column.visible===false}" @dragover.prevent @drop.prevent="drop(column.id)">
        <input type="checkbox" :checked="column.visible!==false" :disabled="!isColumnCapabilityEnabled(column,'visible')" :aria-label="'显示'+column.title" @change="patch(column.id,{visible:($event.target as HTMLInputElement).checked})">
        <button class="bt-settings-icon bt-column-popup__grip" :aria-label="'拖动排序 '+column.title" :disabled="!isColumnCapabilityEnabled(column,'order')" :draggable="isColumnCapabilityEnabled(column,'order')" title="拖动排序，或使用上下方向键" @dragstart="draggedId=column.id" @dragend="draggedId=undefined" @keydown="moveKey(column.id,$event)"><TableIcon name="grip" :size="12" /></button>
        <span class="bt-column-popup__name">{{column.title}}</span>
        <div class="bt-column-popup__pins">
          <button v-for="side in ['left','right'] as const" :key="side" class="bt-settings-icon" :class="{'is-active':column.fixed===side}" :disabled="!canPin(column,side)" :title="(side==='left'?'左冻结 ':'右冻结 ')+column.title" :aria-pressed="column.fixed===side" @click="pin(column,side)"><TableIcon :name="'pin-'+side" :size="14" /></button>
        </div>
      </div>
    </div>
    <p v-if="error" class="bt-settings-error" role="alert">{{error}}</p>
    <button class="bt-column-popup__more bt-settings-text" @click="drawer=true"><TableIcon name="settings" :size="14" />更多设置</button>
    <footer class="bt-column-popup__footer"><button class="bt-settings-text bt-settings-muted" @click="reset()">恢复默认</button><span></span><button class="bt-settings-text" :disabled="saving" @click="cancel">取消</button><button class="bt-settings-text" :disabled="saving" @click="apply">{{saving?'保存中…':'确认'}}</button></footer>
  </aside>
</template>
