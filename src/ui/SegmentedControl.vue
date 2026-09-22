<script setup lang="ts">
import { nextTick } from 'vue'
import TableIcon from '../components/TableIcon.vue'
const props = defineProps<{ modelValue: string; label: string; options: readonly { value: string; label: string; icon?: string }[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
function select(value: string) { if (!props.disabled) emit('update:modelValue', value) }
function keydown(event: KeyboardEvent) {
  if (event.isComposing || props.disabled || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  const index = props.options.findIndex(item => item.value === props.modelValue), length = props.options.length
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? length - 1 : (index + (event.key === 'ArrowRight' ? 1 : length - 1)) % length
  if (props.options[next]) select(props.options[next]!.value)
  const root = event.currentTarget as HTMLElement
  void nextTick(() => root.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus())
}
</script>
<template><div class="bt-settings-segmented" role="group" :aria-label="label" @keydown="keydown"><button v-for="option in options" :key="option.value" type="button" :disabled="disabled" :aria-label="label+option.label" :title="option.label" :aria-pressed="modelValue===option.value" :tabindex="modelValue===option.value?0:-1" @click="select(option.value)"><TableIcon v-if="option.icon" :name="option.icon" :size="14" /><span v-else>{{option.label}}</span></button></div></template>
