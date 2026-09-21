<script setup lang="ts">
import {computed,nextTick,ref,watchEffect,type CSSProperties} from 'vue'
import type {Action,RowData} from '../types'
import TableIcon from './TableIcon.vue'
const props=defineProps<{actions:Action<RowData>[];isVisible:(action:Action<RowData>)=>boolean;isDisabled:(action:Action<RowData>)=>boolean;flip?:boolean}>()
const emit=defineEmits<{select:[Action<RowData>,string[]]}>()
const active=ref<string>(),root=ref<HTMLElement>()
const positions=ref<Record<string,CSSProperties>>(Object.create(null)),panels=new Map<string,HTMLElement>()
let openedScroll={top:0,left:0}
const visible=computed(()=>props.actions.filter(props.isVisible).sort((a,b)=>(a.order??0)-(b.order??0)))
function children(action:Action<RowData>){return (action.children??[]).filter(props.isVisible)}
function button(id:string){return Array.from(root.value?.querySelectorAll<HTMLElement>(':scope > .bt__menu-item > button')??[]).find(item=>item.dataset.action===id)}
function setPanel(id:string,value:unknown){if(value instanceof HTMLElement)panels.set(id,value);else panels.delete(id)}
watchEffect(()=>{
  if(!active.value)return
  const item=visible.value.find(action=>action.id===active.value)
  if(!item||props.isDisabled(item)||!children(item).length)active.value=undefined
})
async function openChild(action:Action<RowData>,event?:KeyboardEvent){
  if(props.isDisabled(action)||!children(action).length){active.value=undefined;return}
  event?.preventDefault();event?.stopPropagation()
  positions.value[action.id]={position:'fixed',maxHeight:`${Math.max(0,window.innerHeight-16)}px`,left:'8px',top:'8px',right:'auto'}
  openedScroll={top:root.value?.scrollTop??0,left:root.value?.scrollLeft??0}
  active.value=action.id
  await nextTick()
  const anchor=button(action.id),panel=panels.get(action.id)
  if(active.value!==action.id||!anchor||!panel)return
  const rect=anchor.getBoundingClientRect(),size=panel.getBoundingClientRect()
  let left=rect.right+5
  if(left+size.width>window.innerWidth-8)left=rect.left-size.width-5
  left=Math.max(8,Math.min(left,window.innerWidth-size.width-8))
  const top=Math.max(8,Math.min(rect.top,window.innerHeight-size.height-8))
  positions.value[action.id]={...positions.value[action.id],left:`${left}px`,top:`${top}px`}
  if(event)panel.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
}
function back(event:KeyboardEvent){
  if(event.key!=='ArrowLeft'&&event.key!=='Escape')return
  event.preventDefault();event.stopPropagation()
  const id=active.value;active.value=undefined
  if(id)button(id)?.focus()
}
function scroll(){
  // Browser auto-scroll can queue its event until after the item is clicked.
  if(root.value&&(root.value.scrollTop!==openedScroll.top||root.value.scrollLeft!==openedScroll.left))active.value=undefined
}
</script>
<template>
  <div ref="root" class="bt__menu-items" @scroll.self="scroll">
    <template v-for="action in visible" :key="action.id">
      <div v-if="action.separator" class="bt__menu-separator" role="separator"/>
      <div class="bt__menu-item" @mouseenter="openChild(action)">
        <button role="menuitem" :data-action="action.id" :class="{danger:action.danger,'is-open':active===action.id}" :disabled="isDisabled(action)" :aria-haspopup="children(action).length?'menu':undefined" :aria-expanded="children(action).length?active===action.id:undefined" @keydown.right="openChild(action,$event)" @click="children(action).length?openChild(action):emit('select',action,[action.id])"><TableIcon v-if="action.icon" :name="action.icon" :size="15"/><span>{{action.label}}</span><TableIcon v-if="children(action).length" name="chevron-right" :size="12"/></button>
        <div v-if="active===action.id&&children(action).length" :ref="element=>setPanel(action.id,element)" class="bt-floating bt__submenu" :style="positions[action.id]" role="menu" :aria-label="action.label" @keydown="back"><ActionMenuItems :actions="children(action)" :is-visible="isVisible" :is-disabled="isDisabled" :flip="flip" @select="(item,path)=>emit('select',item,[action.id,...path])"/></div>
      </div>
    </template>
  </div>
</template>
