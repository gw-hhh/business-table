<script setup lang="ts">
import {computed,ref,watch,type VNodeChild} from 'vue'
import type {Action,ColumnConfig,RowData} from '../../types'
import type {ColumnSettingsSection,SettingsPage} from './policy'
import {availableTools,type TablePresentation,type ToolDefinition} from '../presentation/model'
import {evaluateCell} from '../columns/evaluate'
import {getValue,withValue} from '../../runtime/value'
import {displayValue} from '../../core'
import {fontFamilyCss} from '../../config/font-families'
import {columnTextCss,editableColumnWidth} from '../../components/settingsTypes'
import CellRenderer from '../../components/CellRenderer'
import BusinessCell from '../../components/BusinessCell.vue'
import ActionStrip from '../../components/ActionStrip.vue'
import ToolStrip from '../toolbar/ToolStrip.vue'

const props=defineProps<{
  tab?:SettingsPage;section?:ColumnSettingsSection;selected?:ColumnConfig;columns:ColumnConfig[];
  rows:RowData[];row?:RowData;sampleIndex:number;mode:'column'|'table';open:boolean;
  presentation:TablePresentation;actions:Action[];tools:{page:readonly ToolDefinition[];table:readonly ToolDefinition[]};
  previewCell?:(value:unknown,row:RowData,column:ColumnConfig)=>VNodeChild;
}>()
const emit=defineEmits<{'update:mode':[value:'column'|'table'];'update:open':[value:boolean];'update:sampleIndex':[value:number]}>()
const narrow=ref(false),note=ref('')
const object=computed(()=>props.mode==='column')
const previewColumns=computed(()=>object.value&&props.tab==='columns'?(props.selected?[props.selected]:[]):props.columns.filter(column=>column.visible!==false))
const heading=computed(()=>!object.value?'整表预览':props.tab==='actions'?'操作按钮预览':props.tab==='toolbar'?'工具栏预览':props.tab==='columns'?`${props.selected?.title??'当前列'} · 预览`:'表格预览')
const mode=computed(()=>!object.value?'table':props.tab==='actions'?'actions':props.tab==='toolbar'?'toolbar':props.tab==='columns'&&props.section==='mapping'&&props.selected?.mapping?.enabled?'mapping':props.tab==='columns'&&['number','trial'].includes(props.section??'')?'number':'table')
const sampleVisible=computed(()=>props.tab==='columns'&&mode.value==='table'&&!['mapping','number','trial'].includes(props.section??'')&&props.rows.length>0)
const evaluated=computed(()=>props.selected?evaluateCell(props.row??{},props.selected,props.columns):undefined)
const mappingCases=computed(()=>{
  const column=props.selected;if(!column?.mapping?.enabled)return []
  const items=column.mapping.items.slice(0,4).map(item=>({label:`原始值 ${String(item.value)}`,value:item.value}))
  const used=new Set<unknown>(column.mapping.items.map(item=>item.value))
  let unknown:unknown=column.mapping.type==='number'?-987654321:column.mapping.type==='boolean'?undefined:'未配置的值'
  while(used.has(unknown))unknown=typeof unknown==='number'?unknown-1:String(unknown)+' '
  return [...items,{label:'空值',value:null},{label:'未匹配',value:unknown}].map(item=>({...item,row:withValue(props.row??{},column.field,item.value)}))
})
const actionWidth=computed(()=>{const column=props.columns.find(column=>column.kind==='actions');return column?editableColumnWidth(column):230})
// Only presentation declarations cross the preview boundary; real tool handlers never do.
function toolsForPreview(scope:'page'|'table'):ToolDefinition[]{return availableTools(props.tools[scope]).map(tool=>({...tool,handler:()=>{note.value=`预览“${tool.label}”，没有执行操作。`}}))}
const previewTools=computed(()=>({page:toolsForPreview('page'),table:toolsForPreview('table')}))
function sampleName(item:RowData,index:number){return props.columns.filter(column=>!['number','currency','percent'].includes(column.type??'')).slice(0,2).map(column=>displayValue(getValue(item,column.field),column)).join(' · ')||`样例 ${index+1}`}
watch(()=>[props.tab,props.section,props.mode],()=>{note.value=''})
</script>

<template>
  <section class="bt-settings-preview" data-testid="settings-preview">
    <header><strong>{{heading}}</strong><span>仅预览，不执行业务操作</span><div class="bt-settings-preview__controls"><div class="bt-settings-segmented" role="group" aria-label="预览范围"><button :aria-pressed="object" @click="emit('update:mode','column')">当前对象</button><button :aria-pressed="!object" @click="emit('update:mode','table')">整表</button></div><button class="bt-settings-text" :aria-expanded="open" @click="emit('update:open',!open)">{{open?'收起预览':'展开预览'}}</button></div></header>
    <div v-if="open" class="bt-settings-preview__content">
      <label v-if="sampleVisible" class="bt-settings-preview__sample">样例<select :value="sampleIndex" aria-label="预览样例" @change="emit('update:sampleIndex',Number(($event.target as HTMLSelectElement).value))"><option v-for="(item,index) in rows" :key="index" :value="index">{{sampleName(item,index)}}</option></select></label>
      <div v-if="mode==='actions'" class="bt-preview-action-context"><small>操作列宽 {{actionWidth}}px · 可展开“更多”</small><div :style="{width:actionWidth+'px',maxWidth:'100%'}"><ActionStrip :row="row??{}" :actions="actions" :layout="presentation.rowActions" :row-id="()=> '预览'" preview /></div></div>
      <div v-else-if="mode==='toolbar'" class="bt-preview-tool-context"><div class="bt-preview-tool-size"><span>检查溢出</span><button class="bt-settings-text" @click="narrow=!narrow">{{narrow?'窄幅 320px':'随窗口宽度'}}</button></div><div v-for="scope in (['page','table'] as const).filter(scope=>previewTools[scope].length)" :key="scope" class="bt-preview-tool-line"><strong>{{scope==='page'?'页面工具栏':'表格工具栏'}}</strong><div :style="{maxWidth:narrow?'320px':'100%'}"><ToolStrip :tools="previewTools[scope]" overflow="collapse" :layout="presentation.toolbar[scope]" :gap="presentation.toolbar.gap" :more-label="'预览更多'+(scope==='page'?'页面':'表格')+'工具'"/></div></div></div>
      <div v-else-if="mode==='mapping'&&selected" class="bt-preview-mapping-cases"><div v-for="(item,index) in mappingCases" :key="index"><small>{{item.label}}</small><BusinessCell :row="item.row" :column="selected" :columns="columns" preview /></div></div>
      <div v-else-if="mode==='number'&&selected&&evaluated" class="bt-preview-number-cases"><div><small>原始值</small><strong>{{String(evaluated.raw??'空值')}}</strong></div><span>→</span><div><small>显示结果</small><BusinessCell :row="row??{}" :column="selected" :columns="columns" preview /></div><div><small>Excel 数值 / 格式</small><code>{{String(evaluated.exportValue??'空值')}} / {{evaluated.excelFormat}}</code></div></div>
      <div v-else class="bt-settings-preview__scroll" tabindex="0" aria-label="左右滚动查看预览"><table class="bt-settings-preview__table" :class="['bt-preview-density--'+presentation.appearance.density,'bt-preview-border--'+presentation.appearance.border]" :style="{width:previewColumns.reduce((total,column)=>total+editableColumnWidth(column),0)+'px',fontFamily:fontFamilyCss(presentation.appearance.fontFamily),fontSize:presentation.appearance.fontSize+'px',color:presentation.appearance.color}" inert><colgroup><col v-if="presentation.appearance.index" style="width:54px"><col v-for="column in previewColumns" :key="column.id" :style="{width:editableColumnWidth(column)+'px'}"></colgroup><thead><tr><th v-if="presentation.appearance.index">序号</th><th v-for="column in previewColumns" :key="column.id" :style="{textAlign:column.align,fontSize:presentation.appearance.headerFontSize+'px',color:presentation.appearance.headerColor,...columnTextCss(column.headerStyle)}">{{column.title}}<small v-if="column.sortable"> ↕</small></th></tr></thead><tbody><tr v-if="row"><td v-if="presentation.appearance.index">{{sampleIndex+1}}</td><td v-for="column in previewColumns" :key="column.id" :style="{textAlign:column.align,...columnTextCss(column.cellStyle)}"><ActionStrip v-if="column.kind==='actions'" :row="row" :actions="actions" :layout="presentation.rowActions" :row-id="()=> '预览'" preview/><CellRenderer v-else-if="previewCell" :value="getValue(row,column.field)" :row="row" :column="column" :renderer="previewCell"/><BusinessCell v-else :row="row" :column="column" :columns="columns" preview /></td></tr><tr v-else><td :colspan="Math.max(previewColumns.length,1)" class="bt-settings-empty">暂无样例数据</td></tr></tbody></table></div>
      <p v-if="note" class="bt-settings-note" role="status">{{note}}</p>
    </div>
  </section>
</template>
