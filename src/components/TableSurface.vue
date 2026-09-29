<script setup lang="ts" generic="T extends RowData">
import {computed,ref,type VNodeChild} from 'vue'
import {VxeTable,VxeColumn} from 'vxe-table'
import type {ColumnConfig,RowData} from '../types'
import type {TableRuntime} from '../runtime/useTableRuntime'
import type {ColumnHeaderContext} from '../features/columns/header'
import type {RangeSelectionContext} from '../features/range-selection/context'
import {getSettingsColumnFieldAccess} from '../features/settings/policy'
import {displayValue,getValue} from '../core'
import {columnTextCss as textStyle} from './settingsTypes'
import {useNarrowTable} from '../presentation/useNarrowTable'
import {useTableViewport,scrollViewportByKey} from '../presentation/useTableViewport'
import {resolveColumnLayout} from '../presentation/columnLayout'
import {rangePointer,rangeKey} from '../features/range-selection/surface'
import BusinessCell from './BusinessCell.vue'
import CellRenderer from './CellRenderer'
import ColumnHeader from '../features/columns/ColumnHeader.vue'
import TableIcon from './TableIcon.vue'
const props=defineProps<{runtime:TableRuntime<T>;container?:HTMLElement;tableKey?:string;rowKey?:string;title?:string;selection?:boolean;fill?:boolean;loading?:boolean;hasActions?:boolean;rangeContext?:RangeSelectionContext;columnHeader?:(column:ColumnConfig)=>ColumnHeaderContext;cellRenderer?:(value:unknown,row:RowData,column:ColumnConfig)=>VNodeChild}>()
const emit=defineEmits<{cellAction:[{action:'open'|'copy';row:T;column:ColumnConfig<T>}]}>()
const runtime=props.runtime
const {rows,page,pageSize,busy,error,allResolvedColumns,resolvedColumns,presentation,selected,allSelected,someSelected,rowId,selectRow,selectPage,report}=runtime
const viewportElement=ref<HTMLElement>(),gridElement=ref<{recalculate:(full?:boolean)=>Promise<void>}>()
function recalculateGrid(){void gridElement.value?.recalculate(true).catch(cause=>{error.value=cause instanceof Error?cause.message:String(cause)})}
const narrow=useNarrowTable(computed(()=>props.container),recalculateGrid)
const viewportSize=useTableViewport(viewportElement,recalculateGrid,()=>viewportElement.value?.querySelector<HTMLElement>('.vxe-table--main-wrapper .vxe-table--header-wrapper')??undefined)
const dataColumns=computed(()=>resolvedColumns.value.filter(column=>column.kind!=='actions'))
const columnLayout=computed(()=>resolveColumnLayout(resolvedColumns.value.filter(column=>column.kind!=='actions'||props.hasActions),viewportSize.value.width,(props.selection?44:0)+(presentation.value.appearance.index?48:0)))
const gridScrollbars=computed(()=>props.fill?{y:{visible:'visible' as const},x:{visible:columnLayout.value.totalWidth>viewportSize.value.frameWidth}}:undefined)
const marks=computed(()=>{void runtime.conditionalRules.value;return new Map(rows.value.map(row=>[rowId(row),runtime.conditionalRule(row)]))})
function rowMark(row:T,column:ColumnConfig<T>){const rule=marks.value.get(rowId(row));return rule&&dataColumns.value.find(item=>item.field===rule.condition.field)?.id===column.id?rule:undefined}
function rowClass({row}:{row:T}){return [selected.value.has(rowId(row))?'is-selected':'',marks.value.get(rowId(row))?'has-rule-mark':''].filter(Boolean).join(' ')}
function cellStyle({row}:{row:T}){const rule=marks.value.get(rowId(row));return rule&&!selected.value.has(rowId(row))?{backgroundColor:rule.background}:undefined}
function headerContext(column:ColumnConfig):ColumnHeaderContext{
  if(props.columnHeader)return props.columnHeader(column)
  return {column,get sorts(){return runtime.sorts.value},filterable:false,filtered:false,settings:false,access:field=>getSettingsColumnFieldAccess(column,field,runtime.settingsPolicy.value),patch:change=>runtime.patch(column.id,change),sort:order=>order===undefined?runtime.sort(column):runtime.setQuery({sorts:order===null?runtime.sorts.value.filter(item=>item.field!==column.field):[{field:column.field,order},...runtime.sorts.value.filter(item=>item.field!==column.field)]}),filter:()=>{},configure:()=>{}}
}
async function cellAction(action:'open'|'copy',row:T,column:ColumnConfig<T>){
  if(action==='copy')try{await navigator.clipboard.writeText(String(getValue(row,column.field)??''))}catch{error.value='浏览器未允许复制，请手动选择内容复制。'}
  emit('cellAction',{action,row,column})
}
function viewportKey(event:KeyboardEvent){if(!rangeKey(event,viewportElement.value,props.rangeContext,cause=>{error.value=cause instanceof Error?cause.message:String(cause)}))scrollViewportByKey(event,viewportElement.value?.querySelector<HTMLElement>('.vxe-table--main-wrapper .vxe-table--body-inner-wrapper'))}
defineExpose({narrow,columnLayout})
</script>
<template>
  <div ref="viewportElement" :id="tableKey?tableKey+'-viewport':undefined" class="bt__viewport" tabindex="0" role="region" :aria-label="(title??'数据列表')+'，可横向滚动'" @keydown="viewportKey" @pointerdown="rangePointer($event,rangeContext,'start')" @pointerover="rangePointer($event,rangeContext,'extend')">
  <vxe-table ref="gridElement" :auto-resize="false" :height="fill?viewportSize.height||undefined:undefined" :scrollbar-config="gridScrollbars" :row-class-name="rowClass" :cell-style="cellStyle" :data="rows" :loading="loading||busy" :border="false" :row-config="{isHover:presentation.appearance.hover,keyField:rowKey}">
    <template #loading><div v-if="loading||busy" class="bt__loading" role="status" aria-label="加载中">加载中…</div></template>
    <vxe-column v-if="selection" width="44" :fixed="narrow?undefined:'left'" class-name="bt__select-cell">
      <template #header><input type="checkbox" aria-label="选择当前页" :checked="allSelected" :indeterminate="someSelected" @change="event=>selectPage((event.target as HTMLInputElement).checked)"></template>
      <template #default="{row}"><input type="checkbox" :aria-label="'选择 '+rowId(row)" :checked="selected.has(rowId(row))" @change="event=>selectRow(row,(event.target as HTMLInputElement).checked)"></template>
    </vxe-column>
    <vxe-column v-if="presentation.appearance.index" type="seq" title="序号" width="48" :fixed="narrow?undefined:'left'" :seq-config="{startIndex:(page-1)*pageSize}"/>
    <vxe-column v-for="c in dataColumns" :key="c.id" :field="c.field" :title="c.title" :width="columnLayout.widths[c.id]" :min-width="c.minWidth??120" :fixed="narrow?undefined:c.fixed||undefined" :align="c.align??'left'" :header-align="c.headerStyle?.align??c.align??'left'" :sortable="false">
      <template #header><ColumnHeader :context="headerContext(c)"/></template>
      <template #default="{row}"><div class="bt__cell-content" :style="textStyle(c.cellStyle)" :data-range-row="rowId(row)" :data-range-column="c.id" :tabindex="rangeContext?.enabled?0:undefined" :role="rangeContext?.enabled?'gridcell':undefined" :aria-selected="rangeContext?.enabled?rangeContext.isSelected(rowId(row),c.id):undefined"><slot name="cell" :row="row" :column="c" :value="getValue(row,c.field)" :text="displayValue(getValue(row,c.field),c)"><CellRenderer v-if="cellRenderer&&c.renderer" :value="getValue(row,c.field)" :row="row" :column="c" :renderer="cellRenderer" @diagnostic="report"/><BusinessCell v-else :row="row" :column="c" :columns="allResolvedColumns" @action="cellAction($event,row,c)"/></slot><span v-if="rowMark(row,c)" class="bt-row-mark" :style="{color:rowMark(row,c)?.color,backgroundColor:rowMark(row,c)?.background}"><TableIcon name="info" :size="12" />{{rowMark(row,c)?.label}}</span></div></template>
    </vxe-column>
    <slot name="columns"/>
    <template #empty><div class="bt__empty">暂无数据</div></template>
  </vxe-table>
  </div>
</template>
