<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  ConfiguredBusinessTable, createRegistry,
  type ColumnCapabilities, type PreferenceV3, type SettingsDefinition,
  type TableDefinition, type ToolDefinition,
} from '@company/business-table'
import { columns, rows, type Asset } from './assets'

// 演示账号键；正式项目由已登录账号及租户生成。
const tableKey = 'tutorial.demo-user.assets'
const preferenceKey = `tutorial.preference:${tableKey}`
const allCapabilities: ColumnCapabilities = {
  visible: true, order: true, rename: true, align: true, sortable: true,
  width: { enabled: true, min: 100, max: 600 }, fixed: true,
  headerStyle: true, cellStyle: true, content: true, format: true,
  mapping: true, template: true, filter: true, trial: true,
}
const settings: SettingsDefinition = {
  pages: { columns: true, sorts: true, actions: true, appearance: true, toolbar: true },
  columnSections: { basic: true, content: true, number: true, filter: true, mapping: true, template: true, trial: true },
}
const definition: TableDefinition = {
  schemaVersion: 3, tableKey, rowKey: 'id', title: '物料列表', settings,
  columns: columns.map(column => ({ ...column, configurable: { ...allCapabilities } })),
  pagination: { pageSize: 10, pageSizeOptions: [10, 20, 50] },
  presentation: { appearance: { density: 'compact', fontSize: 13, headerFontSize: 13 } },
  features: {
    search: true, filters: true, toolbar: true, columnSettings: true,
    rowActions: { enabled: true, details: { allowedItems: ['view'] } },
    conditionalFormatting: true, grouping: true, compare: true, rangeSelection: true,
  },
  search: {
    resetBehavior: 'empty',
    items: [
      { id: 'keyword', label: '关键词', kind: 'keyword', defaultValue: '' },
      { id: 'status', label: '状态', kind: 'select', field: 'status', operator: 'eq',
        options: [{ value: 0, label: '草稿' }, { value: 1, label: '已确认' }] },
    ],
  },
  conditionalFormatting: { allowedColumns: ['amount', 'status'], defaultColumn: 'amount' },
  grouping: { groupColumns: ['status'], defaultGroups: ['status'], summaryColumns: [{ columnId: 'amount', label: '金额合计' }] },
  compare: { searchColumns: ['id', 'name'], labelColumns: ['id', 'name'], recordLabelColumn: 'name', differenceColumns: [{ columnId: 'amount' }] },
  rangeSelection: { summaryColumns: [{ columnId: 'amount', label: '金额' }] },
}

const table = ref<{ reload: () => void | Promise<void> }>()
const selectedAsset = ref<Asset>()
const registry = createRegistry<Asset>()
registry.register('rowAction', 'view', {
  id: 'view', label: '查看', handler: row => { selectedAsset.value = row },
})
const tools: { page: ToolDefinition[]; table: ToolDefinition[] } = {
  page: [], table: [{ id: 'refresh', label: '刷新', icon: 'refresh', handler: async () => { await table.value?.reload() } }],
}

const preference = ref<unknown>(null)
const ready = ref(false)
const loadError = ref('')
const diagnostic = ref('')
function loadPreference() {
  loadError.value = ''
  try {
    // 保留 unknown，让配置解析器检查 JSON、版本、tableKey 和字段能力。
    preference.value = localStorage.getItem(preferenceKey)
    ready.value = true
  } catch (cause) {
    loadError.value = cause instanceof Error ? cause.message : '偏好读取失败'
  }
}
async function savePreference(next: PreferenceV3) {
  // 异常交给 Runtime；保存成功才发布正式设置和 preferenceChange。
  localStorage.setItem(preferenceKey, JSON.stringify(next))
}
function receivePreference(next: PreferenceV3) { preference.value = next }
onMounted(loadPreference)
</script>

<template>
  <p v-if="loadError" role="alert">{{ loadError }} <button @click="loadPreference">重试读取</button></p>
  <ConfiguredBusinessTable v-if="ready" ref="table"
    :definition="definition" :registry="registry" :data="rows" :tools="tools"
    :preference="preference" :save-preference="savePreference" query-summary
    @preference-change="receivePreference" @diagnostic="diagnostic = $event.message"
  />
  <p v-if="diagnostic" role="status">配置提示：{{ diagnostic }}</p>
  <output v-if="selectedAsset">当前查看：{{ selectedAsset.id }} / {{ selectedAsset.name }}</output>
</template>
