<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import TableIcon from '../../components/TableIcon.vue'
import AnchoredPopup from '../../ui/AnchoredPopup.vue'
import DialogFrame from '../../ui/DialogFrame.vue'
import { columnTextCss } from '../../components/settingsTypes'
import type { UserColumnConfig } from '../../types'
import type { ColumnHeaderContext } from './header'

const props = defineProps<{ context: ColumnHeaderContext }>()
const anchor = ref<HTMLElement | null>(null), menu = ref(false), renaming = ref(false), title = ref(''), failure = ref('')
const column = computed(() => props.context.column)
const ruleIndex = computed(() => props.context.sorts.findIndex(rule => rule.field === column.value.field))
const rule = computed(() => props.context.sorts[ruleIndex.value])
const access = (field: keyof UserColumnConfig) => props.context.access(field)
const editable = (field: keyof UserColumnConfig) => access(field).visible && !access(field).disabled
const hasMenu = computed(() => props.context.settings || props.context.filterable || column.value.sortable)
const minimum = computed(() => typeof column.value.configurable?.width === 'object' ? column.value.configurable.width.min ?? column.value.minWidth ?? 80 : column.value.minWidth ?? 80)
const maximum = computed(() => typeof column.value.configurable?.width === 'object' ? column.value.configurable.width.max ?? 640 : 640)
async function run(action: () => void | Promise<void>) { menu.value = false; failure.value = ''; try { await action() } catch (cause) { failure.value = cause instanceof Error ? cause.message : String(cause) } }
function open(event: Event) { anchor.value = event.currentTarget as HTMLElement; menu.value = true }
function beginRename() { title.value = column.value.title; renaming.value = true }
async function saveTitle() { if (!title.value.trim()) { failure.value = '请填写列名称'; return }; await run(() => props.context.patch({ title: title.value.trim() })); if (!failure.value) renaming.value = false }
function resizeTo(width: number) { if (editable('width')) void run(() => props.context.patch({ width: Math.max(minimum.value, Math.min(maximum.value, Math.round(width))) })) }
function resetWidth() { resizeTo(props.context.baseWidth ?? column.value.minWidth ?? 160) }
function resizeKey(event: KeyboardEvent) {
  if (!editable('width') || !['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  if (event.key === 'Home') resetWidth()
  else resizeTo((column.value.width ?? props.context.baseWidth ?? 160) + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 10 : 1))
}
const guide = ref<number>(), measuredWidth = ref<number>()
let stopResize: (() => void) | undefined
function startResize(event: PointerEvent) {
  if (event.button !== 0 || !editable('width')) return
  event.preventDefault(); event.stopPropagation(); stopResize?.()
  const handle = event.currentTarget as HTMLElement, cell = handle.closest('th'), rect = cell?.getBoundingClientRect()
  const start = event.clientX, width = rect?.width ?? column.value.width ?? 160
  guide.value = start; measuredWidth.value = width
  const previousCursor = document.body.style.cursor, previousSelect = document.body.style.userSelect
  document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
  const move = (next: PointerEvent) => { measuredWidth.value = Math.max(minimum.value, Math.min(maximum.value, width + next.clientX - start)); guide.value = start + measuredWidth.value - width }
  const cleanup = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', cancel); document.removeEventListener('keydown', key); document.body.style.cursor = previousCursor; document.body.style.userSelect = previousSelect; guide.value = undefined; stopResize = undefined }
  const end = () => { const next = measuredWidth.value; cleanup(); if (next !== undefined) resizeTo(next) }
  const cancel = () => cleanup()
  const key = (next: KeyboardEvent) => { if (next.key === 'Escape') { next.preventDefault(); cleanup() } }
  stopResize = cleanup
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', cancel); document.addEventListener('keydown', key)
}
onBeforeUnmount(() => stopResize?.())
</script>

<template>
  <div class="bt-column-header" :data-align="column.headerStyle?.align ?? column.align ?? 'left'" @contextmenu.prevent="hasMenu && open($event)">
    <button v-if="column.sortable" class="bt__sort" :class="{'is-sorted':rule}" :style="columnTextCss(column.headerStyle)" @click="context.sort()"><span>{{column.title}}</span><span class="bt__sort-mark">{{rule ? (rule.order==='asc'?'↑':'↓') : '↑↓'}}</span><small v-if="rule && context.sorts.length>1">{{ruleIndex+1}}</small></button>
    <span v-else class="bt-column-title" :style="columnTextCss(column.headerStyle)">{{column.title}}</span>
    <button v-if="context.filterable" type="button" class="bt__column-filter" :class="{'is-active':context.filtered}" :aria-pressed="context.filtered" :aria-label="'筛选 '+column.title" :title="'筛选 '+column.title" :data-testid="'column-filter-'+column.id" @click.stop="context.filter()"><TableIcon name="filter" :size="13"/></button>
    <button v-if="hasMenu" type="button" class="bt-column-menu-trigger" :aria-label="column.title+'列菜单'" :aria-expanded="menu" aria-haspopup="menu" @click.stop="open" @keydown.down.prevent="open"><TableIcon name="more" :size="13"/></button>
    <span v-if="access('width').visible" class="bt-column-resize" role="separator" tabindex="0" aria-orientation="vertical" :aria-label="'调整'+column.title+'列宽'" :aria-valuenow="column.width ?? context.baseWidth" :aria-valuemin="minimum" :aria-valuemax="maximum" :aria-disabled="access('width').disabled" title="拖动调整列宽，双击恢复；方向键微调" @pointerdown="startResize" @keydown="resizeKey" @dblclick.stop="resetWidth"/>
  </div>
  <AnchoredPopup v-if="menu" :anchor="anchor" :label="column.title+'设置'" :width="230" @close="menu=false">
    <button v-if="access('title').visible" role="menuitem" :disabled="!editable('title')" @click="run(beginRename)"><TableIcon name="edit"/>重命名列</button>
    <button v-if="context.settings" role="menuitem" @click="run(context.configure)"><TableIcon name="settings"/>设置此列</button>
    <button v-if="context.filterable" role="menuitem" @click="run(context.filter)"><TableIcon name="filter"/>筛选此列</button>
    <template v-if="column.sortable"><div class="bt-menu-divider"/><button role="menuitem" @click="run(()=>context.sort('asc'))"><TableIcon name="chevron-up"/>升序排列</button><button role="menuitem" @click="run(()=>context.sort('desc'))"><TableIcon name="chevron-down"/>降序排列</button><button role="menuitem" @click="run(()=>context.sort(null))">取消此列排序</button></template>
    <div v-if="access('fixed').visible || access('width').visible" class="bt-menu-divider"/>
    <template v-if="access('fixed').visible"><button v-for="side in (['left','right'] as const)" :key="side" role="menuitem" :disabled="!editable('fixed')" @click="run(()=>context.patch({fixed:column.fixed===side?false:side}))"><TableIcon :name="'pin-'+side"/>{{column.fixed===side ? `取消${side==='left'?'左':'右'}侧冻结` : `冻结在${side==='left'?'左':'右'}侧`}}</button></template>
    <button v-if="access('width').visible" role="menuitem" :disabled="!editable('width')" @click="resetWidth">恢复默认列宽</button>
  </AnchoredPopup>
  <DialogFrame v-if="renaming" title="重命名列" @close="renaming=false"><form id="bt-rename-column" @submit.prevent="saveTitle"><label class="bt-ui-field">列名称<input v-model="title" maxlength="80" autofocus/></label><p v-if="failure" class="bt-ui-error" role="alert">{{failure}}</p></form><template #footer><button class="bt-ui-button" @click="renaming=false">取消</button><button class="bt-ui-button primary" form="bt-rename-column">保存</button></template></DialogFrame>
  <Teleport to="body"><div v-if="guide!==undefined" class="bt-column-resize-guide" :style="{left:guide+'px'}"/><p v-if="failure&&!renaming" class="bt-column-error" role="alert">{{failure}}</p></Teleport>
</template>

<style>
.bt-column-header{display:flex;align-items:center;gap:1px;min-width:0;min-height:32px}.bt-column-header[data-align=right]{justify-content:flex-end}.bt-column-header[data-align=center]{justify-content:center}.bt-column-header>.bt__sort{min-width:0;flex:1}.bt-column-header[data-align=right]>.bt__sort{justify-content:flex-end}.bt-column-header[data-align=center]>.bt__sort{justify-content:center}.bt-column-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt button.bt-column-menu-trigger{width:20px;min-width:20px;height:28px;min-height:28px;padding:0;border:0;background:transparent;color:#94a3b8;opacity:0;pointer-events:none}.bt th:hover .bt-column-menu-trigger,.bt th:focus-within .bt-column-menu-trigger,.bt-column-menu-trigger[aria-expanded=true]{opacity:1;pointer-events:auto}.bt-column-resize{position:absolute;right:0;top:0;bottom:0;width:7px;cursor:col-resize;z-index:3}.bt-column-resize:hover,.bt-column-resize:focus-visible{background:#2468e820;border-right:2px solid #2468e8}.bt-column-resize[aria-disabled=true]{cursor:default}.bt-column-resize-guide{position:fixed;top:0;bottom:0;width:2px;background:#2468e8;z-index:2200;pointer-events:none}.bt-column-error{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2000;color:#b42318;background:#fff;padding:10px 16px;border:1px solid #f4d9db;border-radius:6px}.bt__sort>small{font-size:10px;color:#2468e8}@media(hover:none){.bt button.bt-column-menu-trigger{opacity:1;pointer-events:auto}}
</style>
