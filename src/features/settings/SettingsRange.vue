<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, useId, watch } from 'vue'
import { numericValidationKey } from './numericValidation'

const props = withDefaults(defineProps<{
  path: readonly string[]; modelValue?: number; label: string; min: number; max: number; step?: number | 'any'
  unit?: string; disabled?: boolean; inheritedValue?: number; sliderLabel?: string
}>(), { step: 1, unit: '' })
const emit = defineEmits<{ 'update:modelValue': [value: number | undefined] }>()
const id = useId(), validation = inject(numericValidationKey, undefined)
const effective = computed(() => props.modelValue ?? props.inheritedValue ?? props.min)
const buffer = ref(String(effective.value)), error = ref('')
const inherited = computed(() => props.inheritedValue !== undefined && props.modelValue === undefined)
const progress = computed(() => Math.max(0, Math.min(100, (effective.value - props.min) / (props.max - props.min || 1) * 100)))
function validate(message = '') {
  error.value = message
  validation?.report(props.path, message ? {text:buffer.value,message:props.label+'：'+message,value:props.modelValue,inheritedValue:props.inheritedValue} : undefined)
}
function reset() { buffer.value = String(effective.value); validate() }
const saved = validation?.read(props.path)
if (!props.disabled && saved && saved.value === props.modelValue && saved.inheritedValue === props.inheritedValue) {
  buffer.value = saved.text; error.value = saved.message
} else validation?.report(props.path)
validation?.register(id, props.path, reset)
function input(event: Event) {
  const target = event.target as HTMLInputElement
  if (props.disabled || target.matches(':disabled')) return
  buffer.value = target.value
  const value = Number(buffer.value)
  if (!buffer.value.trim() || !Number.isFinite(value) || value < props.min || value > props.max || target.validity.stepMismatch) {
    validate(`请输入 ${props.min}–${props.max}${props.unit ? ' ' + props.unit : ''}${props.step === 1 ? '，取整数' : ''}。`)
    return
  }
  validate(); emit('update:modelValue', value)
}
function inherit() {
  if (props.disabled) return
  validate(); buffer.value = String(props.inheritedValue); emit('update:modelValue', undefined)
}
watch(() => [props.modelValue, props.inheritedValue, props.min, props.max, props.disabled], () => {
  buffer.value = String(effective.value); validate()
})
onBeforeUnmount(() => validation?.unregister(id))
</script>

<template>
  <div class="bt-settings-range" :class="{'is-inherited': inherited}">
    <div class="bt-settings-range__controls">
      <input class="bt-settings-range__slider" type="range" :aria-label="sliderLabel ?? label+'滑动条'" :aria-describedby="id" :min="min" :max="max" :step="step" :value="effective" :disabled="disabled" :style="{'--bt-range-progress':progress+'%'}" @input="input">
      <input class="bt-settings-range__number" type="number" :aria-label="label" :aria-describedby="id" :aria-invalid="!!error" :min="min" :max="max" :step="step" :value="buffer" :disabled="disabled" @input="input">
      <span v-if="unit" class="bt-settings-range__unit">{{unit}}</span>
    </div>
    <div :id="id" class="bt-settings-range__caption">
      <span :class="{'bt-settings-error':error}">{{error || (inherited ? '跟随表格 · ' + effective + ' ' + unit : min+'–'+max+' '+unit)}}</span>
      <button v-if="inheritedValue!==undefined" type="button" :aria-label="label+'跟随表格'" :aria-pressed="inherited" :disabled="disabled" @click="inherit">跟随表格</button>
    </div>
  </div>
</template>

<style>
.bt-settings-range{min-width:0}
.bt-settings-range__controls{display:flex;align-items:center;gap:8px;min-width:0;min-height:32px}
.bt-settings-range__slider{appearance:none;flex:1;min-width:32px;width:0;height:4px;padding:0;margin:0;border:0;border-radius:4px;background:linear-gradient(to right,#2468e8 0 var(--bt-range-progress),#e0e7f1 var(--bt-range-progress) 100%);cursor:pointer;accent-color:#2468e8}
.bt-settings-range__slider::-webkit-slider-thumb{appearance:none;width:14px;height:14px;border:2px solid #2468e8;border-radius:50%;background:#fff;box-shadow:0 1px 3px #2468e824}
.bt-settings-range__slider::-moz-range-thumb{width:10px;height:10px;border:2px solid #2468e8;border-radius:50%;background:#fff}
.bt-settings-range__controls .bt-settings-range__number{flex:0 0 64px;width:64px;height:32px;padding:3px 5px;text-align:center;font-variant-numeric:tabular-nums}
.bt-settings-range__number[aria-invalid=true]{border-color:#be3544}
.bt-settings-range__unit{font-size:12px;color:#64748b;flex-shrink:0}
.bt-settings-range__caption{display:flex;justify-content:space-between;align-items:baseline;gap:4px;margin-top:3px;min-height:18px;color:#64748b;font-size:11px;line-height:18px}
.bt-settings-range__caption>button{flex-shrink:0;border:0;background:none;padding:0;color:#2468e8;font:inherit;cursor:pointer}
.bt-settings-range__caption>button:disabled{color:#8995a6;cursor:not-allowed}
.bt-settings-range__slider:disabled{opacity:.45;cursor:not-allowed}
.bt-settings-range__caption .bt-settings-error{color:#be3544}
@media(pointer:coarse){.bt-settings-range__slider{height:8px}.bt-settings-range__slider::-webkit-slider-thumb{width:22px;height:22px}.bt-settings-range__controls{min-height:40px}}
</style>
