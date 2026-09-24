<script setup lang="ts" generic="T extends RowData">
import { computed, ref, shallowReactive } from 'vue'
import FeatureHost from './FeatureHost.vue'
import { dataToolDisabled, featureEntryVisible, readFeatureDetails, resolveFeatureGate, type DataToolName, type TableFeatures } from '../config/features'
import TableIcon from './TableIcon.vue'
import type { RowData } from '../types'
import type { TableRuntime } from '../runtime/useTableRuntime'
import type { ConditionalFormattingDefinition } from '../features/conditional-formatting/model'
import type { ConditionalFormattingContext } from '../features/conditional-formatting/context'
import type { GroupingDefinition, CompareDefinition } from '../features/reports/model'
import type { ReportsContext } from '../features/reports/context'
import type { RangeSelectionContext, RangeSelectionDefinition } from '../features/range-selection/context'
import type { FeatureContextControls, FeatureHostHandle, DataToolsHandle } from '../features/data-tools'
import type { ConfigDiagnostic } from '../config/diagnostics'

const props = defineProps<{
  runtime: TableRuntime<T>; features: TableFeatures; remoteFeatures?: Record<string, unknown>
  conditionalFormatting?: ConditionalFormattingDefinition; grouping?: GroupingDefinition; compare?: CompareDefinition; rangeSelection?: RangeSelectionDefinition
}>()
const emit = defineEmits<{ diagnostic: [ConfigDiagnostic] }>()
const marksHost = ref<FeatureHostHandle<ConditionalFormattingContext>>()
const groupingHost = ref<FeatureHostHandle<ReportsContext<GroupingDefinition>>>()
const compareHost = ref<FeatureHostHandle<ReportsContext<CompareDefinition>>>()
const rangeHost = ref<FeatureHostHandle<RangeSelectionContext>>()
const gate = (name: DataToolName) => resolveFeatureGate(props.features[name], props.remoteFeatures?.[name], 'on-interaction')
const disabled = (name: DataToolName) => dataToolDisabled(props.features[name], props.remoteFeatures?.[name])
const declaredItems = computed(() => props.runtime.allResolvedColumns.value.filter(column => column.kind !== 'actions').map(column => column.id))
function liveAllowed(name: DataToolName, initial?: readonly string[]): string[] {
  if (!gate(name).enabled) return []
  const current = readFeatureDetails(props.features[name], props.remoteFeatures?.[name], undefined, declaredItems.value).allowedItems ?? []
  const declared = new Set(declaredItems.value)
  return current.filter(id => declared.has(id) && (!initial || initial.includes(id)))
}
function narrowedRuntime(name: DataToolName, allowedItems: readonly string[] | undefined, controls: FeatureContextControls) {
  const retained = ref(true)
  controls.onDispose(() => { retained.value = false })
  return { ...props.runtime, allResolvedColumns: computed(() => {
    if (!retained.value || !controls.isActive()) return []
    const allowed = liveAllowed(name, allowedItems)
    return props.runtime.allResolvedColumns.value.filter(column => allowed.includes(column.id))
  }) }
}
async function createMarks(details: { allowedItems?: string[] }, controls: FeatureContextControls): Promise<ConditionalFormattingContext> {
  const { guardConditionalRules, conditionalColumn } = await import('../features/conditional-formatting/model')
  const columns = () => !controls.isActive() ? [] : props.runtime.allResolvedColumns.value.filter(column => liveAllowed('conditionalFormatting', details.allowedItems).includes(column.id)
    && (!props.conditionalFormatting?.allowedColumns || props.conditionalFormatting.allowedColumns.includes(column.id)))
  const guard = () => { if (!controls.isActive()) throw new Error('条件标记已失效，请重新打开。') }
  return shallowReactive({
    get columns() { return columns() }, get rules() { return props.runtime.conditionalRules.value },
    get disabled() { return disabled('conditionalFormatting') }, get defaultColumn() { return props.conditionalFormatting?.defaultColumn },
    async apply(rules) { guard(); if (disabled('conditionalFormatting')) throw new Error('条件标记为只读。'); await props.runtime.setConditionalRules(guardConditionalRules(rules, columns())) },
    async optionsFor(column, search, signal) { guard(); if (!columns().some(item => item.id === column.id)) throw new Error('标记字段已不可用。'); return props.runtime.optionsFor(conditionalColumn(column), search, signal) },
    close: controls.close,
  } satisfies ConditionalFormattingContext)
}
async function createGrouping(details: { allowedItems?: string[] }, controls: FeatureContextControls) {
  const { createReportsContext } = await import('../features/reports/context')
  return createReportsContext(narrowedRuntime('grouping', details.allowedItems, controls), () => props.grouping ?? {}, { ...controls, isDisabled: () => disabled('grouping') })
}
async function createCompare(details: { allowedItems?: string[] }, controls: FeatureContextControls) {
  const { createReportsContext } = await import('../features/reports/context')
  return createReportsContext(narrowedRuntime('compare', details.allowedItems, controls), () => props.compare ?? {}, { ...controls, isDisabled: () => disabled('compare') })
}
async function createRange(details: { allowedItems?: string[] }, controls: FeatureContextControls) {
  const { createRangeSelectionContext } = await import('../features/range-selection/context')
  return createRangeSelectionContext({
    rows: () => props.runtime.rows.value, columns: () => !controls.isActive() ? [] : props.runtime.resolvedColumns.value.filter(column => liveAllowed('rangeSelection', details.allowedItems).includes(column.id)),
    rowId: props.runtime.rowId, definition: () => props.rangeSelection,
    identity: () => props.runtime.query.value,
  }, { ...controls, isDisabled: () => disabled('rangeSelection') })
}
function host(name: DataToolName) { return name === 'conditionalFormatting' ? marksHost.value : name === 'grouping' ? groupingHost.value : name === 'compare' ? compareHost.value : rangeHost.value }
async function open(name: DataToolName) {
  if (!gate(name).enabled || name === 'rangeSelection' && disabled(name)) return
  await host(name)?.activate()
  if (name === 'grouping' && gate(name).mode !== 'default') await groupingHost.value?.getContext()?.reload()
  else if (name === 'compare' && gate(name).mode !== 'default') await compareHost.value?.getContext()?.reload()
  else if (name === 'rangeSelection') rangeHost.value?.getContext()?.toggle()
}
defineExpose({ activate: name => host(name)?.activate() ?? Promise.resolve(undefined), open,
  getContext: name => host(name)?.getContext(), getRangeContext: () => rangeHost.value?.getContext(),
} satisfies DataToolsHandle)
</script>
<template>
  <div class="bt-data-tools-host">
    <FeatureHost v-if="gate('conditionalFormatting').enabled" ref="marksHost" :local="features.conditionalFormatting" :remote="remoteFeatures?.conditionalFormatting" :declared-items="declaredItems" default-strategy="on-interaction" entry-label="条件标记" entry-icon="info" test-id="conditional-formatting" :create-context="createMarks" :loader="()=>import('../features/conditional-formatting/ConditionalFormattingFeature.vue')" @diagnostic="emit('diagnostic', $event)"><template #custom="{ context }"><slot name="conditional-formatting" :context="context" /></template></FeatureHost>
    <FeatureHost v-if="gate('grouping').enabled" ref="groupingHost" :local="features.grouping" :remote="remoteFeatures?.grouping" :declared-items="declaredItems" default-strategy="on-interaction" entry-label="分组汇总" entry-icon="density" test-id="grouping" :create-context="createGrouping" :loader="()=>import('../features/reports/GroupingFeature.vue')" @diagnostic="emit('diagnostic', $event)"><template #custom="{ context }"><slot name="grouping" :context="context" /></template></FeatureHost>
    <FeatureHost v-if="gate('compare').enabled" ref="compareHost" :local="features.compare" :remote="remoteFeatures?.compare" :declared-items="declaredItems" default-strategy="on-interaction" entry-label="记录对比" entry-icon="columns" test-id="compare" :create-context="createCompare" :loader="()=>import('../features/reports/CompareFeature.vue')" @diagnostic="emit('diagnostic', $event)"><template #custom="{ context }"><slot name="compare" :context="context" /></template></FeatureHost>
    <button v-if="gate('rangeSelection').mode!=='headless' && featureEntryVisible(features.rangeSelection, remoteFeatures?.rangeSelection)" type="button" class="bt__icon-button" data-testid="range-selection" :disabled="disabled('rangeSelection')" :aria-label="rangeHost?.getContext()?.enabled ? '关闭区域选择' : '开启区域选择'" @click="open('rangeSelection')"><TableIcon name="batch" /><span>{{ rangeHost?.getContext()?.enabled ? '关闭区域选择' : '开启区域选择' }}</span></button>
    <FeatureHost v-if="gate('rangeSelection').enabled" ref="rangeHost" :local="features.rangeSelection" :remote="remoteFeatures?.rangeSelection" :declared-items="declaredItems" default-strategy="on-interaction" :create-context="createRange" :loader="()=>import('../features/range-selection/RangeSelectionFeature.vue')" @diagnostic="emit('diagnostic', $event)"><template #custom="{ context }"><slot name="range-selection" :context="context" /></template></FeatureHost>
  </div>
</template>
<style>.bt-data-tools-host{display:contents}</style>
