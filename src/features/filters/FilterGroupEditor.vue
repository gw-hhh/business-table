<script setup lang="ts">
import { computed } from 'vue'
import type { ColumnConfig } from '../../types'
import type { FilterOption } from './model'
import { defaultColumnFilter } from './model'
import { createFilterDraft, type FilterGroupDraft, type FilterRuleDraft } from './editor'
import { FILTER_LIMITS } from '../../runtime/filter'
import TableIcon from '../../components/TableIcon.vue'
import FilterRuleEditor from './FilterRuleEditor.vue'
const props = withDefaults(defineProps<{
  modelValue: FilterGroupDraft; columns: readonly ColumnConfig[]; depth?: number; total: number
  optionsFor: (column: ColumnConfig, search: string, signal: AbortSignal) => Promise<FilterOption[]>
}>(), { depth: 0 })
const emit = defineEmits<{ 'update:modelValue': [FilterGroupDraft] }>()
const eligible = computed(() => props.columns.filter(column => defaultColumnFilter(column).enabled))
const patch = (value: Partial<FilterGroupDraft>) => emit('update:modelValue', { ...props.modelValue, ...value })
function replace(index: number, next: FilterGroupDraft | FilterRuleDraft) { patch({ rules: props.modelValue.rules.map((rule, position) => position === index ? next : rule) }) }
function field(index: number, value: string) {
  const column = eligible.value.find(item => item.field === value), previous = props.modelValue.rules[index]
  if (column && previous) replace(index, { ...createFilterDraft(column), id: previous.id })
}
function add(group: boolean) {
  const column = eligible.value[0]
  if (!column || props.total >= FILTER_LIMITS.rules) return
  const rule = createFilterDraft(column)
  patch({ rules: [...props.modelValue.rules, group ? { id: crypto.randomUUID(), logic: 'and', rules: [rule] } : rule] })
}
const columnFor = (field: string) => eligible.value.find(column => column.field === field)
</script>
<template>
  <div class="bt-filter-group" :data-depth="depth">
    <label class="bt-ui-field">组合方式<select :autofocus="depth === 0" :value="modelValue.logic" :aria-label="depth ? '条件组组合方式' : '组合方式'" @change="patch({logic: ($event.target as HTMLSelectElement).value as 'and' | 'or'})"><option value="and">同时满足所有条件</option><option value="or">满足任一条件</option></select></label>
    <div class="bt-filter-rule-list">
      <section v-for="(rule, index) in modelValue.rules" :key="rule.id" class="bt-filter-rule">
        <template v-if="'rules' in rule">
          <div class="bt-filter-rule-heading"><strong>条件组</strong><button type="button" class="bt-ui-icon" aria-label="删除条件组" @click="patch({rules: modelValue.rules.filter(item => item.id !== rule.id)})"><TableIcon name="trash"/></button></div>
          <FilterGroupEditor :model-value="rule" :columns="columns" :depth="depth + 1" :total="total" :options-for="optionsFor" @update:model-value="replace(index, $event)"/>
        </template>
        <template v-else>
          <div class="bt-filter-rule-heading"><label class="bt-ui-field">条件 {{index + 1}}<select :value="rule.field" aria-label="筛选字段" @change="field(index, ($event.target as HTMLSelectElement).value)"><option v-for="column in eligible" :key="column.id" :value="column.field">{{column.title}}</option></select></label><button type="button" class="bt-ui-icon" aria-label="删除条件" @click="patch({rules: modelValue.rules.filter(item => item.id !== rule.id)})"><TableIcon name="trash"/></button></div>
          <FilterRuleEditor v-if="columnFor(rule.field)" :model-value="rule" :column="columnFor(rule.field)!" :options-for="optionsFor" @update:model-value="replace(index, $event)"/>
          <p v-else class="bt-ui-error" role="alert">此字段已不可用，请重新选择。</p>
        </template>
      </section>
      <div v-if="!modelValue.rules.length" class="bt-ui-empty">尚未添加条件</div>
    </div>
    <div class="bt-filter-add"><button type="button" class="bt-ui-button" :disabled="!eligible.length || total >= FILTER_LIMITS.rules" @click="add(false)"><TableIcon name="plus"/>添加条件</button><button v-if="depth < FILTER_LIMITS.depth" type="button" class="bt-ui-button text" :disabled="!eligible.length || total >= FILTER_LIMITS.rules" @click="add(true)">添加条件组</button><span v-if="!depth" class="bt-ui-note">{{total}} / 30</span></div>
  </div>
</template>
