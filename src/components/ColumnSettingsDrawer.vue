<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch,type VNodeChild} from 'vue'
import type {ColumnConfig,ColumnTextStyle,RowData,SortConfig,UserColumnConfig} from '../types'
import {getColumnWidthBounds,guardColumnPatch,isColumnCapabilityEnabled} from '../config/columns'
import {applySorts,displayValue,getValue,mapStyle} from '../core'
import {columnTextCss,editableColumnWidth} from './settingsTypes'
import CellRenderer from './CellRenderer'
import TableIcon from './TableIcon.vue'

const props=defineProps<{columns:ColumnConfig[];baseColumns:ColumnConfig[];sorts:SortConfig[];sortingEnabled:boolean;previewRows:RowData[];previewCell?:(value:unknown,row:RowData,column:ColumnConfig)=>VNodeChild;dirty:boolean;saving:boolean;error:string}>()
const emit=defineEmits<{patch:[id:string,patch:UserColumnConfig];reset:[id?:string];sorts:[sorts:SortConfig[]];resetSorts:[];apply:[];cancel:[];move:[id:string,targetId:string]}>()
const selectedId=ref(props.columns.find(column=>column.visible!==false&&!column.fixed&&isColumnCapabilityEnabled(column,'rename'))?.id??props.columns[0]?.id??'')
const selected=computed(()=>props.columns.find(column=>column.id===selectedId.value))
const selectedBase=computed(()=>props.baseColumns.find(column=>column.id===selectedId.value))
const dialog=ref<HTMLElement>(),widthError=ref(''),previewOpen=ref(true),previewMode=ref<'table'|'column'>('table'),sampleIndex=ref(0)
const batchIds=ref<string[]>(selectedId.value?[selectedId.value]:[]),draggedId=ref<string>()
const activeTab=ref<'columns'|'sorts'>('columns')
const discardConfirmation=ref(false),discardDialog=ref<HTMLElement>()
const sortedSamples=computed(()=>applySorts(props.previewRows,props.sorts))
const row=computed(()=>sortedSamples.value[sampleIndex.value]??sortedSamples.value[0])
const sortableColumns=computed(()=>props.columns.filter(column=>column.sortable))
const unusedSortColumns=computed(()=>sortableColumns.value.filter(column=>!props.sorts.some(sort=>sort.field===column.field)))
const previewColumns=computed(()=>previewMode.value==='column'?(selected.value?[selected.value]:[]):props.columns.filter(column=>column.visible!==false))
const styleSections=[{key:'headerStyle' as const,title:'表头文字'},{key:'cellStyle' as const,title:'单元格文字'}]
const alignments=[{id:'left' as const,label:'左对齐'},{id:'center' as const,label:'居中'},{id:'right' as const,label:'右对齐'}]
const can=(key:Parameters<typeof isColumnCapabilityEnabled>[1])=>!!selected.value&&isColumnCapabilityEnabled(selected.value,key)
function patch(changes:UserColumnConfig){if(selected.value)emit('patch',selected.value.id,changes)}
function pin(side:'left'|'right'){if(selected.value)patch({fixed:selected.value.fixed===side?false:side})}
function canPin(side:'left'|'right'){return !!selected.value&&Object.hasOwn(guardColumnPatch(selected.value,{fixed:selected.value.fixed===side?false:side}),'fixed')}
function width(value:string){
  if(!selected.value)return
  const bounds=getColumnWidthBounds(selected.value),amount=Number(value)
  widthError.value=!Number.isFinite(amount)||amount<bounds.min||amount>bounds.max?`请输入 ${bounds.min}–${bounds.max} px。`:''
  if(!widthError.value)patch({width:amount})
}
function style(key:'headerStyle'|'cellStyle',field:keyof ColumnTextStyle,value:string){
  const next={...selected.value?.[key]}
  if(value==='')delete next[field]
  else Object.assign(next,{[field]:field==='fontSize'?Number(value):value})
  patch({[key]:next})
}
function resetStyle(key:'headerStyle'|'cellStyle'){patch({[key]:selectedBase.value?.[key]??{}})}
function sampleName(item:RowData,index:number){
  const values=props.columns.filter(column=>column.type!=='number'&&column.type!=='currency').slice(0,2).map(column=>displayValue(getValue(item,column.field),column))
  return values.join(' · ')||`样例 ${index+1}`
}
function toggleBatch(id:string,checked:boolean){batchIds.value=checked?[...new Set([...batchIds.value,id])]:batchIds.value.filter(value=>value!==id)}
function copyStyles(){
  if(!selected.value)return
  for(const id of batchIds.value)emit('patch',id,{headerStyle:{...selected.value.headerStyle},cellStyle:{...selected.value.cellStyle}})
}
function moveKey(id:string,event:KeyboardEvent){
  if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return
  event.preventDefault()
  const columns=props.columns.filter(column=>isColumnCapabilityEnabled(column,'order')),index=columns.findIndex(column=>column.id===id)
  const target=columns[index+(event.key==='ArrowUp'?-1:1)]
  if(target)emit('move',id,target.id)
}
function drop(id:string){if(draggedId.value)emit('move',draggedId.value,id);draggedId.value=undefined}
function changeSort(index:number,patch:Partial<SortConfig>){
  emit('sorts',props.sorts.map((sort,position)=>position===index?{...sort,...patch}:{...sort}))
}
function addSort(){const column=unusedSortColumns.value[0];if(column)emit('sorts',[...props.sorts,{field:column.field,order:'asc'}])}
function removeSort(index:number){emit('sorts',props.sorts.filter((_,position)=>position!==index))}
function moveSort(index:number,offset:number){
  const target=index+offset
  if(target<0||target>=props.sorts.length)return
  const next=props.sorts.map(sort=>({...sort})),[sort]=next.splice(index,1)
  next.splice(target,0,sort!);emit('sorts',next)
}
function resetPage(){if(activeTab.value==='columns')emit('reset');else emit('resetSorts')}
function resetAll(){emit('reset');emit('resetSorts')}
function requestClose(){
  if(props.saving)return
  if(props.dirty){discardConfirmation.value=true;void nextTick(()=>discardDialog.value?.querySelector<HTMLButtonElement>('button')?.focus())}
  else emit('cancel')
}
function continueEditing(){discardConfirmation.value=false;void nextTick(()=>dialog.value?.querySelector<HTMLButtonElement>('[aria-label="关闭表格设置"]')?.focus())}
function keydown(event:KeyboardEvent){
  if(event.key==='Escape'){event.stopPropagation();event.preventDefault();if(discardConfirmation.value)continueEditing();else requestClose();return}
  if(event.key!=='Tab'||!dialog.value)return
  const scope=discardConfirmation.value?discardDialog.value:dialog.value
  const elements=[...(scope?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')??[])].filter(element=>!element.closest('[inert]'))
  const first=elements[0],last=elements.at(-1)
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
}
watch(selectedId,()=>{widthError.value='';void nextTick(()=>dialog.value?.querySelector('.bt-settings-detail')?.scrollTo?.({top:0}))})
let previousOverflow=''
onMounted(()=>{previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';void nextTick(()=>dialog.value?.focus())})
onBeforeUnmount(()=>{document.body.style.overflow=previousOverflow})
</script>
<template>
  <Teleport to="body">
    <div class="bt-settings-overlay" @click.self="requestClose">
      <section ref="dialog" class="bt-settings-drawer" data-testid="settings-drawer" role="dialog" aria-modal="true" aria-label="表格设置" tabindex="-1" @keydown="keydown">
        <header class="bt-settings-drawer__header"><div><h2>表格设置</h2><p>修改先预览，应用后生效。</p></div><button class="bt-settings-icon" aria-label="关闭表格设置" :disabled="saving" @click="requestClose"><TableIcon name="close" :size="16" /></button></header>
        <nav class="bt-settings-tabs" aria-label="设置类别"><button :class="{'is-active':activeTab==='columns'}" :aria-current="activeTab==='columns'?'page':undefined" @click="activeTab='columns'">列设置</button><button :class="{'is-active':activeTab==='sorts'}" aria-label="排序规则" :aria-current="activeTab==='sorts'?'page':undefined" :disabled="!sortingEnabled" @click="activeTab='sorts'">排序规则<span v-if="sorts.length" class="bt-settings-tab-count">{{sorts.length}}</span></button><button v-for="name in ['操作按钮','表格外观','工具栏']" :key="name" disabled title="此设置尚未迁移">{{name}}</button></nav>
        <div class="bt-settings-summary" role="status" :class="{'is-dirty':dirty}">{{dirty?'设置已修改，应用后生效':'当前设置已应用'}}</div>
        <div v-if="activeTab==='columns'" class="bt-settings-editor">
          <aside class="bt-settings-sidebar">
            <div class="bt-settings-sidebar__caption"><strong>批量样式</strong><span>勾选仅用于复制文字样式</span></div>
            <label class="bt-settings-check bt-settings-sidebar__all"><input type="checkbox" aria-label="全选样式列" :checked="batchIds.length===columns.length&&columns.length>0" :indeterminate="batchIds.length>0&&batchIds.length<columns.length" @change="batchIds=($event.target as HTMLInputElement).checked?columns.map(column=>column.id):[]">全选样式列</label>
            <div class="bt-settings-sidebar__list">
              <div v-for="column in columns" :key="column.id" class="bt-settings-pick" :class="{'is-active':selectedId===column.id}" @dragover.prevent @drop.prevent="drop(column.id)">
                <input type="checkbox" :aria-label="'批量样式 '+column.title" :checked="batchIds.includes(column.id)" @change="toggleBatch(column.id,($event.target as HTMLInputElement).checked)">
                <button class="bt-settings-icon bt-settings-grip" :disabled="!isColumnCapabilityEnabled(column,'order')" :aria-label="'拖动排序 '+column.title" :draggable="isColumnCapabilityEnabled(column,'order')" @dragstart="draggedId=column.id" @dragend="draggedId=undefined" @keydown="moveKey(column.id,$event)"><TableIcon name="grip" :size="12" /></button>
                <button class="bt-settings-pick__label" :aria-label="'编辑列 '+column.title" @click="selectedId=column.id"><span>{{column.title}}</span><small>{{column.visible===false?'隐藏':column.fixed==='left'?'左侧冻结':column.fixed==='right'?'右侧冻结':'显示'}}</small></button>
              </div>
            </div>
            <p>勾选用于批量样式，不会隐藏列。</p>
          </aside>
          <main v-if="selected" class="bt-settings-detail">
            <div class="bt-settings-detail__heading"><div><h3>当前编辑：{{selected.title}}</h3><small>{{selected.type==='number'||selected.type==='currency'?'数值字段':'文本字段'}} · {{selected.visible===false?'隐藏中':'显示中'}}</small></div><button class="bt-settings-text" @click="emit('reset',selected.id)">恢复此列</button></div>
            <nav class="bt-settings-sections" aria-label="列设置内容"><button class="is-active">基本</button><button v-for="name in ['筛选','映射','模板','试算']" :key="name" disabled title="此设置尚未迁移">{{name}}</button></nav>
            <section class="bt-settings-section">
              <div class="bt-settings-grid bt-settings-grid--two">
                <label class="bt-settings-field"><span>显示名称</span><input aria-label="显示名称" :value="selected.title" :disabled="!can('rename')" @input="patch({title:($event.target as HTMLInputElement).value})"><small>原名称：{{selectedBase?.title??selected.title}}</small></label>
                <label class="bt-settings-field"><span>列宽（px）</span><input type="number" aria-label="列宽（px）" :min="getColumnWidthBounds(selected).min" :max="getColumnWidthBounds(selected).max" :value="editableColumnWidth(selected)" :disabled="!can('width')" :aria-invalid="!!widthError" @input="width(($event.target as HTMLInputElement).value)"><small v-if="!widthError">允许 {{getColumnWidthBounds(selected).min}}–{{getColumnWidthBounds(selected).max}} px</small><small v-else class="bt-settings-error">{{widthError}}</small><input class="bt-settings-width-range" type="range" :aria-label="selected.title+'列宽'" :min="getColumnWidthBounds(selected).min" :max="getColumnWidthBounds(selected).max" :value="editableColumnWidth(selected)" :disabled="!can('width')" @input="width(($event.target as HTMLInputElement).value)"></label>
              </div>
              <div class="bt-settings-inline"><label class="bt-settings-check"><input type="checkbox" aria-label="显示此列" :checked="selected.visible!==false" :disabled="!can('visible')" @change="patch({visible:($event.target as HTMLInputElement).checked})">显示此列</label><label class="bt-settings-check"><input type="checkbox" aria-label="允许排序" :checked="!!selected.sortable" :disabled="!can('sortable')" @change="patch({sortable:($event.target as HTMLInputElement).checked})">允许排序</label><span class="bt-settings-detail-pins">冻结位置<button v-for="side in ['left','right'] as const" :key="side" class="bt-settings-icon" :class="{'is-active':selected.fixed===side}" :disabled="!canPin(side)" :title="(side==='left'?'左冻结 ':'右冻结 ')+selected.title" :aria-pressed="selected.fixed===side" @click="pin(side)"><TableIcon :name="'pin-'+side" :size="15" /></button></span></div>
            </section>
            <div v-if="batchIds.length>1" class="bt-settings-batch"><span>已选择 {{batchIds.length}} 列</span><button class="bt-settings-text" @click="copyStyles">将当前文字样式应用到勾选列</button></div>
            <section v-for="section in styleSections" :key="section.key" class="bt-settings-section">
              <div class="bt-settings-section__heading"><h4>{{section.title}}</h4><button class="bt-settings-text" :disabled="!can(section.key)" @click="resetStyle(section.key)">恢复</button></div>
              <div class="bt-settings-grid bt-settings-grid--three">
                <label class="bt-settings-field"><span>字体</span><select :aria-label="section.title+'字体'" :value="selected[section.key]?.fontFamily??''" :disabled="!can(section.key)" @change="style(section.key,'fontFamily',($event.target as HTMLSelectElement).value)"><option value="">跟随表格</option><option value="sans-serif">无衬线</option><option value="serif">衬线</option><option value="monospace">等宽</option></select></label>
                <label class="bt-settings-field"><span>字号</span><select :aria-label="section.title+'字号'" :value="selected[section.key]?.fontSize??''" :disabled="!can(section.key)" @change="style(section.key,'fontSize',($event.target as HTMLSelectElement).value)"><option value="">跟随表格</option><option v-for="size in [10,11,12,13,14,15,16,18,20,22,24,28,32]" :key="size" :value="size">{{size}} px</option></select></label>
                <label class="bt-settings-field"><span>字重</span><select :aria-label="section.title+'字重'" :value="selected[section.key]?.fontWeight??''" :disabled="!can(section.key)" @change="style(section.key,'fontWeight',($event.target as HTMLSelectElement).value)"><option value="">默认</option><option value="normal">常规</option><option value="500">中等</option><option value="600">半粗</option><option value="bold">粗体</option></select></label>
                <div class="bt-settings-field"><span>对齐方式</span><div class="bt-settings-segmented"><button :aria-label="section.title+'默认对齐'" :aria-pressed="!selected[section.key]?.align" :disabled="!can(section.key)" @click="style(section.key,'align','')">默认</button><button v-for="align in alignments" :key="align.id" :aria-label="section.title+align.label" :aria-pressed="selected[section.key]?.align===align.id" :disabled="!can(section.key)" @click="style(section.key,'align',align.id)"><TableIcon :name="'align-'+align.id" :size="15" /></button></div></div>
                <label class="bt-settings-field bt-settings-color"><span>文字颜色</span><span><input type="color" :aria-label="section.title+'颜色选择'" :value="selected[section.key]?.color??'#29384e'" :disabled="!can(section.key)" @input="style(section.key,'color',($event.target as HTMLInputElement).value)"><input :aria-label="section.title+'文字颜色'" :value="selected[section.key]?.color??'#29384e'" :disabled="!can(section.key)" pattern="#[a-fA-F0-9]{6}" @change="style(section.key,'color',($event.target as HTMLInputElement).value)"><button class="bt-settings-text" :disabled="!can(section.key)" @click.prevent="style(section.key,'color','')">默认</button></span></label>
              </div>
            </section>
          </main>
          <div v-else class="bt-settings-empty">暂无可设置的列</div>
        </div>
        <main v-else class="bt-settings-sort-page">
          <div class="bt-settings-sort-heading"><div><h3>按优先级排序</h3><p>从上到下依次比较，排序后再分页。</p></div><button class="bt-settings-button" :disabled="!unusedSortColumns.length" @click="addSort"><TableIcon name="plus" :size="14" />添加排序规则</button></div>
          <div v-for="(sort,index) in sorts" :key="index" class="bt-settings-sort-rule"><span class="bt-settings-sort-index">{{index+1}}</span><label class="bt-settings-field"><span>排序字段</span><select :aria-label="'排序字段 '+(index+1)" :value="sort.field" @change="changeSort(index,{field:($event.target as HTMLSelectElement).value})"><option v-for="column in sortableColumns" :key="column.id" :value="column.field" :disabled="sorts.some((other,position)=>position!==index&&other.field===column.field)">{{column.title}}</option></select></label><label class="bt-settings-field"><span>顺序</span><select :aria-label="'排序方式 '+(index+1)" :value="sort.order" @change="changeSort(index,{order:($event.target as HTMLSelectElement).value as 'asc'|'desc'})"><option value="asc">升序</option><option value="desc">降序</option></select></label><div class="bt-settings-sort-actions"><button class="bt-settings-icon" :aria-label="'上移排序规则 '+(index+1)" :disabled="index===0" @click="moveSort(index,-1)"><TableIcon name="chevron-down" :size="14" class="bt-settings-sort-up" /></button><button class="bt-settings-icon" :aria-label="'下移排序规则 '+(index+1)" :disabled="index===sorts.length-1" @click="moveSort(index,1)"><TableIcon name="chevron-down" :size="14" /></button><button class="bt-settings-icon" :aria-label="'删除排序规则 '+(index+1)" @click="removeSort(index)"><TableIcon name="close" :size="14" /></button></div></div>
          <div v-if="!sorts.length" class="bt-settings-empty"><TableIcon name="sort" :size="30"/><p>未设置排序</p><small>添加规则，或点击表头调整排序。</small></div>
        </main>
        <section class="bt-settings-preview" data-testid="settings-preview">
          <header><strong>{{previewMode==='table'?'整表预览':'当前对象预览'}}</strong><span>仅预览，不执行业务操作</span><div class="bt-settings-preview__controls"><div class="bt-settings-segmented"><button :aria-pressed="previewMode==='column'" @click="previewMode='column'">当前对象</button><button :aria-pressed="previewMode==='table'" @click="previewMode='table'">整表</button></div><button class="bt-settings-text" :aria-expanded="previewOpen" @click="previewOpen=!previewOpen">{{previewOpen?'收起预览':'展开预览'}}</button></div></header>
          <div v-if="previewOpen" class="bt-settings-preview__content">
            <label v-if="sortedSamples.length" class="bt-settings-preview__sample">样例<select v-model="sampleIndex" aria-label="预览样例"><option v-for="(item,index) in sortedSamples" :key="index" :value="index">{{sampleName(item,index)}}</option></select></label>
            <div class="bt-settings-preview__scroll"><table class="bt-settings-preview__table" :style="{width:previewColumns.reduce((total,column)=>total+editableColumnWidth(column),0)+'px'}" inert><colgroup><col v-for="column in previewColumns" :key="column.id" :style="{width:editableColumnWidth(column)+'px'}"></colgroup><thead><tr><th v-for="column in previewColumns" :key="column.id" :style="{textAlign:column.align,...columnTextCss(column.headerStyle)}">{{column.title}}<small v-if="column.sortable"> ↕</small></th></tr></thead><tbody><tr v-if="row"><td v-for="column in previewColumns" :key="column.id" :style="{textAlign:column.align,...columnTextCss(column.cellStyle)}"><CellRenderer v-if="previewCell" :value="getValue(row,column.field)" :row="row" :column="column" :renderer="previewCell"/><span v-else-if="mapStyle(getValue(row,column.field),column.valueMap)" class="bt-tag" :style="{color:mapStyle(getValue(row,column.field),column.valueMap)?.color,background:mapStyle(getValue(row,column.field),column.valueMap)?.background}">{{displayValue(getValue(row,column.field),column)}}</span><span v-else>{{displayValue(getValue(row,column.field),column)}}</span></td></tr><tr v-else><td :colspan="Math.max(previewColumns.length,1)" class="bt-settings-empty">暂无样例数据</td></tr></tbody></table></div>
          </div>
        </section>
        <p v-if="error" class="bt-settings-error" role="alert">{{error}}</p>
        <footer class="bt-settings-drawer__footer"><div><button class="bt-settings-text" @click="resetPage">恢复当前页</button><button class="bt-settings-text" @click="resetAll">恢复全部</button></div><button class="bt-settings-button" :disabled="saving" @click="emit('cancel')">取消</button><button class="bt-settings-button bt-settings-button--primary" :disabled="!dirty||saving||!!widthError" @click="emit('apply')">{{saving?'保存中…':'应用'}}</button></footer>
        <div v-if="discardConfirmation" class="bt-settings-discard-backdrop"><section ref="discardDialog" class="bt-settings-discard" role="alertdialog" aria-modal="true" aria-label="放弃未应用的修改"><h3>修改尚未应用</h3><p>离开后，本次修改不会保存。</p><footer><button class="bt-settings-button" @click="continueEditing">继续编辑</button><button class="bt-settings-button bt-settings-button--primary" @click="emit('cancel')">放弃修改</button></footer></section></div>
      </section>
    </div>
  </Teleport>
</template>
