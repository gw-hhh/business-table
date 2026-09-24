<script setup lang="ts" generic="T extends RowData">
import { computed, ref, watch, type VNodeChild } from 'vue'
import BusinessTable from './BusinessTable.vue'
import { displayValue } from './core'
import type { ConfigDiagnostic } from './config/diagnostics'
import { resolveFeatureGate, type DataToolName, type TableFeatures } from './config/features'
import { createPreferenceDelta, resolveConfiguration } from './config/schema'
import type { PreferenceV3, TableDefinition } from './config/types'
import { createRegistry, resolveRenderer, resolveRowActions, type RuntimeRegistry } from './runtime/registry'
import type { FilterPlanPersistence } from './features/filters/plans'
import type { ColumnConfig, DataSource, Persistence, Query, RowData, TableConfig, ViewConfig } from './types'
import type { ToolDefinition } from './features/presentation/model'

const props = defineProps<{
  definition: TableDefinition
  remoteOverride?: unknown
  preference?: unknown
  savePreference?: (preference: PreferenceV3) => Promise<void>
  data?: T[]
  dataSource?: DataSource<T>
  registry?: RuntimeRegistry<T>
  tools?: {page:readonly ToolDefinition[];table:readonly ToolDefinition[]}
  views?: ViewConfig[]
  filterPlanPersistence?: FilterPlanPersistence | null
  querySummary?: boolean
  loading?: boolean
}>()
const emit = defineEmits<{
  preferenceChange: [PreferenceV3]
  queryChange: [Query]
  viewChange: [string | null]
  diagnostic: [ConfigDiagnostic]
}>()

const table = ref<{
  reload: () => void | Promise<void>
  activateFeature: (name: keyof TableFeatures) => Promise<unknown>
  getFeatureContext: (name: keyof TableFeatures) => unknown
  openDataTool: (name: DataToolName) => Promise<void>
}>()
const resolved = computed(() => resolveConfiguration({
  definition: props.definition,
  remoteOverride: props.remoteOverride,
  preference: props.preference,
}))
const config = computed<TableConfig>(() => ({
  schemaVersion: 1,
  tableKey: props.definition.tableKey,
  columns: resolved.value.preference?.columns ?? {},
  presentation:resolved.value.preference?.presentation,
  ...(resolved.value.preference?.conditionalFormatting === undefined ? {} : { conditionalFormatting: resolved.value.preference.conditionalFormatting }),
  pageSize: resolved.value.pageSize,
}))
const pagination = computed(() => ({
  pageSize: resolved.value.pageSize,
  pageSizeOptions: resolved.value.pageSizeOptions,
}))
const features = computed(() => props.definition.features as TableFeatures | undefined)
// Keep feature details opaque here. BusinessTable reads them only after activation.
const remoteFeatures = computed(() => {
  let source = props.remoteOverride
  if (typeof source === 'string') {
    try { source = JSON.parse(source) as unknown } catch { return undefined }
  }
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return undefined
  const value = (source as Record<string, unknown>).features
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
})
const searchDefinition = computed(() => resolveFeatureGate(props.definition.features?.search, remoteFeatures.value?.search).enabled
  ? props.definition.search : undefined)
const settingsDefinition = computed(() => resolveFeatureGate(props.definition.features?.columnSettings, remoteFeatures.value?.columnSettings).enabled
  ? props.definition.settings : Object.hasOwn(props.definition, 'settings') ? {} : undefined)
const toolEnabled = (name: DataToolName) => resolveFeatureGate(features.value?.[name], remoteFeatures.value?.[name]).enabled
const conditionalFormatting = computed(() => toolEnabled('conditionalFormatting') ? props.definition.conditionalFormatting : undefined)
const grouping = computed(() => toolEnabled('grouping') ? props.definition.grouping : undefined)
const compare = computed(() => toolEnabled('compare') ? props.definition.compare : undefined)
const rangeSelection = computed(() => toolEnabled('rangeSelection') ? props.definition.rangeSelection : undefined)
const settingsOverride = computed(() => {
  if (!resolveFeatureGate(props.definition.features?.columnSettings, remoteFeatures.value?.columnSettings).enabled) return undefined
  let value = props.remoteOverride
  if (typeof value === 'string') { try { value = JSON.parse(value) as unknown } catch { return undefined } }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string,unknown>).settings : undefined
})
const extensionErrors=new Set<string>()
function report(diagnostic: ConfigDiagnostic) {
  if(diagnostic.code==='RuntimeExtensionError'){
    const key=diagnostic.path+':'+diagnostic.message
    if(extensionErrors.has(key))return
    extensionErrors.add(key)
  }
  emit('diagnostic', diagnostic)
}
watch(() => resolved.value.diagnostics, diagnostics => diagnostics.forEach(report), { immediate: true })

function preferenceDelta(next: TableConfig) {
  return createPreferenceDelta(
    props.definition.tableKey,
    resolved.value.baseColumns,
    next,
    resolved.value.basePageSize,
    resolved.value.basePresentation,
  )
}
function changeConfig(next: TableConfig) { emit('preferenceChange', preferenceDelta(next)) }
// The host owns initial loading. An explicit writer participates in Runtime's atomic save.
const persistence = computed<Persistence | null>(() => {
  const writer = props.savePreference
  return writer ? { load: async () => config.value, save: async (_tableKey, next) => { await writer(preferenceDelta(next)) } } : null
})

let fallbackRegistry: RuntimeRegistry<T> | undefined
function registry() {
  return props.registry ?? (fallbackRegistry ??= createRegistry<T>({ onDiagnostic: report }))
}
function actionProvider(details: { allowedItems?: string[] }) {
  if (!details.allowedItems?.length) return []
  return resolveRowActions(registry(), details.allowedItems,undefined,undefined,report)
}
function renderCell(value: unknown, row: RowData, column: ColumnConfig): VNodeChild {
  if (!column.renderer) return displayValue(value, column)
  return resolveRenderer(registry(), column.renderer,report)(value, row as T, column)
}

defineExpose({
  reload: () => table.value?.reload(),
  activateFeature: (name: keyof TableFeatures) => table.value?.activateFeature(name),
  getFeatureContext: (name: keyof TableFeatures) => table.value?.getFeatureContext(name),
  openDataTool: (name: DataToolName) => table.value?.openDataTool(name),
})
</script>

<template>
  <BusinessTable
    ref="table"
    :table-key="definition.tableKey"
    :row-key="definition.rowKey ?? 'id'"
    :title="definition.title"
    :columns="resolved.baseColumns"
    :config="config"
    :persistence="persistence"
    :presentation="resolved.basePresentation"
    :pagination="pagination"
    :features="features"
    :remote-features="remoteFeatures"
    :search-definition="searchDefinition"
    :settings-definition="settingsDefinition"
    :settings-override="settingsOverride"
    :conditional-formatting="conditionalFormatting"
    :grouping="grouping"
    :compare="compare"
    :range-selection="rangeSelection"
    :tools="tools"
    :registry="registry()"
    :data="data"
    :data-source="dataSource"
    :views="views"
    :filter-plan-persistence="filterPlanPersistence"
    :query-summary="querySummary"
    :loading="loading"
    :action-provider="actionProvider"
    :cell-renderer="renderCell"
    @config-change="changeConfig"
    @query-change="emit('queryChange', $event)"
    @view-change="emit('viewChange', $event)"
    @diagnostic="report"
  >
    <template v-for="(_, name) in $slots" #[name]="scope">
      <slot :name="name" v-bind="scope ?? {}" />
    </template>
  </BusinessTable>
</template>
