<script setup lang="ts">
import type { ColumnConfig, FilterConfig } from '../../types'
import type { FilterGroup } from '../../runtime/filter'
import type { FilterOptionsLoader } from './model'
import { useFilterSummaries } from './summary'
import TableIcon from '../../components/TableIcon.vue'
const props = defineProps<{ columns: readonly ColumnConfig[]; columnFilters: FilterConfig[]; group?: FilterGroup; optionsFor?: FilterOptionsLoader; optionsIdentity?: unknown }>()
const emit = defineEmits<{ edit: [columnId?: string]; clear: [field?: string] }>()
function column(rule: FilterConfig) { return props.columns.find(column => column.field === rule.field) }
const summaries = useFilterSummaries({ columns: () => props.columns, filters: () => props.columnFilters, optionsFor: () => props.optionsFor, optionsIdentity: () => props.optionsIdentity })
const count = (group: FilterGroup): number => group.rules.reduce((sum, rule) => sum + ('rules' in rule ? count(rule) : 1), 0)
</script>
<template>
  <div class="bt-filter-chips" aria-label="表格筛选条件">
    <span v-for="(rule, index) in columnFilters" :key="rule.field" class="bt-filter-chip"><button type="button" :title="summaries[index]?.label" @click="emit('edit', column(rule)?.id)">{{summaries[index]?.label}}</button><button type="button" :aria-label="'清除' + (column(rule)?.title ?? rule.field) + '筛选'" @click="emit('clear', rule.field)"><TableIcon name="close" :size="12"/></button></span>
    <span v-if="group?.rules.length" class="bt-filter-chip"><button type="button" @click="emit('edit')">组合筛选：{{count(group)}} 个条件</button><button type="button" aria-label="清除组合筛选" @click="emit('clear')"><TableIcon name="close" :size="12"/></button></span>
  </div>
</template>
<style>
.bt-filter-chips{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:12px 24px;border-bottom:1px solid #e8edf4}.bt-filter-chip{display:inline-flex;align-items:center;max-width:100%;border:1px solid #dbe7fb;background:#f3f7ff;border-radius:5px;color:#526177;font-size:12px}.bt-filter-chip button{min-width:0;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;display:inline-flex;align-items:center;padding:5px 7px}.bt-filter-chip button:first-child{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-filter-chip button:hover{color:#2468e8}.bt-filter-chip button:focus-visible{outline:2px solid #2468e8;outline-offset:1px}
</style>
