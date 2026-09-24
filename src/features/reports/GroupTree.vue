<script setup lang="ts">
import type { ColumnConfig } from '../../types'
import { reportValue, type ReportField, type ReportGroup } from './model'
import ReportTable from './ReportTable.vue'
defineProps<{ groups: readonly ReportGroup[]; columns: readonly ColumnConfig[]; fields: readonly ReportField[]; open: ReadonlySet<string>; unit: string }>()
const emit = defineEmits<{ toggle: [id: string, open: boolean] }>()
</script>
<template>
  <details v-for="group in groups" :key="group.id" class="bt-report-group" :open="open.has(group.id)" @toggle="emit('toggle', group.id, ($event.currentTarget as HTMLDetailsElement).open)">
    <summary><strong>{{ group.label }}</strong><span>{{ group.count }} {{ unit }}</span><span v-if="group.summaries.length" class="bt-report-totals"><span v-for="summary in group.summaries" :key="summary.columnId" :title="summary.label">{{ group.summaries.length > 1 ? summary.label + '：' : '' }}{{ summary.cell.text }}</span></span></summary>
    <div v-if="group.children.length" class="bt-report-nested"><GroupTree :groups="group.children" :columns="columns" :fields="fields" :open="open" :unit="unit" @toggle="(id, value) => emit('toggle', id, value)"/></div>
    <ReportTable v-else-if="fields.length" :table="{ headers: fields.map(field => field.label ?? columns.find(column => column.id === field.columnId)?.title ?? field.columnId), rows: group.rows.map(row => fields.map(field => reportValue(row, field, columns))) }"/>
    <p v-else class="bt-ui-empty">没有可用的明细字段</p>
  </details>
</template>
