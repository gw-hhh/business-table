<script setup lang="ts">
import {computed,nextTick,onMounted,ref,watch} from 'vue'
import type {ColumnConfig} from '../../types'
import {fontFamilyCss,type ColumnFontFamily} from '../../config/font-families'
import FontSelect from '../../components/FontSelect.vue'
import TableIcon from '../../components/TableIcon.vue'
import DialogFrame from '../../ui/DialogFrame.vue'
import {readRichDocument,readRichAttributes,richText,safeLink,type RichAttributes,type RichDocument,type RichOperation} from './document'
import {formatRange,formatBlocks,replaceRange,rangeAttributes,readEditorHtml,documentLength,type TextRange} from './editor-model'
import {editorSelection,restoreEditorSelection} from './selection'
const props=withDefaults(defineProps<{modelValue:RichDocument;label?:string;template?:boolean;columns?:readonly ColumnConfig[];maxChars?:number;readonly?:boolean}>(),{label:'富文本编辑',template:false,columns:()=>[],maxChars:1000,readonly:false})
const emit=defineEmits<{'update:modelValue':[document:RichDocument];expand:[]}>()
const root=ref<HTMLElement>(),revision=ref(0),history=ref<RichDocument[]>([]),future=ref<RichDocument[]>([]),composing=ref(false),linkOpen=ref(false),link=ref(''),error=ref('')
const options=computed(()=>({template:props.template,fields:props.columns.map(column=>column.id),maxChars:props.maxChars}))
let current=readRichDocument(props.modelValue,options.value),selection:TextRange={start:0,end:0},typing:RichAttributes={}
const active=computed(()=>{void revision.value;return selection.start===selection.end?{...rangeAttributes(current,selection),...typing}:rangeAttributes(current,selection)})
const count=computed(()=>{void revision.value;return [...richText(current,()=> '\ufffc')].length})
function capture(){const next=root.value&&editorSelection(root.value);if(next){selection=next;revision.value++}}
function render(){
  if(!root.value)return
  const fragment=document.createDocumentFragment();let line=document.createElement('p')
  const finish=(attributes:RichAttributes={})=>{
    if(!line.childNodes.length)line.append(document.createElement('br'))
    if(attributes.align)line.style.textAlign=attributes.align
    if(attributes.list){line.dataset.list=attributes.list;line.className='bt-editor-list';line.dataset.marker=attributes.list==='ordered'?'1.':'•'}
    fragment.append(line);line=document.createElement('p')
  }
  const append=(insert:RichOperation['insert'],attributes:RichAttributes={})=>{
    const span=document.createElement('span'),safe=readRichAttributes(attributes,props.template)
    if(typeof insert==='string')span.textContent=insert
    else {span.textContent=props.columns.find(column=>column.id===insert.field)?.title??insert.field;span.dataset.btField=insert.field;span.contentEditable='false';span.className='bt-editor-field'}
    if(safe.bold)span.style.fontWeight='bold';if(safe.italic)span.style.fontStyle='italic'
    if(safe.underline||safe.strike)span.style.textDecoration=[safe.underline?'underline':'',safe.strike?'line-through':''].filter(Boolean).join(' ')
    if(safe.color)span.style.color=safe.color;if(safe.background)span.style.backgroundColor=safe.background
    if(safe.font){span.style.fontFamily=fontFamilyCss(safe.font);span.dataset.btFont=safe.font}
    if(safe.size)span.style.fontSize=safe.size
    if(safe.link){const anchor=document.createElement('a');anchor.href=safe.link;anchor.tabIndex=-1;anchor.append(span);line.append(anchor)}else line.append(span)
  }
  for(const op of current.ops){
    if(typeof op.insert!=='string'){append(op.insert,op.attributes);continue}
    const parts=op.insert.split('\n')
    parts.forEach((part,index)=>{if(part)append(part,op.attributes);if(index<parts.length-1)finish(op.attributes)})
  }
  if(line.childNodes.length)finish()
  root.value.replaceChildren(fragment)
}
function record(document:RichDocument,range?:TextRange,redraw=true){
  const normalized=readRichDocument(document,options.value)
  if(JSON.stringify(normalized)!==JSON.stringify(current)){history.value=[...history.value.slice(-49),structuredClone(current)];future.value=[];current=normalized;emit('update:modelValue',structuredClone(current))}
  if(range)selection=range
  if(redraw){render();void nextTick(()=>{if(root.value){root.value.focus();restoreEditorSelection(root.value,selection)}})}
  revision.value++
}
function input(){
  if(composing.value||props.readonly||!root.value)return
  capture();const parsed=readEditorHtml(root.value.innerHTML,options.value)
  const raw=readEditorHtml(root.value.innerHTML,{...options.value,maxChars:10000})
  const truncated=[...richText(raw)].length>props.maxChars
  error.value=truncated?`最多 ${props.maxChars} 个字，超出部分未保留。`:''
  record(parsed,selection,truncated)
}
function command(patch:Partial<Record<keyof RichAttributes,unknown>>){
  if(props.readonly)return
  capture()
  if(selection.start===selection.end){typing=readRichAttributes({...active.value,...patch},props.template);revision.value++;root.value?.focus();if(root.value)restoreEditorSelection(root.value,selection);return}
  record(formatRange(current,selection,patch),selection)
}
function toggle(key:'bold'|'italic'|'underline'|'strike'){command({[key]:!active.value[key]})}
function block(patch:Pick<RichAttributes,'align'|'list'>){if(props.readonly)return;capture();record(formatBlocks(current,selection,patch),selection)}
function clear(){command({bold:false,italic:false,underline:false,strike:false,color:'',background:'',font:'',size:'',link:''});block({align:undefined,list:undefined})}
function insert(document:RichDocument){capture();const start=selection.start;record(replaceRange(current,selection,document),{start:start+documentLength(document),end:start+documentLength(document)})}
function insertField(event:Event){const select=event.target as HTMLSelectElement,id=select.value;select.value='';if(props.columns.some(column=>column.id===id))insert({ops:[{insert:{field:id}}]})}
function undo(redo=false){
  const source=redo?future:history,target=redo?history:future,previous=source.value.at(-1)
  if(!previous||props.readonly)return
  target.value=[...target.value.slice(-49),structuredClone(current)];source.value=source.value.slice(0,-1);current=structuredClone(previous);selection={start:0,end:0};typing={};render();revision.value++;emit('update:modelValue',structuredClone(current))
  root.value?.focus();if(root.value)restoreEditorSelection(root.value,selection)
}
function keyboard(event:KeyboardEvent){
  if(event.isComposing||props.readonly)return
  if(event.ctrlKey||event.metaKey){
    const key=event.key.toLowerCase()
    if(key==='z'){event.preventDefault();undo(event.shiftKey)}
    else if(key==='y'){event.preventDefault();undo(true)}
    else if(['b','i','u'].includes(key)){event.preventDefault();toggle(({b:'bold',i:'italic',u:'underline'} as const)[key as 'b'|'i'|'u'])}
  }
}
function beforeInput(event:InputEvent){
  if(composing.value||event.isComposing||props.readonly)return
  if(event.inputType==='insertText'&&event.data&&Object.keys(typing).length){event.preventDefault();insert({ops:[{insert:event.data,attributes:typing}]})}
}
function paste(event:ClipboardEvent){
  if(props.readonly)return
  event.preventDefault()
  const html=event.clipboardData?.getData('text/html'),text=event.clipboardData?.getData('text/plain')??''
  const data=html?readEditorHtml(html,options.value):readRichDocument(text,options.value)
  const last=data.ops.at(-1)
  if(typeof last?.insert==='string'&&last.insert.endsWith('\n'))last.insert=last.insert.slice(0,-1)
  insert(data)
}
function openLink(){capture();link.value=String(active.value.link??'');linkOpen.value=true}
function saveLink(){const normalized=link.value.trim()?safeLink(link.value.trim()):'';if(link.value.trim()&&!normalized){error.value='请输入 http、https 或 mailto 地址';return}linkOpen.value=false;error.value='';command({link:normalized})}
watch(()=>props.modelValue,value=>{const next=readRichDocument(value,options.value);if(!composing.value&&JSON.stringify(next)!==JSON.stringify(current)){current=next;render();revision.value++}},{deep:true})
onMounted(render)
defineExpose({focus:()=>root.value?.focus(),getDocument:()=>structuredClone(current),getSelection:()=>({...selection})})
</script>
<template>
  <div class="bt-rich-editor">
    <div v-if="!readonly" class="bt-rich-editor__toolbar" role="toolbar" :aria-label="label+'工具栏'" @mousedown="capture">
      <div class="bt-rich-editor__font"><FontSelect :label="label" :model-value="(active.font as ColumnFontFamily)??''" @update:model-value="command({font:$event})" /></div>
      <select :value="active.size??''" :aria-label="label+'字号'" @change="command({size:($event.target as HTMLSelectElement).value})"><option value="">字号</option><option v-for="size in [12,13,14,16,18,20,24,28,32]" :key="size" :value="size+'px'">{{size}}</option></select>
      <button v-for="item in [{key:'bold',label:'粗体',text:'B'},{key:'italic',label:'斜体',text:'I'},{key:'underline',label:'下划线',text:'U'},{key:'strike',label:'删除线',text:'S'}] as const" :key="item.key" type="button" :aria-label="item.label" :title="item.label" :aria-pressed="!!active[item.key]" @mousedown.prevent @click="toggle(item.key)">{{item.text}}</button>
      <label class="bt-rich-editor__color" title="文字颜色">A<input type="color" aria-label="编辑文字颜色" :value="active.color??'#334155'" @input="command({color:($event.target as HTMLInputElement).value})" /></label>
      <label class="bt-rich-editor__color" title="背景颜色">▧<input type="color" aria-label="编辑背景颜色" :value="active.background??'#ffffff'" @input="command({background:($event.target as HTMLInputElement).value})" /></label>
      <button v-for="align in ['left','center','right'] as const" :key="align" type="button" :aria-label="({left:'左对齐',center:'居中',right:'右对齐'})[align]" @mousedown.prevent @click="block({align})"><TableIcon :name="'align-'+align" :size="15" /></button>
      <button type="button" aria-label="无序列表" @mousedown.prevent @click="block({list:active.list==='bullet'?undefined:'bullet'})">• ≡</button><button type="button" aria-label="有序列表" @mousedown.prevent @click="block({list:active.list==='ordered'?undefined:'ordered'})">1. ≡</button>
      <button v-if="!template" type="button" aria-label="链接" @mousedown.prevent @click="openLink">链接</button><button type="button" aria-label="清除格式" @mousedown.prevent @click="clear">清除格式</button>
      <button type="button" aria-label="撤销编辑" :disabled="!history.length" @mousedown.prevent @click="undo()">↶</button><button type="button" aria-label="重做编辑" :disabled="!future.length" @mousedown.prevent @click="undo(true)">↷</button>
      <select v-if="template" aria-label="插入字段" value="" @change="insertField"><option value="">插入字段</option><option v-for="column in columns.filter(column=>column.kind!=='actions')" :key="column.id" :value="column.id">{{column.title}}</option></select>
      <button type="button" aria-label="展开编辑" @mousedown.prevent @click="emit('expand')"><TableIcon name="expand" :size="15" /></button>
    </div>
    <div ref="root" class="bt-rich-editor__content" role="textbox" :aria-label="label" aria-multiline="true" :contenteditable="!readonly" :aria-readonly="readonly" @input="input" @beforeinput="beforeInput($event as InputEvent)" @compositionstart="composing=true" @compositionend="composing=false;input()" @keydown="keyboard" @keyup="capture" @mouseup="capture" @paste="paste" @drop.prevent @click="($event.target as Element).closest('a')&&$event.preventDefault()" />
    <footer><span v-if="error" role="alert">{{error}}</span><span>{{count}} / {{maxChars}}</span></footer>
    <DialogFrame v-if="linkOpen" title="编辑链接" @close="linkOpen=false"><label class="bt-ui-field">链接地址<input v-model="link" autofocus placeholder="https://" aria-label="链接地址" /></label><p v-if="error" class="bt-ui-error" role="alert">{{error}}</p><template #footer><button class="bt-ui-button" @click="linkOpen=false">取消</button><button class="bt-ui-button primary" @click="saveLink">确定</button></template></DialogFrame>
  </div>
</template>
<style>
.bt-rich-editor{border:1px solid #dfe5ee;border-radius:6px;background:#fff;min-width:0;overflow:hidden}.bt-rich-editor__toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:3px;padding:7px;border-bottom:1px solid #e5eaf1;background:#f8fafc}.bt-rich-editor__toolbar button,.bt-rich-editor__toolbar select{font:inherit;font-size:12px;min-width:28px;height:30px;border:1px solid transparent;border-radius:4px;background:transparent;color:#526177;padding:0 6px}.bt-rich-editor__toolbar button:hover,.bt-rich-editor__toolbar button[aria-pressed=true]{background:#edf4ff;color:#2468e8}.bt-rich-editor__toolbar select{border-color:#dfe5ee;background:white;max-width:140px}.bt-rich-editor__font{width:150px}.bt-rich-editor__font .bt-font-select>select{height:30px}.bt-rich-editor__color{position:relative;width:28px;text-align:center;color:#526177;cursor:pointer}.bt-rich-editor__color input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.bt-rich-editor__content{min-height:130px;max-height:420px;overflow:auto;padding:14px 16px;outline:none;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.bt-rich-editor__content:focus{box-shadow:inset 0 0 0 1px #2468e8}.bt-rich-editor__content p{margin:0;min-height:1.6em}.bt-editor-list{padding-left:24px;position:relative}.bt-editor-list:before{content:attr(data-marker);position:absolute;left:5px}.bt-editor-field{display:inline-block;border:1px solid #bdd1fc;background:#edf4ff;color:#2468e8;border-radius:3px;padding:0 4px;margin:0 1px;white-space:nowrap}.bt-rich-editor>footer{display:flex;justify-content:space-between;gap:12px;padding:6px 12px;border-top:1px solid #edf0f5;color:#66758b;font-size:12px}.bt-rich-editor>footer>span:last-child{margin-left:auto}.bt-rich-editor [role=alert]{color:#be3544}@media(max-width:600px){.bt-rich-editor__toolbar{gap:1px}.bt-rich-editor__font{width:140px}}
</style>
