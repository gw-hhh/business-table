<script setup lang="ts">
import { computed } from 'vue'
import { availableTools, type ToolDefinition, type ToolPreference, type ToolbarLayout } from '../presentation/model'
import TableIcon from '../../components/TableIcon.vue'
const props=defineProps<{disabled?:boolean;modelValue:ToolbarLayout;tools:{page:readonly ToolDefinition[];table:readonly ToolDefinition[]}}>()
const emit=defineEmits<{'update:modelValue':[value:ToolbarLayout]}>()
const localTools=computed(()=>({page:availableTools(props.tools.page),table:availableTools(props.tools.table)}))
function patch(value:Partial<ToolbarLayout>){if(props.disabled)return;emit('update:modelValue',{...props.modelValue,...value})}
function change(group:'page'|'table',id:string,value:ToolPreference){patch({[group]:{...props.modelValue[group],[id]:{...props.modelValue[group][id],...value}}})}
function ordered(group:'page'|'table'){return [...localTools.value[group]].sort((a,b)=>(props.modelValue[group][a.id]?.order??a.order??0)-(props.modelValue[group][b.id]?.order??b.order??0))}
function move(group:'page'|'table',id:string,offset:number){const items=ordered(group),index=items.findIndex(item=>item.id===id),target=index+offset;if(index<0||target<0||target>=items.length)return;const [item]=items.splice(index,1);items.splice(target,0,item!);const next={...props.modelValue[group]};items.forEach((item,index)=>next[item.id]={...next[item.id],order:index});patch({[group]:next})}
let dragged=''
function drop(group:'page'|'table',id:string){const items=ordered(group),from=items.findIndex(item=>item.id===dragged),to=items.findIndex(item=>item.id===id);if(from>=0&&to>=0)move(group,dragged,to-from);dragged=''}
</script>
<template><div class="bt-settings-page bt-toolbar-settings">
  <p class="bt-settings-note">拖动或使用箭头调整顺序。窄屏优先收起非固定按钮，设置入口始终保留。</p>
  <div class="bt-toolbar-settings__preference"><label class="bt-settings-check"><input type="checkbox" :checked="modelValue.followView" @change="patch({followView:($event.target as HTMLInputElement).checked})">工具栏随命名视图保存和切换</label><label class="bt-settings-field"><span>工具间距</span><select aria-label="工具间距" :value="modelValue.gap" @change="patch({gap:Number(($event.target as HTMLSelectElement).value)})"><option v-for="gap in [0,2,4,6,8,12,16]" :key="gap" :value="gap">{{gap}} px</option></select></label></div>
  <section v-for="group in (['page','table'] as const).filter(group=>localTools[group].length)" :key="group" class="bt-toolbar-settings__section"><h4>{{group==='page'?'页面工具栏':'表格工具栏'}}</h4>
    <div class="bt-tool-config"><div class="bt-tool-config__heading"><span>顺序</span><span>名称</span><span>显示位置</span><span>展示形式</span><span>固定</span><span>分隔</span><span>移动</span></div>
      <div v-for="(tool,index) in ordered(group)" :key="tool.id" class="bt-tool-config__row" @dragover.prevent @drop.prevent="drop(group,tool.id)">
        <button class="bt-settings-icon" :draggable="!disabled" :disabled="disabled" :aria-label="'拖动工具 '+tool.label" @dragstart="dragged=tool.id"><TableIcon name="grip" :size="12"/></button>
        <label class="bt-settings-field"><span class="bt-sr-only">名称</span><input :aria-label="tool.label+'工具名称'" :value="modelValue[group][tool.id]?.label??tool.label" @input="change(group,tool.id,{label:($event.target as HTMLInputElement).value})"></label>
        <label class="bt-settings-field"><span class="bt-sr-only">显示位置</span><select :aria-label="tool.label+'工具位置'" :disabled="tool.immutable" :value="tool.immutable?'direct':modelValue[group][tool.id]?.position??tool.position??'direct'" @change="change(group,tool.id,{position:($event.target as HTMLSelectElement).value as ToolPreference['position']})"><option value="direct">{{tool.immutable?'始终显示':'直接显示'}}</option><option value="more">放入更多</option><option value="hidden">隐藏</option></select></label>
        <label class="bt-settings-field"><span class="bt-sr-only">展示形式</span><select :aria-label="tool.label+'工具形式'" :value="modelValue[group][tool.id]?.display??tool.display??'icon-text'" @change="change(group,tool.id,{display:($event.target as HTMLSelectElement).value as ToolPreference['display']})"><option value="icon-text">图标 + 文字</option><option value="icon">仅图标</option><option value="text">文字</option></select></label>
        <label class="bt-settings-check"><input type="checkbox" :aria-label="'固定工具 '+tool.label" :disabled="tool.immutable" :checked="tool.immutable||(modelValue[group][tool.id]?.fixed??tool.fixed)" @change="change(group,tool.id,{fixed:($event.target as HTMLInputElement).checked})"><span class="bt-sr-only">固定</span></label>
        <label class="bt-settings-check"><input type="checkbox" :aria-label="'分隔工具 '+tool.label" :checked="modelValue[group][tool.id]?.separator??tool.separator" @change="change(group,tool.id,{separator:($event.target as HTMLInputElement).checked})"><span class="bt-sr-only">分隔</span></label>
        <div class="bt-setting-moves"><button v-for="offset in [-1,1]" :key="offset" class="bt-settings-icon" :aria-label="(offset<0?'上移工具 ':'下移工具 ')+tool.label" :disabled="index+offset<0||index+offset>=localTools[group].length" @click="move(group,tool.id,offset)"><TableIcon :name="offset<0?'chevron-up':'chevron-down'" :size="12"/></button></div>
      </div>
    </div>
  </section>
</div></template>
