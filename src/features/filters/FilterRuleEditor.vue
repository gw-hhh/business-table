<script setup lang="ts">
import { computed } from 'vue'
import type { ColumnConfig } from '../../types'
import { defaultColumnFilter, operatorLabels, type FilterOption } from './model'
import type { FilterRuleDraft } from './editor'
import FilterOptions from './FilterOptions.vue'
const props = defineProps<{
  modelValue: FilterRuleDraft; column: ColumnConfig; autofocus?: boolean
  optionsFor: (column: ColumnConfig, search: string, signal: AbortSignal) => Promise<FilterOption[]>
}>()
const emit = defineEmits<{ 'update:modelValue': [FilterRuleDraft] }>()
const config = computed(() => defaultColumnFilter(props.column))
const relative = computed(() => ['nextDays', 'pastDays'].includes(props.modelValue.operator))
const date = computed(() => config.value.type === 'date' && !relative.value)
const patch = (value: Partial<FilterRuleDraft>) => emit('update:modelValue', { ...props.modelValue, ...value })
const unit = computed(() => {
  const factor = props.modelValue.unitFactor ?? 1
  return factor === 10000 ? '万（原值 ÷ 10000）' : factor === 1000 ? '千（原值 ÷ 1000）' : factor === 1e8 ? '亿（原值 ÷ 100000000）' : factor === .01 ? '百分比，例如 10 代表 10%' : '原始数值'
})
</script>
<template>
  <div class="bt-filter-rule-editor">
    <label class="bt-ui-field">条件<select :autofocus="autofocus" :value="modelValue.operator" aria-label="筛选条件" @change="patch({operator: ($event.target as HTMLSelectElement).value as FilterRuleDraft['operator']})"><option v-for="operator in config.operators" :key="operator" :value="operator">{{operatorLabels[operator]}}</option></select></label>
    <template v-if="!['empty', 'notEmpty'].includes(modelValue.operator)">
      <FilterOptions v-if="['in', 'notIn'].includes(modelValue.operator)" :model-value="modelValue.values" :column="column" :name="modelValue.id" :load="optionsFor" @update:model-value="patch({values: $event})"/>
      <div v-else class="bt-filter-values">
        <label class="bt-ui-field">{{modelValue.operator === 'between' ? '开始 / 下限' : relative ? '天数' : '筛选值'}}<input :type="date ? 'date' : 'text'" :inputmode="config.type === 'number' || relative ? 'decimal' : undefined" :value="modelValue.value" :aria-label="modelValue.operator === 'between' ? '开始 / 下限' : relative ? '天数' : '筛选值'" placeholder="请输入" @input="patch({value: ($event.target as HTMLInputElement).value})"></label>
        <label v-if="modelValue.operator === 'between'" class="bt-ui-field">结束 / 上限<input :type="date ? 'date' : 'text'" :inputmode="config.type === 'number' ? 'decimal' : undefined" :value="modelValue.to" aria-label="结束 / 上限" placeholder="请输入" @input="patch({to: ($event.target as HTMLInputElement).value})"></label>
        <p v-if="config.type === 'number'" class="bt-ui-note">输入单位：{{unit}}。条件保存后，修改列显示格式不会改变筛选范围。</p>
      </div>
    </template>
  </div>
</template>
