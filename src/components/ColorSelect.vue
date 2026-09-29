<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,useId,watch} from 'vue'
import {useFloatingPosition} from '../ui/useFloatingPosition'
const props=withDefaults(defineProps<{modelValue:string;label:string;disabled?:boolean;fallback?:string}>(),{disabled:false,fallback:'#334155'})
const emit=defineEmits<{'update:modelValue':[value:string]}>()
const id=useId(),palette=ref<HTMLDetailsElement>(),anchor=ref<HTMLElement>(),grid=ref<HTMLElement>(),opened=ref(false)
const {styles:paletteStyle}=useFloatingPosition({anchor,popup:grid,open:opened,gap:0,padding:0,boundary:()=>palette.value?.closest<HTMLElement>('.bt-settings-detail')??undefined,onError:()=>closePalette()})
const invalid=computed(()=>props.modelValue.trim()!==''&&!/^#[\da-f]{6}$/i.test(props.modelValue.trim()))
const swatch=computed(()=>!invalid.value&&props.modelValue.trim()?props.modelValue.trim():props.fallback)
const presets=[
  {name:'深灰',color:'#334155'},{name:'深蓝',color:'#2468e8'},
  {name:'绿色',color:'#167457'},{name:'橙色',color:'#9a5713'},
  {name:'红色',color:'#be3544'},{name:'浅蓝',color:'#edf4ff'},
  {name:'浅灰',color:'#f1f5f9'},{name:'白色',color:'#ffffff'},
]
function update(value:string){if(!props.disabled)emit('update:modelValue',value)}
function closePalette(restoreFocus=false){
  if(!palette.value?.open)return
  palette.value.open=false
  opened.value=false
  if(restoreFocus)void nextTick(()=>palette.value?.querySelector('summary')?.focus())
}
function togglePalette(){opened.value=palette.value?.open===true}
function viewportChanged(event:Event){
  // The palette's own scroll remains usable in a very short editor.
  if(event.target instanceof Node&&palette.value?.contains(event.target))return
  closePalette()
}
function choose(color:string){update(color);closePalette(true)}
function escape(event:KeyboardEvent){if(palette.value?.open){event.preventDefault();event.stopPropagation();closePalette(true)}}
function outside(event:PointerEvent){if(event.target instanceof Node&&!palette.value?.contains(event.target))closePalette()}
watch(()=>props.disabled,disabled=>{if(disabled)closePalette()})
onMounted(()=>{document.addEventListener('pointerdown',outside);document.addEventListener('scroll',viewportChanged,true);window.addEventListener('resize',viewportChanged)})
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('scroll',viewportChanged,true);window.removeEventListener('resize',viewportChanged)})
</script>
<template>
  <div class="bt-color-select" :data-color-picker="label">
    <div class="bt-color-select__controls">
      <input type="color" :aria-label="label+'颜色选择'" :value="swatch" :disabled="disabled" @input="update(($event.target as HTMLInputElement).value)">
      <input type="text" :aria-label="label+'文字颜色'" :value="modelValue" :disabled="disabled" placeholder="跟随默认" maxlength="32" spellcheck="false" :aria-invalid="invalid" :aria-describedby="invalid?id+'-error':undefined" @input="update(($event.target as HTMLInputElement).value)">
      <button type="button" class="bt-settings-text" :disabled="disabled" @click="update('')">默认</button>
      <details ref="palette" class="bt-color-presets" @toggle="togglePalette" @keydown.esc="escape">
        <summary ref="anchor" :aria-label="label+'常用颜色'" title="常用颜色" :aria-disabled="disabled" :tabindex="disabled?-1:0" @click="disabled&&$event.preventDefault()">色板</summary>
        <div v-if="opened" ref="grid" class="bt-color-presets__grid" :style="paletteStyle" :aria-label="label+'色板'">
          <button v-for="preset in presets" :key="preset.color" type="button" :data-color-preset="preset.color" :style="{backgroundColor:preset.color}" :disabled="disabled" :aria-label="'使用'+preset.name+(preset.name.endsWith('色')?'':'色')" :title="preset.name+' '+preset.color" @click="choose(preset.color)"></button>
        </div>
      </details>
    </div>
    <small v-if="invalid" :id="id+'-error'" class="bt-settings-error" role="alert">请输入六位颜色值，例如 #2468e8。</small>
  </div>
</template>
