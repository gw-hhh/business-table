<script setup lang="ts" generic="T extends RowData">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,shallowRef} from 'vue'
import type {Action,RowData} from '../types'
import TableIcon from './TableIcon.vue'
import ActionMenuItems from './ActionMenuItems.vue'
import './action-menu.css'
const props=defineProps<{context:{actions:Action<T>[];rowId:(row:T)=>string;reportError:(cause:unknown)=>void}}>()
const currentRow=shallowRef<T|null>(null),trigger=shallowRef<HTMLElement>(),menu=ref<HTMLElement>()
const menuPosition=ref({left:'0px',top:'0px',maxHeight:'0px'}),flip=ref(false)
const actions=computed(()=>[...props.context.actions].sort((a,b)=>(a.order??0)-(b.order??0)))
function visible(action:Action<T>,row:T){try{return typeof action.visible==='function'?action.visible(row):action.visible!==false}catch(cause){props.context.reportError(cause);return false}}
function disabled(action:Action<T>,row:T){try{return typeof action.disabled==='function'?action.disabled(row):action.disabled===true}catch(cause){props.context.reportError(cause);return true}}
function list(row:T,position:'inline'|'more'){return actions.value.filter(action=>(action.position??'inline')===position&&visible(action,row))}
function close(returnFocus=false){currentRow.value=null;if(returnFocus)trigger.value?.focus()}
async function open(row:T,event:MouseEvent){
  const element=event.currentTarget as HTMLElement
  if(currentRow.value&&props.context.rowId(currentRow.value)===props.context.rowId(row)){close();return}
  trigger.value=element;currentRow.value=row
  const box=element.getBoundingClientRect()
  const maxHeight=`${Math.max(0,window.innerHeight-16)}px`
  menuPosition.value={left:`${Math.max(8,box.right-174)}px`,top:`${box.bottom+6}px`,maxHeight}
  await nextTick()
  if(!menu.value)return
  const size=menu.value.getBoundingClientRect()
  const left=Math.max(8,Math.min(window.innerWidth-size.width-8,box.right-size.width))
  menuPosition.value={left:`${left}px`,top:`${box.bottom+6+size.height>window.innerHeight-8?Math.max(8,box.top-size.height-6):box.bottom+6}px`,maxHeight}
  flip.value=left+size.width*2>window.innerWidth-8
  const first=menu.value.querySelector<HTMLElement>('button:not(:disabled)')
  if(first)first.focus();else menu.value.focus()
}
async function run(action:Action<T>,row:T,path:string[]=[action.id]){
  // Resolve the current tree, rather than trusting a leaf captured before its
  // parent permissions changed or the menu was repainted.
  let candidates=actions.value,current:Action<T>|undefined
  for(const id of path){
    current=candidates.find(item=>item.id===id)
    if(!current||!visible(current,row)||disabled(current,row))return
    candidates=current.children??[]
  }
  if(!current)return
  close(true)
  try{await current.handler?.(row)}catch(cause){props.context.reportError(cause)}
}
function outside(event:PointerEvent){if(menu.value?.contains(event.target as Node)||trigger.value?.contains(event.target as Node))return;close()}
function keyboard(event:KeyboardEvent){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return}
  if(event.key==='Tab'){close();return}
  const scope=(event.target as HTMLElement).closest('[role="menu"]')
  if(!scope)return
  const items=Array.from(scope.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).filter(item=>!item.disabled&&item.closest('[role="menu"]')===scope)
  const current=items.indexOf(document.activeElement as HTMLButtonElement)
  let index:number|undefined
  if(event.key==='ArrowDown')index=(current+1)%items.length
  if(event.key==='ArrowUp')index=(current-1+items.length)%items.length
  if(event.key==='Home')index=0
  if(event.key==='End')index=items.length-1
  if(index!==undefined){event.preventDefault();items[index]?.focus()}
}
function onScroll(event:Event){if(menu.value?.contains(event.target as Node))return;close()}
onMounted(()=>{document.addEventListener('pointerdown',outside);window.addEventListener('resize',onScroll);window.addEventListener('scroll',onScroll,true)})
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',onScroll);window.removeEventListener('scroll',onScroll,true)})
</script>
<template>
  <vxe-column v-if="actions.length" title="操作" width="195" fixed="right" class-name="bt__action-column">
    <template #default="{row}">
      <div class="bt__actions">
        <button v-for="action in list(row,'inline')" :key="action.id" :disabled="disabled(action,row)" :class="{danger:action.danger}" @click="run(action,row)">{{action.label}}</button>
        <button v-if="list(row,'more').length" class="bt__more-trigger" :aria-label="'更多操作 '+context.rowId(row)" aria-haspopup="menu" :aria-expanded="currentRow?context.rowId(currentRow)===context.rowId(row):false" @click="open(row,$event)">更多<TableIcon name="chevron-down" :size="12"/></button>
      </div>
    </template>
  </vxe-column>
  <Teleport to="body">
    <div v-if="currentRow" ref="menu" class="bt-floating bt__menu" role="menu" tabindex="-1" aria-label="行操作" :style="menuPosition" @keydown="keyboard">
      <ActionMenuItems :actions="list(currentRow,'more') as Action<RowData>[]" :is-visible="action=>visible(action as Action<T>,currentRow!)" :is-disabled="action=>disabled(action as Action<T>,currentRow!)" :flip="flip" @select="(action,path)=>run(action as Action<T>,currentRow!,path)"/>
    </div>
  </Teleport>
</template>
