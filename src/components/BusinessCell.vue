<script setup lang="ts">
import { computed, h } from 'vue'
import type { ColumnConfig, RowData } from '../types'
import { evaluateCell } from '../features/columns/evaluate'
import { getValue } from '../runtime/value'
import { renderRichDocument } from '../features/rich-text/render'
import { columnTextCss } from './settingsTypes'
import TableIcon from './TableIcon.vue'

const props = withDefaults(defineProps<{ row: RowData; column: ColumnConfig; columns?: readonly ColumnConfig[]; preview?: boolean }>(), { preview: false })
const emit = defineEmits<{ action: [action: 'open' | 'copy'] }>()
const value = computed(() => evaluateCell(props.row, props.column, props.columns ?? [props.column]))
const content = computed(() => props.column.content ?? {})
const secondary = computed(() => content.value.showSecondary && content.value.secondaryField ? getValue(props.row, content.value.secondaryField) : undefined)
const mappedStyle = computed(() => value.value.mapping ? {
  color: value.value.mapping.color,
  backgroundColor: value.value.mapping.background,
  border: value.value.mapping.border ? `1px solid ${value.value.mapping.border}` : undefined,
} : {})
const Rich = () => h('div', { class: 'bt-rich-document' }, value.value.document ? renderRichDocument(value.value.document, id => {
  const column = (props.columns ?? [props.column]).find(item => item.id === id)
  return column ? evaluateCell(props.row, { ...column, template: undefined }).text : '—'
}) : [])
</script>
<template>
  <div class="bt-business-cell" :class="'bt-cell-wrap--' + (content.wrap ?? 'ellipsis')" :style="columnTextCss(column.cellStyle)">
    <Rich v-if="value.document" />
    <template v-else>
      <span v-if="column.mapping?.enabled || value.mapping" class="bt-cell-map" :class="['bt-cell-map--' + (column.mapping?.presentation ?? 'tag'),{'bt-tag':!column.mapping?.enabled&&!!value.mapping}]" :style="mappedStyle">
        <TableIcon v-if="value.mapping?.icon" :name="value.mapping.icon" :size="13" />
        <i v-else-if="column.mapping?.enabled && column.mapping.presentation !== 'text'" aria-hidden="true" />{{ value.text }}
      </span>
      <button v-else-if="content.link && !preview" type="button" class="bt-cell-link" @click="emit('action', 'open')">{{ value.text }}</button>
      <span v-else class="bt-cell-primary" :class="{ 'bt-cell-link': content.link }" :title="value.text">{{ value.text }}</span>
      <small v-if="secondary !== undefined && secondary !== null && secondary !== ''" class="bt-cell-secondary">{{ secondary }}</small>
    </template>
    <button v-if="content.copyable && !preview" type="button" class="bt-cell-copy" title="复制内容" aria-label="复制内容" @click.stop="emit('action', 'copy')"><TableIcon name="copy" :size="13" /></button>
  </div>
</template>
<style>
.bt-business-cell{position:relative;min-width:0;line-height:inherit;white-space:normal}.bt-cell-primary{display:block;min-width:0;line-height:inherit}.bt-cell-secondary{display:block;font-size:max(12px,.86em);color:#64748b;line-height:max(18px,1.4em);margin-top:2px}.bt-cell-wrap--ellipsis .bt-cell-primary,.bt-cell-wrap--ellipsis .bt-cell-secondary{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bt-cell-wrap--two .bt-cell-primary{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.bt-cell-wrap--wrap{overflow-wrap:anywhere}.bt-cell-map{display:inline-flex;align-items:center;gap:5px;max-width:100%;font:inherit;line-height:max(20px,1.4286em)}.bt-cell-map--tag{padding:2px 7px;border-radius:4px}.bt-cell-map i{width:4px;height:4px;border-radius:50%;background:currentColor;flex:none}.bt-cell-map--dot i{width:6px;height:6px}.bt-business-cell .bt-cell-link{border:0;background:transparent;padding:0;min-height:0;height:auto;display:inline;color:#2468e8;font:inherit;text-align:inherit;white-space:inherit}.bt-business-cell button.bt-cell-link:hover{text-decoration:underline;background:transparent}.bt-business-cell .bt-cell-copy{position:absolute;right:0;top:0;display:flex;align-items:center;justify-content:center;width:26px;height:26px;min-height:0;padding:0;border:0;background:#fff;color:#64748b;opacity:0;pointer-events:none}.bt-business-cell:hover .bt-cell-copy,.bt-cell-copy:focus-visible{opacity:1;pointer-events:auto}.bt-rich-document{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;line-height:1.6}.bt-rich-document p{margin:0;min-height:1em}.bt-rich-list{margin:0;padding-left:1.6em}.bt-rich-document a{color:#2468e8}
@media(hover:none){.bt-business-cell .bt-cell-copy{opacity:1;pointer-events:auto}}
</style>
