<script setup lang="ts">
import { BusinessTable } from '@company/business-table'
import { columns } from './assets'
import { createAssetSource } from './asset-source'

// 对象保持稳定，避免每次渲染被当成新的数据源。
const dataSource = createAssetSource()
</script>

<template>
  <BusinessTable table-key="tutorial.remote-assets" row-key="id"
    :columns="columns" :data-source="dataSource"
    :pagination="{ pageSize: 20, pageSizeOptions: [20, 50, 100] }"
    :features="{ search: true, filters: true, toolbar: true }" query-summary
  />
</template>
