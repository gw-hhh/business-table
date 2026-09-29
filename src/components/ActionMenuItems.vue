<script setup lang="ts">
import {computed,ref,shallowRef,watchEffect} from 'vue'
import type {Action,RowData} from '../types'
import TableIcon from './TableIcon.vue'
import {useFloatingPosition} from '../ui/useFloatingPosition'
const props=defineProps<{actions:Action<RowData>[];isVisible:(action:Action<RowData>)=>boolean;isDisabled:(action:Action<RowData>)=>boolean;flip?:boolean}>()
const emit=defineEmits<{select:[Action<RowData>,string[]];error:[cause:unknown]}>()
const active=ref<string>(),root=ref<HTMLElement>()
const childAnchor=shallowRef<HTMLElement>(),panel=shallowRef<HTMLElement>()
let focusChild=false
function focusPanel(element:HTMLElement){focusChild=false;element.querySelector<HTMLElement>('button:not(:disabled)')?.focus({preventScroll:true})}
const {styles:position,placement,isPositioned}=useFloatingPosition({anchor:childAnchor,popup:panel,open:()=>!!active.value,placement:()=>props.flip?'left-start':'right-start',gap:5,onPositioned:element=>{if(focusChild)focusPanel(element)},onError:cause=>{active.value=undefined;emit('error',cause)}})
let openedScroll={top:0,left:0}
const visible=computed(()=>props.actions.filter(props.isVisible).sort((a,b)=>(a.order??0)-(b.order??0)))
function children(action:Action<RowData>){return (action.children??[]).filter(props.isVisible)}
function button(id:string){return Array.from(root.value?.querySelectorAll<HTMLElement>(':scope > .bt__menu-item > button')??[]).find(item=>item.dataset.action===id)}
function setPanel(id:string,value:unknown){if(id===active.value)panel.value=value instanceof HTMLElement?value:undefined}
watchEffect(()=>{
  if(!active.value)return
  const item=visible.value.find(action=>action.id===active.value)
  if(!item||props.isDisabled(item)||!children(item).length)active.value=undefined
})
function openChild(action:Action<RowData>,event?:KeyboardEvent){
  if(props.isDisabled(action)||!children(action).length){active.value=undefined;return}
  event?.preventDefault();event?.stopPropagation()
  if(event&&active.value===action.id&&isPositioned.value&&panel.value){focusPanel(panel.value);return}
  focusChild=!!event
  childAnchor.value=button(action.id)
  openedScroll={top:root.value?.scrollTop??0,left:root.value?.scrollLeft??0}
  active.value=action.id
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
        <div v-if="active===action.id&&children(action).length" :ref="element=>setPanel(action.id,element)" class="bt-floating bt__submenu" :class="{'bt__submenu--left':placement?.startsWith('left')}" :style="position" role="menu" :aria-label="action.label" @keydown="back"><ActionMenuItems :actions="children(action)" :is-visible="isVisible" :is-disabled="isDisabled" :flip="flip" @select="(item,path)=>emit('select',item,[action.id,...path])" @error="emit('error',$event)"/></div>
      </div>
    </template>
  </div>
</template>
