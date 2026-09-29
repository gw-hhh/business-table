<script setup lang="ts" generic="T extends RowData">
import {computed,ref,type VNodeChild} from 'vue'
import type {RowData,ColumnConfig} from '../types'
import type {TableRuntime} from '../runtime/useTableRuntime'
import type {ColumnHeaderContext} from '../features/columns/header'
import {fontFamilyCss} from '../config/font-families'
import TableSurface from './TableSurface.vue'
const props=defineProps<{runtime:TableRuntime<T>;title?:string;fill?:boolean;loading?:boolean;hasActions?:boolean;columnHeader?:(column:ColumnConfig)=>ColumnHeaderContext;cellRenderer?:(value:unknown,row:RowData,column:ColumnConfig)=>VNodeChild}>()
const emit=defineEmits<{cellAction:[{action:'open'|'copy';row:T;column:ColumnConfig<T>}]}>()
const tableElement=ref<HTMLElement>()
const surface=ref<{narrow:boolean}>()
const appearance=computed(()=>props.runtime.presentation.value.appearance)
const style=computed(()=>({'--bt-font':fontFamilyCss(appearance.value.fontFamily),'--bt-body-size':appearance.value.fontSize+'px','--bt-header-size':appearance.value.headerFontSize+'px','--bt-body-color':appearance.value.color,'--bt-header-color':appearance.value.headerColor}))
</script>
<template>
  <section ref="tableElement" class="bt" :class="{'bt--fill':fill,'bt--narrow':surface?.narrow,['bt--'+appearance.density]:true,['bt-border--'+appearance.border]:true,'bt--stripe':appearance.stripe,'bt--no-hover':!appearance.hover}" :style="style" data-business-table :aria-busy="Boolean(loading||runtime.busy.value)">
    <div v-if="runtime.error.value" class="bt__error" role="alert">{{runtime.error.value}}</div>
    <TableSurface ref="surface" :container="tableElement" :runtime="runtime" :table-key="runtime.tableKey.value" :row-key="runtime.rowKey.value" :selection="runtime.selectionEnabled.value" :title="title" :fill="fill" :loading="loading" :has-actions="hasActions" :column-header="columnHeader" :cell-renderer="cellRenderer" @cell-action="emit('cellAction',$event)">
      <template v-if="$slots.cell" #cell="scope"><slot name="cell" v-bind="scope"/></template>
      <template #columns><slot name="columns"/></template>
    </TableSurface>
  </section>
</template>
