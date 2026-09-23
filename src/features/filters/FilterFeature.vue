<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import DialogFrame from '../../ui/DialogFrame.vue'
import FilterRuleEditor from './FilterRuleEditor.vue'
import FilterGroupEditor from './FilterGroupEditor.vue'
import { createFilterDraft, parseFilterDraft, createFilterGroupDraft, parseFilterGroupDraft, type FilterGroupDraft, type FilterRuleDraft } from './editor'
import { cloneData } from '../../runtime/value'
import { guardFilterState, type FilterState } from '../../runtime/filter-state'
import type { FiltersContext } from './context'
import './filters.css'
const props = defineProps<{ context: FiltersContext }>()
const column = computed(() => props.context.columns.find(column => column.id === props.context.columnId))
const single = computed(() => props.context.columnId !== undefined)
const rule = ref<FilterRuleDraft>(), group = ref<FilterGroupDraft>(createFilterGroupDraft([]))
const draftColumns = ref<FilterState['columnFilters']>([])
const unavailable = ref(false), planLoadError = ref('')
const busy = ref(false), error = ref(''), planOpen = ref(false), nameOpen = ref(false), planName = ref(''), planError = ref(''), selectedPlan = ref(''), renameMode = ref(false), deleteOpen = ref(false)
const plans = props.context.plans
const planItems = computed(() => plans?.plans.value ?? [])
const count = (node: FilterGroupDraft): number => node.rules.reduce((sum, rule) => sum + ('rules' in rule ? count(rule) : 1), 0)
const total = computed(() => count(group.value))
function initialize() {
  error.value = ''; selectedPlan.value = ''; unavailable.value = false
  planOpen.value = false; nameOpen.value = false; deleteOpen.value = false
  const snapshot = props.context.state
  draftColumns.value = snapshot.columnFilters
  rule.value = column.value ? createFilterDraft(column.value, snapshot.columnFilters.find(rule => rule.field === column.value!.field)) : undefined
  group.value = createFilterGroupDraft([])
  if (single.value) return
  try {
    guardFilterState(snapshot, props.context.columns)
    group.value = createFilterGroupDraft(props.context.columns, snapshot.filterGroup)
  } catch (cause) {
    unavailable.value = true
    error.value = cause instanceof Error ? cause.message : '当前筛选条件已不可用。'
  }
}
function clearUnavailable() {
  draftColumns.value = []; group.value = createFilterGroupDraft(props.context.columns)
  unavailable.value = false; error.value = ''
}

watch(() => [props.context.columnId, props.context.revision], initialize, { immediate: true })
async function reloadPlans(force = false) {
  if (!plans || !force && plans.ready.value) return
  planLoadError.value = ''
  try { await plans.load() } catch (cause) { planLoadError.value = cause instanceof Error ? cause.message : String(cause) }
}
onMounted(() => { void reloadPlans() })
function openPlans() { planOpen.value = true }
function state(): FilterState {
  if (unavailable.value) throw new Error('请先处理不可用的筛选条件。')
  if (single.value) {
    if (!column.value || !rule.value) throw new Error('筛选字段已不可用。')
    const parsed = parseFilterDraft(rule.value, column.value)
    return { ...props.context.state, columnFilters: [...props.context.state.columnFilters.filter(item => item.field !== parsed.field), parsed] }
  }
  return { columnFilters: cloneData(draftColumns.value), filterGroup: parseFilterGroupDraft(group.value, props.context.columns) }
}
async function apply(clearColumn = false) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const next = clearColumn && column.value ? { ...props.context.state, columnFilters: props.context.state.columnFilters.filter(rule => rule.field !== column.value!.field) } : state()
    await props.context.apply(next); props.context.close()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { busy.value = false }
}
function loadPlan(id: string) {
  if (!id) return
  try {
    const snapshot = props.context.readPlan(id)
    const draft = createFilterGroupDraft(props.context.columns, snapshot.filterGroup)
    group.value = draft; draftColumns.value = snapshot.columnFilters; selectedPlan.value = id; unavailable.value = false; error.value = ''; planOpen.value = false
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
}
function nameDialog(rename: boolean) {
  renameMode.value = rename; planError.value = ''
  planName.value = rename ? planItems.value.find(plan => plan.id === selectedPlan.value)?.name ?? '' : ''
  nameOpen.value = true
}
async function savePlan(update = false) {
  if (!plans || busy.value) return
  busy.value = true; planError.value = ''; error.value = ''
  try {
    if (renameMode.value && !update) await plans.rename(selectedPlan.value, planName.value)
    else {
      const name = update ? planItems.value.find(plan => plan.id === selectedPlan.value)?.name ?? '' : planName.value
      selectedPlan.value = await plans.save(name, state(), update ? selectedPlan.value : undefined)
    }
    nameOpen.value = false
  } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); if (nameOpen.value) planError.value = message; else error.value = message }
  finally { busy.value = false }
}
async function removePlan() {
  if (!plans || busy.value) return
  busy.value = true; error.value = ''
  try { await plans.remove(selectedPlan.value); selectedPlan.value = ''; deleteOpen.value = false }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { busy.value = false }
}
</script>
<template>
  <DialogFrame :title="single ? '筛选 · ' + (column?.title ?? '字段已不可用') : '组合筛选'" :subtitle="single ? '与当前查询及其他列条件同时生效。' : '基础查询、列筛选和这里的组合条件共同生效。'" :drawer="!single" :busy="busy" class="bt-filter-dialog" @close="context.close">
    <template v-if="!single && plans" #header-actions><button type="button" class="bt-ui-button text bt-filter-plan-entry" aria-haspopup="dialog" :aria-expanded="planOpen" :disabled="busy" @click="openPlans">筛选方案</button></template>
    <template v-if="single"><FilterRuleEditor v-if="column && rule" v-model="rule" autofocus :column="column" :options-for="context.optionsFor"/><p v-else class="bt-ui-error" role="alert">筛选字段已不可用，请重新打开。</p></template>
    <template v-else>
      <FilterGroupEditor v-model="group" :columns="context.columns" :total="total" :options-for="context.optionsFor"/>
      <p v-if="draftColumns.length" class="bt-ui-note bt-filter-column-note">包含 {{draftColumns.length}} 个列筛选，应用时一并生效。</p>
    </template>
    <p v-if="error" class="bt-ui-error" role="alert">{{error}}<button v-if="unavailable" type="button" class="bt-ui-button text" @click="clearUnavailable">清空失效条件</button></p>
    <template #footer>
      <button v-if="single" type="button" class="bt-ui-button text" :disabled="busy || !column" @click="apply(true)">清除此列</button>
      <button v-else type="button" class="bt-ui-button text" :disabled="busy" @click="group = createFilterGroupDraft(context.columns)">清空条件</button>
      <button type="button" class="bt-ui-button" :disabled="busy" @click="context.close">取消</button><button type="button" class="bt-ui-button primary" :disabled="busy || unavailable || single && !column" @click="apply()">{{single ? '应用筛选' : '应用条件'}}</button>
    </template>
  </DialogFrame>
  <DialogFrame v-if="planOpen && plans" title="筛选方案" subtitle="选择后载入当前编辑草稿，点击应用条件后才更新结果。" :busy="busy" class="bt-filter-dialog" @close="planOpen = false">
    <div class="bt-filter-plans">
      <label class="bt-ui-field">选择方案<select :value="selectedPlan" aria-label="筛选方案" :disabled="plans.loading.value || !plans.ready.value || busy" @change="loadPlan(($event.target as HTMLSelectElement).value)"><option value="">选择方案</option><option v-for="plan in planItems" :key="plan.id" :value="plan.id">{{plan.name}}</option></select></label>
      <div class="bt-filter-plan-actions"><button type="button" class="bt-ui-button text" :disabled="busy || !plans.ready.value || unavailable" @click="nameDialog(false)">保存为方案</button><template v-if="selectedPlan"><button type="button" class="bt-ui-button text" :disabled="busy || !plans.ready.value || unavailable" @click="savePlan(true)">更新方案</button><button type="button" class="bt-ui-button text" :disabled="busy || !plans.ready.value" @click="nameDialog(true)">重命名</button><button type="button" class="bt-ui-button text" :disabled="busy || !plans.ready.value" @click="deleteOpen = true">删除方案</button></template></div>
      <p v-if="plans.loading.value" class="bt-ui-note" role="status">正在读取筛选方案…</p>
      <p v-if="planLoadError" class="bt-ui-error" role="alert">{{planLoadError}} <button type="button" class="bt-ui-button text" :disabled="plans.loading.value" @click="reloadPlans(true)">重新读取</button></p>
      <p v-if="error" class="bt-ui-error" role="alert">{{error}}</p>
    </div>
    <template #footer><button type="button" class="bt-ui-button" :disabled="busy" @click="planOpen = false">关闭</button></template>
  </DialogFrame>
  <DialogFrame v-if="nameOpen" :title="renameMode ? '重命名筛选方案' : '保存筛选方案'" :busy="busy" class="bt-filter-dialog" @close="nameOpen = false">
    <label class="bt-ui-field">方案名称<input v-model="planName" autofocus maxlength="40" aria-label="方案名称" @keydown.enter.prevent="savePlan()"></label><p v-if="planError" class="bt-ui-error" role="alert">{{planError}}</p>
    <template #footer><button type="button" class="bt-ui-button" :disabled="busy" @click="nameOpen = false">取消</button><button type="button" class="bt-ui-button primary" :disabled="busy" @click="savePlan()">保存</button></template>
  </DialogFrame>
  <DialogFrame v-if="deleteOpen" title="删除筛选方案" :busy="busy" class="bt-filter-dialog" @close="deleteOpen = false"><p>删除后不会更改当前筛选条件。</p><p v-if="error" class="bt-ui-error" role="alert">{{error}}</p><template #footer><button type="button" class="bt-ui-button" :disabled="busy" @click="deleteOpen = false">取消</button><button type="button" class="bt-ui-button danger" :disabled="busy" @click="removePlan">删除</button></template></DialogFrame>
</template>
