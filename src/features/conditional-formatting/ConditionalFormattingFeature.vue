<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ColumnConfig, FilterConfig } from '../../types'
import DialogFrame from '../../ui/DialogFrame.vue'
import TableIcon from '../../components/TableIcon.vue'
import FilterRuleEditor from '../filters/FilterRuleEditor.vue'
import { createFilterDraft, parseFilterDraft, type FilterRuleDraft } from '../filters/editor'
import { conditionalColumn, guardConditionalRules, type ConditionalRule } from './model'
import type { ConditionalFormattingContext } from './context'
import './conditional-formatting.css'

const props = defineProps<{ context: ConditionalFormattingContext }>()
interface RuleDraft { id: string; enabled: boolean; label: string; color: string; background: string; columnId: string; filter: FilterRuleDraft }
const columns = computed(() => props.context.columns.filter(column => column.kind !== 'actions'))
const columnById = (id: string) => columns.value.find(column => column.id === id)
const editorColumn = (id: string): ColumnConfig | undefined => { const column = columnById(id); return column && conditionalColumn(column) }
const initial = (): RuleDraft[] => props.context.rules.map(rule => {
  const column = columns.value.find(column => column.field === rule.condition.field)
  if (!column) throw new Error('标记字段已不可用，请清除失效规则后重试。')
  return { id: rule.id, enabled: rule.enabled, label: rule.label, color: rule.color,
    background: rule.background, columnId: column.id, filter: createFilterDraft(conditionalColumn(column), rule.condition) }
})
const unavailable = ref(false)
const error = ref('')
let starting: RuleDraft[] = []
try { starting = initial() } catch (cause) { unavailable.value = true; error.value = cause instanceof Error ? cause.message : String(cause) }
const draft = ref<RuleDraft[]>(starting)
const busy = ref(false)
const defaultColumn = () => columnById(props.context.defaultColumn ?? '') ?? columns.value[0]

function add() {
  const column = defaultColumn()
  if (!column || draft.value.length >= 30 || props.context.disabled) return
  draft.value.push({ id: crypto.randomUUID(), enabled: true, label: '关注', color: '#92400e', background: '#fffbeb',
    columnId: column.id, filter: createFilterDraft(conditionalColumn(column)) })
  error.value = ''
}
function changeColumn(item: RuleDraft, id: string) {
  const column = columnById(id)
  if (!column || props.context.disabled) return
  item.columnId = id
  item.filter = createFilterDraft(conditionalColumn(column))
  error.value = ''
}
function moveUp(index: number) {
  if (index < 1 || props.context.disabled) return
  ;[draft.value[index - 1], draft.value[index]] = [draft.value[index]!, draft.value[index - 1]!]
}
function remove(index: number) { if (!props.context.disabled) draft.value.splice(index, 1) }
function parse(): ConditionalRule[] {
  const rules = draft.value.map(item => {
    const column = editorColumn(item.columnId)
    if (!column) throw new Error('标记字段已不可用，请重新选择。')
    const condition: FilterConfig = parseFilterDraft(item.filter, column)
    if (condition.unitFactor === 1) delete condition.unitFactor
    return { id: item.id, condition, enabled: item.enabled, label: item.label,
      color: item.color, background: item.background }
  })
  return guardConditionalRules(rules, columns.value)
}
async function apply() {
  if (props.context.disabled || busy.value || unavailable.value) return
  busy.value = true; error.value = ''
  try { await props.context.apply(parse()); props.context.close() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { busy.value = false }
}
function clearUnavailable() { draft.value = []; unavailable.value = false; error.value = '' }
</script>

<template>
  <DialogFrame title="条件标记" subtitle="按顺序命中第一条启用规则；条件使用原值。只标记显示，不改变业务状态。" drawer :busy="busy" class="bt-conditional-dialog" @close="context.close">
    <fieldset class="bt-conditional-fields" :disabled="context.disabled || busy || unavailable">
      <section v-for="(item,index) in draft" :key="item.id" class="bt-conditional-rule">
        <div class="bt-conditional-rule-header">
          <label class="bt-ui-check"><input v-model="item.enabled" type="checkbox" aria-label="启用规则">启用</label>
          <label class="bt-ui-field">字段<select :value="item.columnId" aria-label="标记字段" @change="changeColumn(item,($event.target as HTMLSelectElement).value)"><option v-for="column in columns" :key="column.id" :value="column.id">{{column.title}}</option></select></label>
          <label class="bt-ui-field">提示文字<input v-model="item.label" type="text" maxlength="24" aria-label="提示文字"></label>
          <button type="button" class="bt-ui-icon" aria-label="上移规则" :disabled="index===0" @click="moveUp(index)"><TableIcon name="chevron-up" /></button>
          <button type="button" class="bt-ui-icon" aria-label="删除规则" @click="remove(index)"><TableIcon name="close" /></button>
        </div>
        <FilterRuleEditor v-if="editorColumn(item.columnId)" v-model="item.filter" :column="editorColumn(item.columnId)!" :options-for="context.optionsFor" />
        <div class="bt-conditional-colors">
          <label class="bt-ui-field">文字颜色<input v-model="item.color" type="color" aria-label="文字颜色"></label>
          <label class="bt-ui-field">背景颜色<input v-model="item.background" type="color" aria-label="背景颜色"></label>
        </div>
      </section>
      <button type="button" class="bt-ui-button" :disabled="draft.length>=30 || !columns.length" @click="add"><TableIcon name="plus" :size="14" />添加规则</button>
    </fieldset>
    <p v-if="error" class="bt-ui-error" role="alert">{{error}} <button v-if="unavailable && !context.disabled" type="button" class="bt-ui-button text" @click="clearUnavailable">清空失效规则</button></p>
    <template #footer><button type="button" class="bt-ui-button" :disabled="busy" @click="context.close">{{context.disabled?'关闭':'取消'}}</button><button v-if="!context.disabled" type="button" class="bt-ui-button primary" :disabled="busy || unavailable" @click="apply">应用标记</button></template>
  </DialogFrame>
</template>
