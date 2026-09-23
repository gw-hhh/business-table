<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ColumnConfig } from '../../types'
import type { FilterOption } from './model'
import { defaultColumnFilter } from './model'
import { createFilterOptions } from './options'
import { FILTER_LIMITS } from '../../runtime/filter'
import { typedKey } from '../../runtime/value'
const props = defineProps<{
  modelValue: FilterOption['value'][]; column: ColumnConfig; name: string
  load: (column: ColumnConfig, search: string, signal: AbortSignal) => Promise<FilterOption[]>
}>()
const emit = defineEmits<{ 'update:modelValue': [FilterOption['value'][]] }>()
const search = ref(''), config = computed(() => defaultColumnFilter(props.column))
const options = createFilterOptions((search, signal) => props.load(props.column, search, signal))
const { items, loading, error } = options
const selected = (value: unknown) => props.modelValue.some(item => Object.is(item, value))
const shown = computed(() => items.value.slice(0, FILTER_LIMITS.values))
function toggle(value: FilterOption['value'], checked: boolean) {
  if (!checked) emit('update:modelValue', props.modelValue.filter(item => !Object.is(item, value)))
  else if (config.value.type === 'single') emit('update:modelValue', [value])
  else if (!selected(value) && props.modelValue.length < FILTER_LIMITS.values) emit('update:modelValue', [...props.modelValue, value])
}
watch([() => props.column, search], () => { void options.load(search.value) }, { immediate: true })
onBeforeUnmount(options.dispose)
</script>
<template>
  <div class="bt-filter-values">
    <label v-if="config.search" class="bt-ui-field"><span class="bt-sr-only">搜索筛选项</span><input v-model="search" type="search" placeholder="搜索筛选项" aria-label="搜索筛选项"></label>
    <div class="bt-filter-options" :aria-busy="loading">
      <p v-if="loading" class="bt-ui-note" role="status">正在加载筛选项…</p>
      <div v-else-if="error" class="bt-ui-error" role="alert">{{error}} <button type="button" class="bt-ui-button text" @click="options.load(search)">重试</button></div>
      <template v-else>
        <label v-for="option in shown" :key="typedKey(option.value)" class="bt-filter-option">
          <input :type="config.type === 'single' ? 'radio' : 'checkbox'" :name="name" :checked="selected(option.value)" :aria-label="option.label" :disabled="config.type !== 'single' && !selected(option.value) && modelValue.length >= FILTER_LIMITS.values" @change="toggle(option.value, ($event.target as HTMLInputElement).checked)">
          <span>{{option.label}}</span><small v-if="config.counts && option.count !== undefined">{{option.count}}</small>
        </label>
        <p v-if="!shown.length" class="bt-ui-note">没有匹配的筛选项</p>
        <p v-if="items.length > FILTER_LIMITS.values" class="bt-ui-note">仅列出前 200 项，请搜索缩小范围；已选条件保留。</p>
      </template>
    </div>
  </div>
</template>
