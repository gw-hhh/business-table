<script setup lang="ts">
import type { ReportTable } from './model'
defineProps<{ table: ReportTable; comparison?: boolean }>()
</script>
<template>
  <div class="bt-report-scroll"><table class="bt-report-table" :class="{ 'bt-report-table--comparison': comparison }"><thead><tr><th v-for="(header, index) in table.headers" :key="index" scope="col">{{ header }}</th></tr></thead><tbody><tr v-for="(row, index) in table.rows" :key="index"><td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell.text }}</td></tr></tbody></table></div>
</template>
