<script setup lang="ts">
import type {SummaryState} from './model'
defineProps<{summary:SummaryState}>()
</script>
<template>
  <span v-if="summary.status!=='disabled'" class="bt-summary-result" aria-live="polite">
    <template v-if="summary.status==='error'"><span role="status" :title="summary.error">汇总不可用：{{summary.error}}</span></template>
    <span v-else :title="'汇总列：'+summary.title">{{summary.scope==='selected'?'所选':'筛选'}}合计：<strong>{{summary.status==='loading'?'计算中…':summary.text}}</strong></span>
  </span>
</template>
