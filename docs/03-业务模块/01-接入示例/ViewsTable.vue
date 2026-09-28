<script setup lang="ts">
import { nextTick, onMounted, ref, shallowRef } from 'vue'
import {
  BusinessTable, ViewsPanel, createViewsRuntime, createViewChangeTracker,
  type ViewConfig, type ViewSnapshot,
} from '@company/business-table'
import { columns, rows } from './assets'

const tableKey = 'tutorial.demo-user.asset-views'
const storageKey = `tutorial.views:${tableKey}`
const table = ref<{
  applyView: (view: ViewConfig) => Promise<void>
  viewSnapshot: () => ViewSnapshot
}>()
const runtime = shallowRef<ReturnType<typeof createViewsRuntime>>()
const error = ref('')
const notice = ref('')
function snapshot(): ViewSnapshot { return table.value?.viewSnapshot() ?? {} }
const tracker = createViewChangeTracker(snapshot)
const modified = tracker.modified
async function load() {
  error.value = ''
  try {
    const saved = localStorage.getItem(storageKey)
    runtime.value = createViewsRuntime({
      tableKey,
      initial: saved ?? [{ id: 'all', name: '全部物料', isSystem: true }],
      apply: async view => { await table.value?.applyView(view); tracker.accept() },
      save: async views => {
        localStorage.setItem(storageKey, JSON.stringify({ kind: 'business-table-views', schemaVersion: 3, tableKey, views }))
      },
    })
    await nextTick()
    const id = runtime.value.activeId.value
    if (id) await runtime.value.apply(id)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '视图读取失败' }
}
onMounted(load)
</script>

<template>
  <p v-if="error" role="alert">{{ error }} <button @click="load">重试读取</button></p>
  <template v-if="runtime && !error">
    <BusinessTable ref="table" :columns="columns" :data="rows" :table-key="tableKey"
      :features="{ search: true, filters: true }">
      <template #before="{ search }">
        <ViewsPanel :runtime="runtime" :snapshot="snapshot" :modified="modified" :pending="search?.pending"
          @committed="tracker.accept()" @notice="notice = $event" @require-apply="notice = '请先查询，再保存视图'" />
      </template>
    </BusinessTable>
    <p v-if="notice" role="status">{{ notice }}</p>
  </template>
</template>
