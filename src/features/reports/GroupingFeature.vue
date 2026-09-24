<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DialogFrame from '../../ui/DialogFrame.vue'
import GroupTree from './GroupTree.vue'
import type { ReportsContext } from './context'
import { groupRecords, normalizeGroupingDefinition, type GroupingDefinition, type ReportGroup } from './model'
import { downloadReport, groupingBook } from './export'
import './reports.css'

const props = defineProps<{ context: ReportsContext<GroupingDefinition> }>()
const definition = computed(() => normalizeGroupingDefinition(props.context.definition, props.context.columns))
const selected = ref<string[]>([]), expanded = ref(new Set<string>()), exportError = ref(''), exportNotice = ref(''), exporting = ref(false)
let mounted = true, exportRevision = 0
watch(() => JSON.stringify(selected.value), () => { exportRevision++; exportNotice.value = '' }, { flush: 'sync' })
watch(definition, value => {
  const current = selected.value.filter(id => value.groupColumns.includes(id))
  selected.value = current.length ? current.slice(0, 2) : value.defaultGroups.length ? [...value.defaultGroups] : value.groupColumns.slice(0, 1)
}, { immediate: true })
const groups = computed(() => groupRecords(props.context.rows, props.context.columns, definition.value, selected.value))
watch(groups, () => { expanded.value = new Set(); exportError.value = '' })
const firstChoices = computed(() => definition.value.groupColumns.flatMap(id => props.context.columns.find(column => column.id === id) ?? []))
const secondChoices = computed(() => firstChoices.value.filter(column => column.id !== selected.value[0]))
const controlsDisabled = computed(() => props.context.disabled || props.context.loading)
function selectGroup(index: number, value: string) {
  if (controlsDisabled.value || value && !definition.value.groupColumns.includes(value)) return
  if (index === 0) selected.value = [value, selected.value[1] === value ? '' : selected.value[1] ?? ''].filter(Boolean)
  else selected.value = [selected.value[0] ?? '', value !== selected.value[0] ? value : ''].filter(Boolean)
}
function toggle(id: string, open: boolean) {
  if (expanded.value.has(id) === open) return
  const next = new Set(expanded.value); if (open) next.add(id); else next.delete(id); expanded.value = next
}
function expandAll() {
  const ids: string[] = []
  function collect(items: readonly ReportGroup[]) { for (const group of items) { ids.push(group.id); collect(group.children) } }
  collect(groups.value); expanded.value = new Set(ids)
}
async function save() {
  if (exporting.value || props.context.loading || !groups.value.length) return
  exporting.value = true; exportError.value = ''; exportNotice.value = ''
  const rows = props.context.rows, columns = props.context.columns, fingerprint = JSON.stringify(definition.value), revision = exportRevision
  try {
    const result = await downloadReport(groupingBook(groups.value, definition.value), definition.value.exportName, () => mounted && revision === exportRevision && props.context.rows === rows && props.context.columns === columns && JSON.stringify(definition.value) === fingerprint)
    if (mounted && result === 'cancelled') exportNotice.value = '导出已取消，内容已变化，请重新导出。'
  }
  catch (cause) { if (mounted) exportError.value = cause instanceof Error ? cause.message : String(cause) }
  finally { exporting.value = false }
}
onMounted(() => { void props.context.reload() })
onBeforeUnmount(() => { mounted = false; props.context.pause() })
</script>
<template>
  <DialogFrame title="分组汇总" :subtitle="`完整查询结果 ${context.rows.length} 条。此面板只读，不改变原表格排序和分页。`" drawer class="bt-report-dialog" @close="context.close">
    <div v-if="firstChoices.length" class="bt-report-group-controls">
      <label class="bt-ui-field">第一分组<select :value="selected[0] ?? ''" aria-label="第一分组" :disabled="controlsDisabled" @change="selectGroup(0, ($event.target as HTMLSelectElement).value)"><option v-for="column in firstChoices" :key="column.id" :value="column.id">{{ column.title }}</option></select></label>
      <label class="bt-ui-field">第二分组<select :value="selected[1] ?? ''" aria-label="第二分组" :disabled="controlsDisabled" @change="selectGroup(1, ($event.target as HTMLSelectElement).value)"><option value="">不再分组</option><option v-for="column in secondChoices" :key="column.id" :value="column.id">{{ column.title }}</option></select></label>
    </div>
    <p v-if="context.loading" role="status" class="bt-ui-note">正在读取完整查询结果…</p>
    <p v-else-if="context.error" role="alert" class="bt-ui-error">{{ context.error }} <button type="button" class="bt-ui-button text" @click="context.reload">重新读取</button></p>
    <p v-else-if="!firstChoices.length" class="bt-ui-empty">没有可用的分组字段</p>
    <p v-else-if="!context.rows.length" class="bt-ui-empty">没有符合条件的记录</p>
    <GroupTree v-else :groups="groups" :columns="context.columns" :fields="definition.detailColumns" :open="expanded" :unit="definition.recordUnit" @toggle="toggle"/>
    <p v-if="exportError" role="alert" class="bt-ui-error">{{ exportError }}</p>
    <p v-if="exportNotice" role="status" class="bt-ui-note">{{ exportNotice }}</p>
    <template #footer><button type="button" class="bt-ui-button" :disabled="!groups.length" @click="expandAll">展开全部</button><button type="button" class="bt-ui-button" :disabled="!groups.length" @click="expanded = new Set()">收起全部</button><button type="button" class="bt-ui-button" :disabled="!groups.length || context.loading || exporting" @click="save">导出汇总</button><button type="button" class="bt-ui-button primary" @click="context.close">关闭</button></template>
  </DialogFrame>
</template>
