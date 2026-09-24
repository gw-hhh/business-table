<script setup lang="ts">
import DialogFrame from '../../ui/DialogFrame.vue'
import { evaluateCell } from '../columns/evaluate'
import type { RangeSelectionContext, RangeStatistic } from './context'
const props = defineProps<{ context: RangeSelectionContext }>()
function display(statistic: RangeStatistic, value: string) {
  const column = { ...statistic.column, field: 'value', mapping: undefined, valueMap: undefined, template: undefined }
  return evaluateCell({ value }, column).text
}
function copy() { void props.context.copy() }
</script>
<template>
  <div v-if="context.enabled" class="bt-range-summary" role="status">
    <span>
      <template v-if="context.count">当前页已选 {{ context.count }} 个单元格</template>
      <template v-else>区域选择已开启：拖动框选，Shift + 方向键扩选，Ctrl/Cmd+C 复制。</template>
      <template v-for="statistic in context.statistics" :key="statistic.column.id"> · {{ statistic.values.count }} 个{{ statistic.label }} · 合计 {{ display(statistic, statistic.values.sum) }} · 平均 {{ display(statistic, statistic.values.average) }} · 最小 {{ display(statistic, statistic.values.min) }} · 最大 {{ display(statistic, statistic.values.max) }}</template>
    </span>
    <button class="bt-range-button" :disabled="!context.count || context.copying" @click="copy">复制区域</button>
    <button class="bt-range-button" @click="context.toggle()">退出</button>
  </div>
  <DialogFrame v-if="context.manualCopy !== undefined" title="复制区域" subtitle="浏览器未允许自动复制，请选中以下内容手动复制。" @close="context.dismissCopy()">
    <label class="bt-ui-field">复制内容<textarea readonly rows="8" aria-label="复制内容" :value="context.manualCopy" @focus="($event.target as HTMLTextAreaElement).select()" /></label>
    <template #footer><button class="bt-ui-button primary" @click="context.dismissCopy()">关闭</button></template>
  </DialogFrame>
</template>
<style>
.bt-range-summary{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 16px;background:#eef5ff;border-bottom:1px solid #c8dcff;font-size:12px;flex-shrink:0;color:#334155}
.bt-range-summary>span{flex:1;min-width:180px;line-height:1.6}
.bt .bt-range-button{height:36px;border:1px solid transparent;border-radius:6px;background:transparent;color:#2468e8;font:inherit;padding:0 7px;cursor:pointer}
.bt-range-button:disabled{opacity:.4;cursor:default}.bt-range-button:focus-visible{outline:2px solid #2468e8;outline-offset:2px}
.bt .vxe-body--column:has(.bt__cell-content[aria-selected="true"]){background:#f1f6ff!important;box-shadow:inset 0 0 0 1px #3576df}
.bt--range .bt__cell-content{cursor:cell;outline:none}.bt--range .bt__cell-content:focus-visible{outline:2px solid #3576df;outline-offset:-2px}
</style>
