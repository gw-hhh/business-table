<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,ref,useId,watch} from 'vue'
import {fontOptions} from '../config/font-families'
import TableIcon from './TableIcon.vue'

const props=withDefaults(defineProps<{modelValue?:string;label:string;disabled?:boolean}>(),{modelValue:'',disabled:false})
const emit=defineEmits<{'update:modelValue':[value:string]}>()
const id=useId(),expanded=ref(false),keyword=ref(''),select=ref<HTMLSelectElement>(),dialog=ref<HTMLDialogElement>(),search=ref<HTMLInputElement>()
const options=computed(()=>fontOptions.filter(option=>option.label.toLowerCase().includes(keyword.value.trim().toLowerCase())))
async function open(){
  if(props.disabled)return
  keyword.value='';expanded.value=true
  await nextTick()
  if(props.disabled||!dialog.value)return
  dialog.value.showModal()
  search.value?.focus({preventScroll:true})
}
function close(restoreFocus=true){
  if(dialog.value?.open)dialog.value.close()
  expanded.value=false
  if(restoreFocus)void nextTick(()=>{if(!props.disabled)select.value?.focus({preventScroll:true})})
}
function choose(value:string){
  if(props.disabled||!fontOptions.some(option=>option.value===value))return
  emit('update:modelValue',value)
  close()
}
function searchKey(event:KeyboardEvent){
  if(event.isComposing)return
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault()
    const items=dialog.value?.querySelectorAll<HTMLButtonElement>('[role="option"]')
    const item=event.key==='ArrowDown'?items?.[0]:items?.[items.length-1]
    item?.focus()
  }
}
function optionKey(event:KeyboardEvent){
  if(event.isComposing||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return
  event.preventDefault()
  const items=[...(dialog.value?.querySelectorAll<HTMLButtonElement>('[role="option"]')??[])]
  if(!items.length)return
  const current=items.indexOf(document.activeElement as HTMLButtonElement)
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowDown'?1:items.length-1))%items.length
  items[next]?.focus()
}
function keydown(event:KeyboardEvent){
  // Do not let the outer settings drawer consume this modal's Escape/Tab.
  event.stopPropagation()
  if(event.isComposing)return
  if(event.key==='Escape'){event.preventDefault();close();return}
  if(event.key!=='Tab')return
  const items=[...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')??[])]
  const first=items[0],last=items.at(-1)
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
}
function backdrop(event:MouseEvent){
  if(event.target!==dialog.value)return
  const box=dialog.value.getBoundingClientRect()
  if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close()
}
watch(()=>props.disabled,disabled=>{if(disabled&&expanded.value)close(false)})
onBeforeUnmount(()=>{if(dialog.value?.open)dialog.value.close()})
</script>
<template>
  <div class="bt-font-select">
    <select ref="select" :aria-label="label+'字体'" :value="modelValue" :disabled="disabled" @change="emit('update:modelValue',($event.target as HTMLSelectElement).value)">
      <option v-for="option in fontOptions" :key="option.value" :value="option.value">{{option.label}}</option>
    </select>
    <button type="button" class="bt-settings-icon" :aria-label="'查找'+label+'字体'" title="查找字体" :disabled="disabled" @click="open"><TableIcon name="search" /></button>
    <dialog v-if="expanded" ref="dialog" class="bt-font-dialog" aria-label="选择字体" :aria-describedby="id+'-description'" @cancel.stop.prevent="close()" @keydown="keydown" @click="backdrop">
      <div class="bt-font-dialog__layout">
        <header><div><h2>选择字体</h2><p :id="id+'-description'">搜索名称，未安装的字体使用系统后备字体。</p></div><button type="button" class="bt-settings-icon" aria-label="关闭字体选择" @click="close()"><TableIcon name="close" /></button></header>
        <div class="bt-font-dialog__body">
          <input ref="search" v-model="keyword" type="search" placeholder="输入字体名称" aria-label="搜索字体" autocomplete="off" maxlength="100" @keydown="searchKey">
          <div class="bt-font-options" role="listbox" aria-label="字体" @keydown="optionKey">
            <button v-for="option in options" :key="option.value" type="button" role="option" :aria-selected="option.value===modelValue" @click="choose(option.value)">{{option.label}}</button>
            <p v-if="!options.length" role="status">没有匹配的字体</p>
          </div>
        </div>
        <footer><button type="button" class="bt-settings-button" @click="close()">取消</button></footer>
      </div>
    </dialog>
  </div>
</template>
