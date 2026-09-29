<script setup lang="ts">
import {BusinessTable, SummaryResult} from '@company/business-table'
import {columns, rows} from './assets'
</script>

<template>
  <BusinessTable :columns="columns" :data="rows" selection
    :features="{columnSettings:true}"
    :settings-definition="{pages:{appearance:true}}"
    :presentation="{appearance:{summaryEnabled:true,summaryColumn:'amount'}}">
    <template #summary="{total,summary}">
      <span>共 {{total}} 条 · <SummaryResult :summary="summary" /></span>
    </template>
  </BusinessTable>
</template>
