<script setup lang="ts">
import { computed } from 'vue'
import type { SearchItem } from '../features/search/model'
import type { SearchContext } from '../runtime/query'

const props = defineProps<{ item: SearchItem; context: SearchContext; showLabel: boolean }>()
const emit = defineEmits<{ submit: [] }>()
const label = computed(() => props.item.label ?? props.item.id)
const value = computed(() => props.context.getValue(props.item.id))
const text = computed(() => String(value.value ?? ''))
const options = computed(() => props.item.options ?? [])
const custom = computed(() => props.item.kind === 'custom' ? props.context.component(props.item.id) : undefined)
const selected = computed(() => String(options.value.findIndex(option => Object.is(option.value, value.value)) + 1))

function select(event: Event) {
  const index = Number((event.target as HTMLSelectElement).value) - 1
  props.context.setValue(props.item.id, index < 0 ? null : options.value[index]?.value ?? null)
}
function input(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  props.context.setValue(props.item.id, props.item.kind === 'number' ? raw === '' ? null : Number(raw) : raw)
}
function keydown(event: KeyboardEvent) {
  if (props.item.kind === 'keyword' && !event.isComposing) event.preventDefault()
}
function keyup(event: KeyboardEvent) {
  if (props.item.kind === 'keyword' && !event.isComposing) emit('submit')
}
</script>

<template>
  <label class="bt-search__field">
    <span v-if="showLabel">{{ label }}</span>
    <select v-if="item.kind === 'select'" :aria-label="label" :value="selected" @change="select">
      <option value="0">全部{{ label }}</option>
      <option v-for="(option, index) in options" :key="index" :value="String(index + 1)">{{ option.label }}</option>
    </select>
    <component :is="custom" v-else-if="custom" :model-value="value" @update:model-value="context.setValue(item.id, $event)" />
    <input v-else-if="item.kind === 'custom'" type="text" :aria-label="label" value="" placeholder="查询组件不可用" disabled />
    <input v-else :class="item.kind === 'keyword' ? 'bt__search' : undefined" :type="item.kind === 'date' ? 'date' : item.kind === 'number' ? 'number' : 'text'"
      :aria-label="label" :placeholder="item.placeholder ?? (item.kind === 'keyword' ? '搜索当前数据' : '')" :value="text"
      @input="input" @keydown.enter="keydown" @keyup.enter="keyup" />
  </label>
</template>
