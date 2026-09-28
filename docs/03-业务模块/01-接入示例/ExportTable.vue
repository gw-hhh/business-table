<script setup lang="ts">
import { ref } from 'vue'
import {
  BusinessTable, ExportDialog, TemplateDownloadDialog,
  type ExportField, type ExportGroup, type TemplateDefinition,
} from '@company/business-table'
import { columns, rows, type Asset } from './assets'

const table = ref<{ readRows: (scope: 'query') => Promise<Asset[]> }>()
const groups = ref<ExportGroup[]>()
const templateOpen = ref(false)
const busy = ref(false)
const error = ref('')
const fields: ExportField[] = columns.map(column => ({
  id: column.id, label: column.title, column, total: column.id === 'amount',
}))
const template: TemplateDefinition = {
  fields: fields.map(field => ({ ...field, hint: field.id === 'status' ? '填写原值：0 草稿、1 已确认' : `填写${field.label}` })),
  examples: rows.slice(0, 1),
}
async function openExport() {
  if (!table.value || busy.value) return
  busy.value = true
  error.value = ''
  try { groups.value = [{ id: 'query', label: '当前查询结果', rows: await table.value.readRows('query') }] }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '读取导出数据失败' }
  finally { busy.value = false }
}
</script>

<template>
  <button :disabled="busy" @click="openExport">导出当前查询</button>
  <button @click="templateOpen = true">下载模板</button>
  <p v-if="error" role="alert">{{ error }}</p>
  <BusinessTable ref="table" :columns="columns" :data="rows" :features="{ search: true }" />
  <ExportDialog v-if="groups" :fields="fields" :groups="groups" filename="物料" @close="groups = undefined" />
  <TemplateDownloadDialog v-if="templateOpen" :definition="template" filename="物料模板" @close="templateOpen = false" />
</template>
