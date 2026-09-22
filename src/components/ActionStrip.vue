<script setup lang="ts" generic="T extends RowData">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,shallowRef,watch} from 'vue'
import type {Action,RowData} from '../types'
import TableIcon from './TableIcon.vue'
import ActionMenuItems from './ActionMenuItems.vue'
import './action-menu.css'
import {defaultPresentation,presentActions,type RowActionLayout} from '../features/presentation/model'
import {splitActionLayout} from '../features/presentation/action-layout'
const props=withDefaults(defineProps<{row:T;actions:Action<T>[];rowId:(row:T)=>string;layout?:RowActionLayout;preview?:boolean;reportError?:(cause:unknown)=>void}>(),{layout:()=>defaultPresentation().rowActions,preview:false,reportError:()=>{}})
const host=ref<HTMLElement>(),measureHost=ref<HTMLElement>(),availableWidth=ref(0)
let observer:ResizeObserver|undefined,frame=0
const widths=new Map<string,number>()
function measure(){
  if(!host.value)return
  const width=host.value.clientWidth
  if(width!==availableWidth.value)availableWidth.value=width
  widths.clear()
  for(const node of measureHost.value?.querySelectorAll<HTMLElement>('[data-measure-action]')??[])widths.set(node.dataset.measureAction!,node.getBoundingClientRect().width)
  measurement.value++
}
const measurement=ref(0)
function scheduleMeasure(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;measure()})}
const currentRow=shallowRef<T|null>(null),trigger=shallowRef<HTMLElement>(),menu=ref<HTMLElement>()
const menuPosition=ref({left:'0px',top:'0px',maxHeight:'0px'}),flip=ref(false)
const actions=computed(()=>presentActions(props.actions,props.layout))
const renderedActions=computed(()=>actions.value.filter(action=>visible(action,props.row)&&(!action.children||action.children.some(child=>visible(child,props.row)))))
const allocation=computed(()=>{void measurement.value;return splitActionLayout(renderedActions.value,props.layout.maxInline,availableWidth.value,props.layout.gap,action=>widths.get(action.id)??(action.display==='icon'?18:action.label.length*14+(action.display==='icon-text'?22:0)),44)})
watch(()=>[props.actions,props.layout],()=>{void nextTick(scheduleMeasure)},{deep:true})
function visible(action:Action<T>,row:T){try{return typeof action.visible==='function'?action.visible(row):action.visible!==false}catch(cause){props.reportError(cause);return false}}
function disabled(action:Action<T>,row:T){try{return typeof action.disabled==='function'?action.disabled(row):action.disabled===true}catch(cause){props.reportError(cause);return true}}
function list(_row:T,position:'inline'|'more'){
  const result=allocation.value[position]
  if(position==='inline'||!props.layout.grouped)return result
  const order={normal:0,export:1,danger:2}
  const grouped=[...result].sort((a,b)=>order[a.group??'normal']-order[b.group??'normal'])
  return grouped.map((item,index)=>({...item,separator:item.separator||index>0&&item.group!==grouped[index-1]?.group}))
}
function close(returnFocus=false){currentRow.value=null;if(returnFocus)trigger.value?.focus()}
async function open(row:T,event:MouseEvent){
  const element=event.currentTarget as HTMLElement
  if(currentRow.value&&props.rowId(currentRow.value)===props.rowId(row)){close();return}
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
  try{if(!props.preview)await current.handler?.(row)}catch(cause){props.reportError(cause)}
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
onMounted(()=>{if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(scheduleMeasure);if(host.value)observer.observe(host.value)}void nextTick(scheduleMeasure);document.addEventListener('pointerdown',outside);window.addEventListener('resize',onScroll);window.addEventListener('scroll',onScroll,true)})
onBeforeUnmount(()=>{observer?.disconnect();cancelAnimationFrame(frame);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',onScroll);window.removeEventListener('scroll',onScroll,true)})
</script>
<template>
  <div ref="host" class="bt-action-strip">
    <div class="bt__actions" :style="{gap:layout.gap+'px',justifyContent:layout.align==='center'?'center':layout.align==='right'?'flex-end':'flex-start'}">
      <button v-for="action in list(row,'inline')" :key="action.id" :disabled="disabled(action,row)" :class="{danger:action.danger,'bt-action-strip__icon':action.display==='icon'}" :aria-label="action.label" :title="action.display==='icon'?action.label:undefined" @click="run(action,row)"><TableIcon v-if="action.display!=='text'" :name="action.icon??'file'" :size="14"/><span v-if="action.display!=='icon'">{{action.label}}</span></button>
      <button v-if="list(row,'more').length" class="bt__more-trigger" :aria-label="'更多操作 '+rowId(row)" aria-haspopup="menu" :aria-expanded="!!currentRow" @click="open(row,$event)" @keydown.down.prevent="open(row,$event as unknown as MouseEvent)" @keydown.up.prevent="open(row,$event as unknown as MouseEvent)">更多<TableIcon name="chevron-down" :size="12"/></button>
    </div>
    <div ref="measureHost" class="bt-action-strip__measure" aria-hidden="true" inert><span v-for="action in renderedActions" :key="action.id" :data-measure-action="action.id"><TableIcon v-if="action.display!=='text'" :name="action.icon??'file'" :size="14"/><span v-if="action.display!=='icon'">{{action.label}}</span></span></div>
  </div>
  <Teleport to="body">
    <div v-if="currentRow" ref="menu" class="bt-floating bt__menu" role="menu" tabindex="-1" aria-label="行操作" :style="menuPosition" @keydown="keyboard">
      <ActionMenuItems :actions="list(currentRow,'more') as Action<RowData>[]" :is-visible="action=>visible(action as Action<T>,currentRow!)" :is-disabled="action=>disabled(action as Action<T>,currentRow!)" :flip="flip" @select="(action,path)=>run(action as Action<T>,currentRow!,path)"/>
    </div>
  </Teleport>
</template>

<style>
.bt-action-strip{position:relative;width:100%;min-width:0}.bt-action-strip__measure{position:absolute;visibility:hidden;height:0;overflow:hidden;white-space:nowrap;pointer-events:none;inset:0 auto auto 0}.bt-action-strip__measure>span{display:inline-flex;align-items:center;gap:3px;font:inherit;font-size:inherit;white-space:nowrap}.bt-action-strip .bt__actions{font:inherit;width:100%;min-width:0}.bt-action-strip .bt__actions>button{font:inherit;display:inline-flex;align-items:center;gap:3px;flex-shrink:0}.bt-action-strip__icon{min-width:22px}.bt-preview-action-context .bt-action-strip{width:320px;max-width:100%}
</style>
