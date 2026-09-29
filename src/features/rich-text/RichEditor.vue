<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,shallowRef,watch} from 'vue'
import {Editor,EditorContent} from '@tiptap/vue-3'
import type {ColumnConfig} from '../../types'
import type {ColumnFontFamily} from '../../config/font-families'
import FontSelect from '../../components/FontSelect.vue'
import TableIcon from '../../components/TableIcon.vue'
import DialogFrame from '../../ui/DialogFrame.vue'
import {readRichDocument,readRichAttributes,safeLink,type RichAttributes,type RichDocument} from './document'
import {readEditorHtml} from './clipboard'
import {richDocumentToTiptap,tiptapToRichDocument,tiptapMarkAttributes,tiptapCharacterCount,tiptapTextOffset} from './tiptap-document'
import {richEditorExtensions} from './tiptap-extensions'
const props=withDefaults(defineProps<{modelValue:RichDocument;label?:string;template?:boolean;columns?:readonly ColumnConfig[];maxChars?:number;readonly?:boolean}>(),{label:'富文本编辑',template:false,columns:()=>[],maxChars:1000,readonly:false})
const emit=defineEmits<{'update:modelValue':[document:RichDocument];expand:[]}>()
const editor=shallowRef<Editor>(),revision=ref(0),linkOpen=ref(false),link=ref(''),error=ref('')
const options=computed(()=>({template:props.template,fields:props.columns.map(column=>column.id),maxChars:props.maxChars}))
let current=readRichDocument(props.modelValue,options.value)
const active=computed(()=>{
  void revision.value
  const instance=editor.value
  if(!instance)return {}
  const marks=instance.state.storedMarks??instance.state.selection.$from.marks()
  const attributes=tiptapMarkAttributes(marks.map(mark=>({type:mark.type.name,attrs:mark.attrs})),props.template)
  for(const name of ['bold','italic','underline','strike'] as const)attributes[name]=instance.isActive(name)
  if(instance.isActive('bulletList'))attributes.list='bullet'
  if(instance.isActive('orderedList'))attributes.list='ordered'
  return {...attributes,...readRichAttributes({align:instance.getAttributes('paragraph').textAlign})}
})
const count=computed(()=>{void revision.value;return editor.value?tiptapCharacterCount(editor.value.getJSON()):0})
const canUndo=computed(()=>{void revision.value;return editor.value?.can().undo()??false})
const canRedo=computed(()=>{void revision.value;return editor.value?.can().redo()??false})
function publish(){
  const instance=editor.value
  if(!instance||instance.view.composing)return
  const next=tiptapToRichDocument(instance.getJSON(),options.value)
  if(JSON.stringify(next)!==JSON.stringify(current)){current=next;emit('update:modelValue',structuredClone(next))}
}
function focus(){editor.value?.view.focus()}
function command(patch:Partial<Record<keyof RichAttributes,unknown>>){
  const instance=editor.value
  if(props.readonly||!instance)return
  const safe=readRichAttributes(patch,props.template)
  let chain=instance.chain()
  for(const name of ['bold','italic','underline','strike'] as const)if(name in patch)chain=safe[name]?chain.setMark(name):chain.unsetMark(name)
  for(const name of ['color','background','font','size'] as const)if(name in patch)chain=chain.setMark('textStyle',{[name]:safe[name]??null})
  if('link' in patch&&!props.template)chain=safe.link?chain.setLink({href:safe.link}):chain.unsetLink()
  chain.run();focus()
}
function toggle(key:'bold'|'italic'|'underline'|'strike'){command({[key]:!active.value[key]})}
function block(patch:Pick<RichAttributes,'align'|'list'>){
  const instance=editor.value
  if(props.readonly||!instance)return
  if('align' in patch){if(patch.align)instance.commands.setTextAlign(patch.align);else instance.commands.unsetTextAlign()}
  if('list' in patch){
    if(patch.list==='bullet')instance.commands.toggleBulletList()
    else if(patch.list==='ordered')instance.commands.toggleOrderedList()
    else if(instance.isActive('bulletList'))instance.commands.toggleBulletList()
    else if(instance.isActive('orderedList'))instance.commands.toggleOrderedList()
  }
  focus()
}
function clear(){if(props.readonly)return;editor.value?.chain().unsetAllMarks().clearNodes().unsetTextAlign().run();focus()}
function insertField(event:Event){
  const select=event.target as HTMLSelectElement,id=select.value;select.value=''
  if(!props.readonly&&props.template&&props.columns.some(column=>column.id===id&&column.kind!=='actions')){editor.value?.commands.insertContent({type:'templateField',attrs:{id}});focus()}
}
function undo(redo=false){
  if(props.readonly)return
  if(redo)editor.value?.commands.redo();else editor.value?.commands.undo()
  focus()
}
function paste(event:ClipboardEvent){
  if(props.readonly||!editor.value)return false
  event.preventDefault()
  const html=event.clipboardData?.getData('text/html'),text=event.clipboardData?.getData('text/plain')??''
  const data=html?readEditorHtml(html,{...options.value,maxChars:10000}):readRichDocument(text,{...options.value,maxChars:10000})
  const content=richDocumentToTiptap(data,{...options.value,maxChars:10000}).content??[]
  if(content.length===1&&content[0]?.type==='paragraph'&&!content[0].attrs)editor.value.commands.insertContent(content[0].content??[])
  else editor.value.commands.insertContent(content)
  return true
}
function openLink(){link.value=String(active.value.link??'');linkOpen.value=true}
function saveLink(){const normalized=link.value.trim()?safeLink(link.value.trim()):'';if(link.value.trim()&&!normalized){error.value='请输入 http、https 或 mailto 地址';return}linkOpen.value=false;error.value='';command({link:normalized})}
function createEditor(){
  editor.value?.destroy()
  current=readRichDocument(props.modelValue,options.value)
  editor.value=new Editor({
    extensions:richEditorExtensions({readOptions:()=>options.value,fields:()=>props.columns,onLimit:maximum=>{error.value=`最多 ${maximum} 个字，超出部分未保留。`}}),
    content:richDocumentToTiptap(current,options.value),editable:!props.readonly,injectCSS:false,enableInputRules:false,enablePasteRules:false,
    editorProps:{
      attributes:{class:'bt-rich-editor__content',role:'textbox','aria-label':props.label,'aria-multiline':'true','aria-readonly':String(props.readonly)},
      handlePaste:(_view,event)=>paste(event),handleDrop:()=>true,
      handleClick:(_view,_position,event)=>{if((event.target as Element).closest('a'))event.preventDefault();return false},
      handleDOMEvents:{compositionend:()=>{queueMicrotask(()=>{
        const instance=editor.value
        if(!instance||instance.isDestroyed)return
        instance.commands.command(({tr})=>{tr.setMeta('rich-composition-end',true);return true});publish()
      });return false}},
    },
    onTransaction:()=>{revision.value++},
    onUpdate:()=>{publish()},
  })
}
watch(()=>[props.modelValue,options.value] as const,()=>{
  const instance=editor.value,next=readRichDocument(props.modelValue,options.value)
  if(!instance||JSON.stringify(next)===JSON.stringify(current))return
  // A replacement document starts its own history; undo cannot resurrect another record.
  createEditor()
  revision.value++
},{deep:true})
watch(()=>props.template,createEditor)
watch(()=>[props.readonly,props.label] as const,()=>{
  editor.value?.setEditable(!props.readonly,false)
  editor.value?.setOptions({editorProps:{attributes:{class:'bt-rich-editor__content',role:'textbox','aria-label':props.label,'aria-multiline':'true','aria-readonly':String(props.readonly)}}})
})
onMounted(createEditor)
onBeforeUnmount(()=>editor.value?.destroy())
defineExpose({focus,getDocument:()=>structuredClone(current),getSelection:()=>{
  const instance=editor.value
  return instance?{start:tiptapTextOffset(instance.state.doc,instance.state.selection.from),end:tiptapTextOffset(instance.state.doc,instance.state.selection.to)}:{start:0,end:0}
}})
</script>
<template>
  <div class="bt-rich-editor">
    <div v-if="!readonly" class="bt-rich-editor__toolbar" role="toolbar" :aria-label="label+'工具栏'">
      <div class="bt-rich-editor__font"><FontSelect :label="label" :model-value="(active.font as ColumnFontFamily)??''" @update:model-value="command({font:$event})" /></div>
      <select :value="active.size??''" :aria-label="label+'字号'" @change="command({size:($event.target as HTMLSelectElement).value})"><option value="">字号</option><option v-for="size in [12,13,14,16,18,20,24,28,32]" :key="size" :value="size+'px'">{{size}}</option></select>
      <button v-for="item in [{key:'bold',label:'粗体',text:'B'},{key:'italic',label:'斜体',text:'I'},{key:'underline',label:'下划线',text:'U'},{key:'strike',label:'删除线',text:'S'}] as const" :key="item.key" type="button" :aria-label="item.label" :title="item.label" :aria-pressed="!!active[item.key]" @mousedown.prevent @click="toggle(item.key)">{{item.text}}</button>
      <label class="bt-rich-editor__color" title="文字颜色">A<input type="color" aria-label="编辑文字颜色" :value="active.color??'#334155'" @input="command({color:($event.target as HTMLInputElement).value})" /></label>
      <label class="bt-rich-editor__color" title="背景颜色">▧<input type="color" aria-label="编辑背景颜色" :value="active.background??'#ffffff'" @input="command({background:($event.target as HTMLInputElement).value})" /></label>
      <button v-for="align in ['left','center','right'] as const" :key="align" type="button" :aria-label="({left:'左对齐',center:'居中',right:'右对齐'})[align]" @mousedown.prevent @click="block({align})"><TableIcon :name="'align-'+align" :size="15" /></button>
      <button type="button" aria-label="无序列表" @mousedown.prevent @click="block({list:active.list==='bullet'?undefined:'bullet'})">• ≡</button><button type="button" aria-label="有序列表" @mousedown.prevent @click="block({list:active.list==='ordered'?undefined:'ordered'})">1. ≡</button>
      <button v-if="!template" type="button" aria-label="链接" @mousedown.prevent @click="openLink">链接</button><button type="button" aria-label="清除格式" @mousedown.prevent @click="clear">清除格式</button>
      <button type="button" aria-label="撤销编辑" :disabled="!canUndo" @mousedown.prevent @click="undo()">↶</button><button type="button" aria-label="重做编辑" :disabled="!canRedo" @mousedown.prevent @click="undo(true)">↷</button>
      <select v-if="template" aria-label="插入字段" value="" @change="insertField"><option value="">插入字段</option><option v-for="column in columns.filter(column=>column.kind!=='actions')" :key="column.id" :value="column.id">{{column.title}}</option></select>
      <button type="button" aria-label="展开编辑" @mousedown.prevent @click="emit('expand')"><TableIcon name="expand" :size="15" /></button>
    </div>
    <EditorContent :editor="editor" />
    <footer><span v-if="error" role="alert">{{error}}</span><span>{{count}} / {{maxChars}}</span></footer>
    <DialogFrame :open="linkOpen" title="编辑链接" @close="linkOpen=false"><label class="bt-ui-field">链接地址<input v-model="link" autofocus placeholder="https://" aria-label="链接地址" /></label><p v-if="error" class="bt-ui-error" role="alert">{{error}}</p><template #footer><button class="bt-ui-button" @click="linkOpen=false">取消</button><button class="bt-ui-button primary" @click="saveLink">确定</button></template></DialogFrame>
  </div>
</template>
<style>
.bt-rich-editor{border:1px solid #dfe5ee;border-radius:6px;background:#fff;min-width:0;overflow:hidden}.bt-rich-editor__toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:3px;padding:7px;border-bottom:1px solid #e5eaf1;background:#f8fafc}.bt-rich-editor__toolbar button,.bt-rich-editor__toolbar select{font:inherit;font-size:12px;min-width:28px;height:30px;border:1px solid transparent;border-radius:4px;background:transparent;color:#526177;padding:0 6px}.bt-rich-editor__toolbar button:hover,.bt-rich-editor__toolbar button[aria-pressed=true]{background:#edf4ff;color:#2468e8}.bt-rich-editor__toolbar select{border-color:#dfe5ee;background:white;max-width:140px}.bt-rich-editor__font{width:150px}.bt-rich-editor__font .bt-font-select>select{height:30px}.bt-rich-editor__color{position:relative;width:28px;text-align:center;color:#526177;cursor:pointer}.bt-rich-editor__color input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.bt-rich-editor__content{min-height:130px;max-height:420px;overflow:auto;padding:14px 16px;outline:none;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.bt-rich-editor__content:focus{box-shadow:inset 0 0 0 1px #2468e8}.bt-rich-editor__content p{margin:0;min-height:1.6em}.bt-rich-editor__content ul,.bt-rich-editor__content ol{margin:0;padding-left:24px}.bt-rich-editor__content li{padding-left:1px}.bt-rich-editor__content .ProseMirror-selectednode{outline:2px solid #2468e8}.bt-editor-field{display:inline-block;border:1px solid #bdd1fc;background:#edf4ff;color:#2468e8;border-radius:3px;padding:0 4px;margin:0 1px;white-space:nowrap}.bt-rich-editor>footer{display:flex;justify-content:space-between;gap:12px;padding:6px 12px;border-top:1px solid #edf0f5;color:#66758b;font-size:12px}.bt-rich-editor>footer>span:last-child{margin-left:auto}.bt-rich-editor [role=alert]{color:#be3544}@media(max-width:600px){.bt-rich-editor__toolbar{gap:1px}.bt-rich-editor__font{width:140px}}
</style>
