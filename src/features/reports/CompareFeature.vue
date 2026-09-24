<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DialogFrame from '../../ui/DialogFrame.vue'
import ReportTable from './ReportTable.vue'
import { getValue } from '../../runtime/value'
import type { ReportsContext } from './context'
import { buildComparison, compareLabel, normalizeCompareDefinition, reportColumns, type CompareDefinition } from './model'
import { comparisonBook, downloadReport } from './export'
import './reports.css'

const props = defineProps<{ context: ReportsContext<CompareDefinition> }>()
const definition = computed(() => normalizeCompareDefinition(props.context.definition, props.context.columns))
const chosen = ref(new Set<string>()), baseline = ref(''), search = ref(''), differences = ref(false), exportError = ref(''), exportNotice = ref(''), exporting = ref(false)
let mounted = true, exportRevision = 0
watch(() => JSON.stringify([[...chosen.value], baseline.value, differences.value]), () => { exportRevision++; exportNotice.value = '' }, { flush: 'sync' })
watch(() => props.context.rows, rows => {
  const available = new Set(rows.map(props.context.rowId))
  chosen.value = new Set(props.context.selectedIds.filter(id => available.has(id)).slice(0, 4))
  exportError.value = ''
}, { immediate: true })
const selectedRows = computed(() => props.context.rows.filter(row => chosen.value.has(props.context.rowId(row))))
watch(selectedRows, rows => { if (!rows.some(row => props.context.rowId(row) === baseline.value)) baseline.value = rows[0] ? props.context.rowId(rows[0]) : '' }, { immediate: true })
const available = computed(() => definition.value.recordLabelColumn !== '' && definition.value.labelColumns.length > 0 && reportColumns(props.context.columns).some(column => column.visible !== false))
const matches = computed(() => {
  const query = search.value.toLocaleLowerCase(), columns = props.context.columns.filter(column => definition.value.searchColumns.includes(column.id))
  return props.context.rows.filter(row => !query || columns.map(column => String(getValue(row, column.field) ?? '')).join(' ').toLocaleLowerCase().includes(query))
})
const table = computed(() => available.value ? buildComparison(props.context.rows, props.context.columns, definition.value, [...chosen.value], baseline.value, differences.value, props.context.rowId) : { headers: [], rows: [] })
const controlsDisabled = computed(() => props.context.disabled || props.context.loading)
function choose(id: string, checked: boolean) {
  if (controlsDisabled.value || !props.context.rows.some(row => props.context.rowId(row) === id) || checked && chosen.value.size >= 4) return
  const next = new Set(chosen.value); if (checked) next.add(id); else next.delete(id); chosen.value = next
}
function setSearch(value: string) { if (!controlsDisabled.value) search.value = value }
function setBase(value: string) { if (!controlsDisabled.value && selectedRows.value.some(row => props.context.rowId(row) === value)) baseline.value = value }
function setDifferences(value: boolean) { if (!controlsDisabled.value) differences.value = value }
async function save() {
  if (exporting.value || props.context.loading || !table.value.headers.length) return
  exporting.value = true; exportError.value = ''; exportNotice.value = ''
  const rows = props.context.rows, columns = props.context.columns, fingerprint = JSON.stringify(definition.value), revision = exportRevision
  try {
    const result = await downloadReport(comparisonBook(table.value, definition.value.exportName), definition.value.exportName, () => mounted && revision === exportRevision && props.context.rows === rows && props.context.columns === columns && JSON.stringify(definition.value) === fingerprint)
    if (mounted && result === 'cancelled') exportNotice.value = '导出已取消，内容已变化，请重新导出。'
  }
  catch (cause) { if (mounted) exportError.value = cause instanceof Error ? cause.message : String(cause) }
  finally { exporting.value = false }
}
onMounted(() => { void props.context.reload() })
onBeforeUnmount(() => { mounted = false; props.context.pause() })
</script>
<template>
  <DialogFrame title="记录对比" :subtitle="`选择 2–4 条${definition.recordName}，只读核对。默认第一条为基准，不修改任何数据。`" drawer class="bt-report-dialog" @close="context.close">
    <p v-if="context.loading" role="status" class="bt-ui-note">正在读取完整查询结果…</p>
    <p v-else-if="context.error" role="alert" class="bt-ui-error">{{ context.error }} <button type="button" class="bt-ui-button text" @click="context.reload">重新读取</button></p>
    <p v-else-if="!available" class="bt-ui-empty">没有可用的对比字段</p>
    <template v-else>
      <input class="bt-report-search" type="search" aria-label="搜索记录" :placeholder="definition.searchPlaceholder" :value="search" :disabled="controlsDisabled || !definition.searchColumns.length" @input="setSearch(($event.target as HTMLInputElement).value)">
      <div class="bt-report-picks"><label v-for="row in matches.slice(0, 100)" :key="context.rowId(row)" class="bt-report-pick"><input type="checkbox" :data-report-pick="context.rowId(row)" :checked="chosen.has(context.rowId(row))" :disabled="controlsDisabled || chosen.size >= 4 && !chosen.has(context.rowId(row))" @change="choose(context.rowId(row), ($event.target as HTMLInputElement).checked)">{{ compareLabel(row, definition.labelColumns, context.columns) }}</label><p v-if="matches.length > 100" class="bt-ui-note">仅列出前 100 条，请输入关键词缩小范围。</p><p v-else-if="!matches.length" class="bt-ui-note">没有符合条件的记录</p></div>
      <div class="bt-report-compare-controls"><label class="bt-ui-check"><input type="checkbox" aria-label="只看不同项" :checked="differences" :disabled="controlsDisabled" @change="setDifferences(($event.target as HTMLInputElement).checked)">只看不同项</label><label class="bt-ui-field">对比基准<select :value="baseline" aria-label="对比基准" :disabled="controlsDisabled || !selectedRows.length" @change="setBase(($event.target as HTMLSelectElement).value)"><option v-for="row in selectedRows" :key="context.rowId(row)" :value="context.rowId(row)">{{ compareLabel(row, [definition.recordLabelColumn], context.columns) }}</option></select></label></div>
      <p v-if="selectedRows.length < 2" class="bt-ui-empty">请至少选择两条记录</p>
      <ReportTable v-else :table="table" comparison/>
    </template>
    <p v-if="exportError" role="alert" class="bt-ui-error">{{ exportError }}</p>
    <p v-if="exportNotice" role="status" class="bt-ui-note">{{ exportNotice }}</p>
    <template #footer><button type="button" class="bt-ui-button" :disabled="!table.headers.length || context.loading || exporting" @click="save">导出对比</button><button type="button" class="bt-ui-button primary" @click="context.close">关闭</button></template>
  </DialogFrame>
</template>
