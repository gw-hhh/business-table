<script setup lang="ts" generic="T extends RowData">
import type {Action,ColumnConfig,RowData} from '../types'
import type {RowActionLayout} from '../features/presentation/model'
import ActionStrip from './ActionStrip.vue'
import TableIcon from './TableIcon.vue'
import {columnTextCss} from './settingsTypes'
const props=defineProps<{context:{fixed?:'left'|'right'|false;actions:Action<T>[];column?:ColumnConfig;layout?:RowActionLayout;rowId:(row:T)=>string;reportError:(cause:unknown)=>void;headerMenu?:(event:MouseEvent)=>void}}>()
</script>
<template>
  <vxe-column v-if="context.actions.length&&context.column?.visible!==false" :title="context.column?.title??'操作'" :width="context.column?.width??195" :fixed="context.fixed===false?undefined:context.fixed??'right'" class-name="bt__action-column" :align="context.column?.cellStyle?.align??context.layout?.align??'left'" :header-align="context.column?.headerStyle?.align??'left'">
    <template #header><span :style="columnTextCss(context.column?.headerStyle)">{{context.column?.title??'操作'}}</span><button v-if="context.headerMenu" class="bt-header-menu-trigger" aria-label="操作列菜单" @click="context.headerMenu"><TableIcon name="chevron-down" :size="12" /></button></template>
    <template #default="{row}"><div :style="columnTextCss(context.column?.cellStyle)"><ActionStrip :row="row" :actions="context.actions" :layout="context.layout" :row-id="context.rowId" :report-error="context.reportError" /></div></template>
  </vxe-column>
</template>
