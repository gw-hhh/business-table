<script setup lang="ts">
import { BusinessTable, SearchSummary, SearchPendingIndicator, type SearchDefinition } from '@company/business-table'
import { columns, rows } from './assets'

const searchDefinition: SearchDefinition = {
  resetBehavior: 'empty',
  items: [{ id: 'name', label: '名称', kind: 'text', field: 'name', operator: 'contains' }],
}
function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : ''
}
</script>

<template>
  <BusinessTable :columns="columns" :data="rows"
    :features="{ search: { enabled: true, mode: 'custom' } }" :search-definition="searchDefinition">
    <template #search="{ context }">
      <form @submit.prevent="context.submit()">
        <label>名称
          <input :value="context.values.name ?? ''" @input="context.setValue('name', inputValue($event))">
        </label>
        <button type="submit" aria-label="查询">查询<SearchPendingIndicator :pending="context.pending" /></button>
        <button type="button" @click="context.reset()">清空</button>
        <SearchSummary :context="context" />
      </form>
    </template>
  </BusinessTable>
</template>
