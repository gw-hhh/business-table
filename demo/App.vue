<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { BusinessTable, createLocalStoragePersistence, displayValue, type Action, type ColumnConfig, type DataSource, type FilterConfig, type Query, type RowData, type SearchContext, type ViewConfig, type ViewSnapshot } from '../src'
import TableIcon from '../src/components/TableIcon.vue'
import ToolStrip from '../src/features/toolbar/ToolStrip.vue'
import { defaultPresentation, type TablePresentation, type ToolDefinition } from '../src/features/presentation/model'
import type { SettingsDefinition } from '../src/features/settings/policy'
import { viewQueryEquals } from '../src/features/views/runtime'
import QuotationDialog from './quotation/QuotationDialog.vue'
import { createQuotationDraft, filterQuotations, makeExampleQuotations, parseQuotationBackup, parseQuotationViews, quotationColumns, quotationSearchDefinition, quotationStatuses, saveQuotation, serializeQuotationBackup, updateSavedView, type Quotation, type QuotationView } from './quotation/model'
import './quotation.css'

const dataKey = 'business-table.quotation-demo.data.v1', viewKey = 'business-table.quotation-demo.views.v1', tableKey = 'quotation.demo.visual'
const message = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function toast(text: string) { message.value = text; clearTimeout(toastTimer); toastTimer = setTimeout(() => { message.value = '' }, 4000) }
function readRows() {
  try { const saved = localStorage.getItem(dataKey); return saved ? parseQuotationBackup(saved) : makeExampleQuotations() }
  catch { message.value = '本地数据暂时无法读取，已载入示例数据。'; return makeExampleQuotations() }
}
function defaultViews(): QuotationView[] {
  return [
    { id: 'all', name: '全部报价', keyword: '', filters: [], sorts: [{ field: 'id', order: 'desc' }] },
    { id: 'mine', name: '我负责的未结报价', keyword: '', filters: [{ field: 'owner', operator: 'eq', value: '林予安' }, { field: 'status', operator: 'in', value: ['草稿', '评审中', '已批准'] }], sorts: [{ field: 'id', order: 'desc' }] },
    { id: 'customer', name: '澄川水务专属', isDefault: true, keyword: '', filters: [{ field: 'customer', operator: 'eq', value: '澄川水务' }], sorts: [{ field: 'id', order: 'desc' }] },
  ]
}
function readViews(): QuotationView[] {
  try {
    const saved = localStorage.getItem(viewKey)
    if (!saved) return defaultViews()
    return parseQuotationViews(saved)
  } catch { return defaultViews() }
}
const quotations = ref(readRows()), views = ref(readViews())
const activeView = ref(views.value.find(view => view.isDefault)?.id ?? views.value[0]?.id ?? 'customer')
const currentView = computed(() => views.value.find(view => view.id === activeView.value))
const advanced = ref(true), searchVisible = ref(true), chipsVisible = ref(true), selectionVisible = ref(true), selectedRows = ref<Quotation[]>([])
const density = ref<'compact' | 'default' | 'comfortable'>('comfortable')
const query = ref<Query>({ page: 1, pageSize: 100, keyword: '', filters: [], sorts: [] }), rowCount = ref(0)
const filteredRows = computed(() => filterQuotations(quotations.value, query.value))
const totalAmount = computed(() => filteredRows.value.reduce((sum, row) => sum + row.amount, 0))
const money = (value: number) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
const table = ref<{ setQuery: (query: Partial<Query>) => Promise<void>; applyView: (view?: ViewConfig, keyword?: string) => Promise<void>; reload: () => Promise<void>; getState: () => { columns: typeof quotationColumns; searchFilters: FilterConfig[] }; getRuntime: () => { searchContext: () => SearchContext; presentation: Ref<TablePresentation> }; clearSelection: () => void; viewSnapshot: () => ViewSnapshot }>()
const currentSearch = () => table.value?.getRuntime().searchContext()
const persistence = createLocalStoragePersistence(), columnsModified = ref(false)
let savedColumns = ''
async function columnsChanged() { await nextTick(); columnsModified.value = JSON.stringify(table.value?.getState().columns ?? []) !== savedColumns }
const features = { title: false, search: { enabled: true, mode: 'headless' as const }, views: false, toolbar: false, columnSettings: true, filters: true }
const settingsDefinition: SettingsDefinition = {
  pages: { columns: true, sorts: true, actions: true, appearance: true, toolbar: true },
  columnSections: { basic: true, content: true, number: true, filter: true, mapping: true, template: true, trial: true },
}
const toolbarLayout = computed(() => table.value?.getRuntime().presentation.value.toolbar ?? defaultPresentation().toolbar)
function previewCell(value: unknown, row: RowData, column: ColumnConfig) {
  const style = { fontSize: `${column.cellStyle?.fontSize ?? 14}px` }
  if (column.id === 'name') return h('div', { class: 'q-project-cell', style }, [h('span', String(row.name ?? '')), h('small', String(row.customer ?? ''))])
  if (column.id === 'id') return h('span', { style: { color: '#2468e8' } }, String(value ?? ''))
  if (column.id === 'status') return h('span', { class: ['q-status', { '草稿': 'q-status--draft', '已转合同': 'q-status--contract', '评审中': 'q-status--review', '已批准': 'q-status--approved', '已关闭': 'q-status--closed' }[String(value)]], style }, [h('i'), String(value ?? '')])
  return displayValue(value, column)
}
const source: DataSource<Quotation> = { async readAll(request) { return filterQuotations(quotations.value, request) }, async query(request) { const result = filterQuotations(quotations.value, request); rowCount.value = result.length; return { rows: result.slice((request.page - 1) * request.pageSize, request.page * request.pageSize), total: result.length } } }
const customers = computed(() => [...new Set(quotations.value.map(row => row.customer))]), owners = computed(() => [...new Set(quotations.value.map(row => row.owner))]), regions = computed(() => [...new Set(quotations.value.map(row => row.region))])
const searchDefinition = computed(() => quotationSearchDefinition(quotations.value))
const filters = computed(() => {
  const result: { field: string; text: string }[] = []
  if (query.value.keyword) result.push({ field: 'keyword', text: `关键词：${query.value.keyword}` })
  for (const filter of query.value.filters) {
    const title = ({ customer: '客户', status: '状态', owner: '负责人', region: '大区', createdAt: '创建日期' } as Record<string, string>)[filter.field] ?? filter.field
    const value = Array.isArray(filter.value) ? filter.value.join(' / ') : String(filter.value)
    result.push({ field: filter.field + (filter.operator === 'gte' ? ':from' : filter.operator === 'lte' ? ':to' : ''), text: `${title}：${filter.operator === 'gte' ? '从 ' : filter.operator === 'lte' ? '至 ' : ''}${value}` })
  }
  return result
})
const queryPending = computed(() => currentSearch()?.pending ?? false)
const viewModified = computed(() => {
  const view = currentView.value
  return !!view && (!viewQueryEquals(view, table.value?.viewSnapshot() ?? query.value, { definition: searchDefinition.value }) || columnsModified.value)
})
const searchError = ref('')
async function submitSearch() {
  searchError.value = ''
  try { await currentSearch()?.submit() }
  catch (cause) { searchError.value = cause instanceof Error ? cause.message : String(cause) }
}
async function resetSearch() {
  searchError.value = ''
  try { await currentSearch()?.reset() }
  catch (cause) { searchError.value = cause instanceof Error ? cause.message : String(cause) }
}
function changeSearch(id: string, event: Event) {
  const value = (event.target as HTMLInputElement | HTMLSelectElement).value
  currentSearch()?.setValue(id, value === '' && (event.target instanceof HTMLSelectElement) ? null : value)
}
async function removeFilter(field: string) {
  const context = currentSearch()
  if (field === 'keyword') { context?.setValue('keyword', ''); await context?.submit(); return }
  const matching = searchDefinition.value.items.find(item => `${item.field}${item.operator === 'gte' ? ':from' : item.operator === 'lte' ? ':to' : ''}` === field)
  if (matching && context) { context.setValue(matching.id, matching.kind === 'select' ? null : ''); await context.submit(); return }
  const remaining = (table.value?.getState().searchFilters ?? []).filter(filter => `${filter.field}${filter.operator === 'gte' ? ':from' : filter.operator === 'lte' ? ':to' : ''}` !== field)
  await table.value?.setQuery({ filters: remaining })
}
function persistData() { try { localStorage.setItem(dataKey, serializeQuotationBackup(quotations.value)) } catch { toast('浏览器无法保存数据，请及时备份。') } }
function persistViews() { try { localStorage.setItem(viewKey, JSON.stringify(views.value)) } catch { toast('浏览器无法保存视图。') } }
async function refresh() { await table.value?.reload() }
async function applyView(view: QuotationView) {
  activeView.value = view.id
  await table.value?.applyView(view)
  savedColumns = JSON.stringify(table.value?.getState().columns ?? []); columnsModified.value = false; closeMenu()
}
type MenuName = 'page' | 'views' | 'density' | 'sort' | null
const menu = ref<MenuName>(null)
let menuTrigger: HTMLElement | null = null
function menuElement() {
  return menuTrigger?.closest('.q-menu-anchor')?.querySelector<HTMLElement>('[role="menu"]') ?? null
}
function menuItems() {
  return Array.from(menuElement()?.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]') ?? [])
    .filter(item => !item.disabled && item.getAttribute('aria-disabled') !== 'true')
}
function positionPopup() {
  if (!menu.value) return
  const anchor = menuTrigger?.closest<HTMLElement>('.q-menu-anchor')
  const popup = anchor?.querySelector<HTMLElement>('.q-popup')
  const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight
  if (!anchor || !popup || !width || !height) return
  // Start from the CSS anchor on every resize; use clientWidth, excluding the scrollbar.
  popup.style.left = ''; popup.style.right = ''; popup.style.top = ''
  popup.style.maxWidth = `${Math.max(0, width - 16)}px`
  popup.style.maxHeight = `${Math.max(0, height - 16)}px`
  popup.style.overflow = 'auto'
  const rect = popup.getBoundingClientRect(), origin = anchor.getBoundingClientRect()
  const left = Math.max(8, Math.min(rect.left, width - rect.width - 8))
  const top = Math.max(8, Math.min(rect.top, height - rect.height - 8))
  popup.style.left = `${left - origin.left}px`
  popup.style.right = 'auto'
  popup.style.top = `${top - origin.top}px`
}
async function toggleMenu(name: MenuName, event: Event) {
  if (menu.value === name) { closeMenu(); return }
  menuTrigger = event.currentTarget as HTMLElement
  menu.value = name
  await nextTick()
  if (menu.value !== name) return
  positionPopup()
  menuItems()[0]?.focus()
}
function openMenuFromKey(name: MenuName, event: KeyboardEvent) {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || !['ArrowDown', 'ArrowUp'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  menuTrigger = event.currentTarget as HTMLElement
  menu.value = name
  void nextTick(() => {
    if (menu.value !== name) return
    positionPopup()
    const items = menuItems()
    items[event.key === 'ArrowUp' ? items.length - 1 : 0]?.focus()
  })
}
function closeMenu(restoreFocus = true) { menu.value = null; if (restoreFocus && menuTrigger?.isConnected) menuTrigger.focus() }
function dismissMenus(event: PointerEvent) { if (!(event.target instanceof Element) || !event.target.closest('.q-menu-anchor')) closeMenu(false) }
function isTabStop(element: HTMLElement) {
  if (element.tabIndex < 0 || element.matches(':disabled,[aria-disabled="true"]')) return false
  for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    if (parent.hidden || parent.inert || style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}
function keyboard(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || !menu.value) return
  if (event.key === 'Escape') { event.preventDefault(); closeMenu(); return }
  const popup = menuElement()
  if (!popup || !(event.target instanceof Node) || !popup.contains(event.target)) return
  if (event.key === 'Tab') {
    // Move past the trigger in the page's tab order, never into an item being removed.
    const stops = Array.from(document.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]'))
      .filter(element => !popup.contains(element) && isTabStop(element))
    const index = menuTrigger ? stops.indexOf(menuTrigger) : -1
    const next = index >= 0 ? stops[index + (event.shiftKey ? -1 : 1)] : undefined
    event.preventDefault(); closeMenu(false); (next ?? menuTrigger)?.focus()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return
  const items = menuItems(), index = items.indexOf(document.activeElement as HTMLButtonElement)
  if (!items.length) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
    : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
  items[next]?.focus()
}
function viewSnapshot(): ViewSnapshot {
  return table.value?.viewSnapshot() ?? { keyword: '', filters: [], columnFilters: [], sorts: [], columns: {} }
}
function saveCurrentView() { views.value = updateSavedView(views.value, activeView.value, viewSnapshot()); savedColumns = JSON.stringify(table.value?.getState().columns ?? []); columnsModified.value = false; persistViews(); closeMenu(); toast('已更新当前视图') }
function setDefaultView(id: string) { views.value = views.value.map(view => ({ ...view, isDefault: view.id === id })); persistViews() }
function moveView(index: number, offset: number) { const items = [...views.value], moved = items.splice(index, 1)[0]; if (moved) items.splice(index + offset, 0, moved); views.value = items; persistViews() }
const viewEditor = ref<{ id?: string; name: string } | null>(null), viewError = ref('')
function editView(view?: QuotationView) { viewError.value = ''; viewEditor.value = view ? { id: view.id, name: view.name } : { name: '' }; closeMenu() }
async function saveViewName() {
  if (!viewEditor.value) return
  const name = viewEditor.value.name.trim()
  if (!name) { viewError.value = '请填写视图名称'; return }
  if (views.value.some(view => view.name === name && view.id !== viewEditor.value?.id)) { viewError.value = '已有同名视图'; return }
  if (viewEditor.value.id) views.value = views.value.map(view => view.id === viewEditor.value?.id ? { ...view, name } : view)
  else { const id = crypto.randomUUID(); views.value.push({ id, name, ...JSON.parse(JSON.stringify(viewSnapshot())) }); activeView.value = id; await table.value?.setQuery({ viewId: id }) }
  savedColumns = JSON.stringify(table.value?.getState().columns ?? []); columnsModified.value = false
  persistViews(); viewEditor.value = null; toast('视图已保存')
}
const confirmation = ref<{ title: string; text: string; action: () => void | Promise<void>; danger?: boolean } | null>(null)
async function confirmAction() { const pending = confirmation.value; confirmation.value = null; await pending?.action() }
function deleteView(view: QuotationView) {
  closeMenu(); confirmation.value = { title: '删除视图', text: `确定删除“${view.name}”吗？报价数据不会改变。`, danger: true, action: async () => { views.value = views.value.filter(item => item.id !== view.id); if (activeView.value === view.id) await applyView(views.value[0]!); persistViews() } }
}
const editor = ref<{ mode: 'new' | 'edit' | 'view'; row: Quotation } | null>(null), editorError = ref('')
function showQuotation(mode: 'new' | 'edit' | 'view', row?: Quotation) { editorError.value = ''; editor.value = { mode, row: row ? { ...row } : { ...createQuotationDraft(undefined, quotations.value), customer: String(currentSearch()?.getValue('customer') ?? '') } } }
async function saveEditor() {
  if (!editor.value) return
  try { quotations.value = saveQuotation(quotations.value, editor.value.row); persistData(); editor.value = null; await refresh(); toast('报价已保存') }
  catch (error) { editorError.value = error instanceof Error ? error.message : '保存失败' }
}
async function copyQuotation(row: Quotation) { const draft = createQuotationDraft(row, quotations.value); quotations.value = saveQuotation(quotations.value, draft); persistData(); await refresh(); toast(`已复制为草稿：${draft.id}`) }
function deleteQuotations(rows: Quotation[]) {
  confirmation.value = { title: '删除报价', text: `确定删除${rows.length === 1 ? `报价 ${rows[0]!.id}` : `选中的 ${rows.length} 条报价`}吗？删除后可通过备份恢复。`, danger: true, action: async () => { const ids = new Set(rows.map(row => row.id)); quotations.value = quotations.value.filter(row => !ids.has(row.id)); persistData(); table.value?.clearSelection(); await refresh(); toast('报价已删除') } }
}
function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type })), link = document.createElement('a')
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0)
}
function csvCell(value: unknown) { const text = String(value ?? ''); return `"${(/^[=+@-]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"` }
function exportCsv(rows = filteredRows.value, name = '报价清单') { download(`${name}.csv`, '\uFEFF' + [quotationColumns.map(column => csvCell(column.title)).join(','), ...rows.map(row => quotationColumns.map(column => csvCell(row[column.field])).join(','))].join('\r\n')); toast(`已导出 ${rows.length} 条报价`) }
function backup(rows = quotations.value, name = '报价数据备份') { download(`${name}.json`, serializeQuotationBackup(rows), 'application/json'); closeMenu() }
function downloadTemplate() { download('报价导入模板.csv', '\uFEFF' + quotationColumns.map(column => csvCell(column.title)).join(',')); toast('模板已下载') }
async function copyId(row: Quotation) { try { await navigator.clipboard.writeText(row.id); toast('报价编号已复制') } catch { toast('浏览器未允许复制，请从报价详情中复制编号。') } }
const restoreInput = ref<HTMLInputElement>()
async function restoreBackup(event: Event) {
  const target = event.target as HTMLInputElement, file = target.files?.[0]; target.value = ''; if (!file) return
  try { const rows = parseQuotationBackup(await file.text()); confirmation.value = { title: '恢复报价备份', text: `备份中有 ${rows.length} 条报价。恢复后将替换当前数据，请确认已备份。`, action: async () => { quotations.value = rows; persistData(); table.value?.clearSelection(); await resetSearch(); toast('报价备份已恢复') } } }
  catch (error) { toast(error instanceof Error ? error.message : '无法读取备份') }
}
function resetExamples() { closeMenu(); confirmation.value = { title: '恢复示例数据', text: '将用初始示例替换当前报价数据。继续前请确认已备份。', action: async () => { quotations.value = makeExampleQuotations(); persistData(); table.value?.clearSelection(); await refresh(); toast('示例数据已恢复') } } }
const helpVisible = ref(false), sortField = ref('id'), sortOrder = ref<'asc' | 'desc'>('desc')
async function applySort() { await table.value?.setQuery({ sorts: [{ field: sortField.value, order: sortOrder.value }] }); closeMenu() }
const tools = computed<{ page: ToolDefinition[]; table: ToolDefinition[] }>(() => ({
  page: [
    { id: 'template', label: '模板下载', icon: 'file', handler: downloadTemplate },
    { id: 'export', label: '导出', icon: 'download', handler: () => exportCsv() },
    { id: 'add', label: '新增报价', icon: 'plus', variant: 'primary', fixed: true, handler: () => showQuotation('new') },
    { id: 'backup', label: '备份报价数据（JSON）', icon: 'download', position: 'more', handler: () => backup() },
    { id: 'restore', label: '恢复报价备份', icon: 'upload', position: 'more', handler: () => restoreInput.value?.click() },
    { id: 'examples', label: '恢复示例数据', icon: 'refresh', position: 'more', separator: true, handler: resetExamples },
    { id: 'help', label: '使用说明', icon: 'info', position: 'more', handler: () => { helpVisible.value = true } },
  ],
  table: [
    { id: 'selection', label: '批量操作', icon: 'batch', display: 'icon', active: selectionVisible.value, handler: () => { selectionVisible.value = !selectionVisible.value; table.value?.clearSelection() } },
    { id: 'search', label: '查询条件', icon: 'search', display: 'icon', active: searchVisible.value, handler: () => { searchVisible.value = !searchVisible.value } },
    { id: 'reload', label: '刷新', icon: 'refresh', display: 'icon', handler: refresh },
    { id: 'density', label: '行高密度', icon: 'density', display: 'icon', handler: event => toggleMenu('density', event) },
    { id: 'sort', label: '排序规则', icon: 'sort', display: 'icon', active: query.value.sorts.length > 0, handler: event => toggleMenu('sort', event) },
    { id: 'chips', label: '筛选条件摘要', icon: 'filter', display: 'icon', active: chipsVisible.value, handler: () => { chipsVisible.value = !chipsVisible.value } },
  ],
}))
const actions: Action<Quotation>[] = [
  { id: 'view', label: '查看', handler: row => showQuotation('view', row) }, { id: 'edit', label: '修改', handler: row => showQuotation('edit', row) },
  { id: 'copy', label: '复制为草稿', position: 'more', icon: 'copy', handler: copyQuotation }, { id: 'copy-id', label: '复制编号', position: 'more', icon: 'copy', handler: copyId },
  { id: 'export', label: '导出本条', position: 'more', icon: 'download', separator: true, children: [{ id: 'export-csv', label: '导出 CSV', handler: row => exportCsv([row], row.id) }, { id: 'export-json', label: '导出 JSON', handler: row => backup([row], row.id) }] },
  { id: 'delete', label: '删除', position: 'more', icon: 'trash', danger: true, separator: true, handler: row => deleteQuotations([row]) },
]
onMounted(async () => { document.addEventListener('pointerdown', dismissMenus); document.addEventListener('keydown', keyboard); window.addEventListener('resize', positionPopup); await nextTick(); if (currentView.value) await applyView(currentView.value) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', dismissMenus); document.removeEventListener('keydown', keyboard); window.removeEventListener('resize', positionPopup); clearTimeout(toastTimer) })
</script>

<template>
  <main class="quotation-page">
    <header class="q-page-header">
      <div><nav class="q-breadcrumb" aria-label="面包屑">销售管理 <span>/</span> 报价管理</nav><div class="q-title-row"><span class="q-page-symbol"><TableIcon name="file" :size="19"/></span><h1>报价管理</h1><span class="q-local-badge">本地演示</span></div></div>
      <div class="q-header-actions">
        <button class="q-user q-quiet" type="button" title="本地演示用户" @click="helpVisible = true"><span class="q-avatar">林</span><span>林予安</span><TableIcon name="info" :size="14"/></button>
        <ToolStrip :tools="tools.page" :layout="toolbarLayout.page" :gap="toolbarLayout.gap" more-label="更多页面操作" button-class="q-btn" icon-button-class="q-icon-btn" menu-class="q-popup q-page-menu" style="--bt-tool-menu-width:250px" />
      </div>
    </header>

    <BusinessTable ref="table" class="q-main-card" :features="features" :settings-definition="settingsDefinition" :tools="tools" :search-definition="searchDefinition" :table-key="tableKey" row-key="id" :columns="quotationColumns" :data-source="source" :persistence="persistence" :actions="actions" :preview-cell="previewCell" :selection="selectionVisible" :fill="true" :density="density" :pagination="{ pageSize: 100, pageSizeOptions: [10, 25, 50, 100] }" @query-change="query = $event" @config-change="columnsChanged" @selection-change="selectedRows = $event">
      <template #before="{ search: searchContext }">
        <form v-if="searchVisible && searchContext" class="q-search-panel" aria-label="报价查询" @submit.prevent="submitSearch">
          <div class="q-search-grid">
            <div class="q-search-field"><label for="quotation-keyword">关键词</label><div class="q-input-icon"><TableIcon name="search"/><input id="quotation-keyword" :value="searchContext.getValue('keyword') ?? ''" placeholder="报价编号 / 项目 / 客户" autocomplete="off" @input="changeSearch('keyword', $event)"/></div></div>
            <div class="q-search-field"><label for="quotation-customer">客户</label><select id="quotation-customer" :value="searchContext.getValue('customer') ?? ''" @change="changeSearch('customer', $event)"><option value="">全部客户</option><option v-for="customer in customers" :key="customer">{{ customer }}</option></select></div>
            <div class="q-search-field"><label for="quotation-status">状态</label><select id="quotation-status" :value="searchContext.getValue('status') ?? ''" @change="changeSearch('status', $event)"><option value="">全部状态</option><option v-for="status in quotationStatuses" :key="status">{{ status }}</option></select></div>
            <div class="q-search-actions"><button class="q-btn" type="button" @click="resetSearch">重置</button><button class="q-btn q-primary" type="submit">查询</button><button class="q-btn q-text" type="button" :aria-expanded="advanced" @click="advanced = !advanced">{{ advanced ? '收起' : '展开' }}<TableIcon :name="advanced ? 'chevron-up' : 'chevron-down'" :size="14"/></button></div>
          </div>
          <div v-if="advanced" class="q-advanced-grid">
            <div class="q-search-field"><label for="quotation-region">大区</label><select id="quotation-region" :value="searchContext.getValue('region') ?? ''" @change="changeSearch('region', $event)"><option value="">全部大区</option><option v-for="region in regions" :key="region">{{ region }}</option></select></div>
            <div class="q-search-field"><label for="quotation-owner">负责人</label><select id="quotation-owner" :value="searchContext.getValue('owner') ?? ''" @change="changeSearch('owner', $event)"><option value="">全部负责人</option><option v-for="owner in owners" :key="owner">{{ owner }}</option></select></div>
            <div class="q-search-field q-date-field"><label for="quotation-from">创建日期</label><div class="q-date-range"><div class="q-date-input" :class="{ 'is-empty': !searchContext.getValue('from') }"><input id="quotation-from" :value="searchContext.getValue('from') ?? ''" type="date" aria-label="创建开始日期" @input="changeSearch('from', $event)"/></div><span>至</span><div class="q-date-input" :class="{ 'is-empty': !searchContext.getValue('to') }"><input :value="searchContext.getValue('to') ?? ''" type="date" aria-label="创建结束日期" @input="changeSearch('to', $event)"/></div></div></div>
          </div><p v-if="searchError" class="q-form-error" role="alert">{{ searchError }}</p>
        </form>
      </template>
      <template #toolbar-start>
        <div class="q-table-title"><h2>报价列表</h2><span class="q-toolbar-divider" aria-hidden="true"/><div class="q-menu-anchor"><button class="q-view-switch" type="button" aria-label="保存与切换视图" :aria-expanded="menu === 'views'" aria-haspopup="dialog" @click="toggleMenu('views', $event)"><TableIcon name="bookmark" :size="13"/><span>{{ currentView?.name ?? '全部报价' }}</span><TableIcon name="chevron-down" :size="12"/></button>
          <div v-if="menu === 'views'" class="q-popup q-view-menu" role="dialog" aria-label="我的视图"><header><strong>我的视图</strong><span>{{ views.length }} / 50</span></header><p class="q-view-hint">保存查询和表格设置；标为默认后，重新打开时自动应用。</p>
            <div class="q-view-list"><div v-for="(view, index) in views" :key="view.id" class="q-view-row" :class="{ 'is-current': activeView === view.id }"><TableIcon name="grip" :size="13"/><button class="q-view-name" type="button" @click="applyView(view)">{{ view.name }}<span v-if="view.isDefault" class="q-default-tag">默认</span></button><div class="q-view-tools"><button class="q-icon-btn" :class="{ 'is-active': view.isDefault }" :title="`设为默认 ${view.name}`" :aria-pressed="!!view.isDefault" @click="setDefaultView(view.id)"><TableIcon name="star" :size="12"/></button><button class="q-icon-btn" :title="`重命名 ${view.name}`" :disabled="view.id === 'all'" @click="editView(view)"><TableIcon name="edit" :size="12"/></button><button class="q-icon-btn" :title="`上移 ${view.name}`" :disabled="index === 0" @click="moveView(index, -1)"><TableIcon name="chevron-up" :size="12"/></button><button class="q-icon-btn" :title="`下移 ${view.name}`" :disabled="index === views.length - 1" @click="moveView(index, 1)"><TableIcon name="chevron-down" :size="12"/></button><button class="q-icon-btn" :title="`删除 ${view.name}`" :disabled="view.id === 'all'" @click="deleteView(view)"><TableIcon name="trash" :size="12"/></button></div></div></div>
            <footer><button class="q-btn q-text" @click="saveCurrentView">更新当前视图</button><button class="q-btn q-primary" :disabled="views.length >= 50" @click="editView()"><TableIcon name="plus" :size="14"/>另存为视图</button></footer>
          </div></div><span v-if="viewModified" class="q-modified">未保存</span><span class="q-count">{{ rowCount }}</span><div v-if="selectedRows.length" class="q-selection"><span>已选 <strong>{{ selectedRows.length }}</strong> 条</span><button class="q-link" @click="exportCsv(selectedRows)">批量导出</button><button class="q-link q-danger" @click="deleteQuotations(selectedRows)">批量删除</button><button class="q-link" @click="table?.clearSelection()">清空</button></div></div>
      </template>
      <template #toolbar-end>
        <ToolStrip :tools="tools.table" :layout="toolbarLayout.table" :gap="toolbarLayout.gap" more-label="更多表格工具" button-class="q-btn" icon-button-class="q-icon-btn">
          <template #tool-density="{tool,invoke,inMenu}">
            <div class="q-menu-anchor"><button :class="tool.display==='icon'?'q-icon-btn':'q-btn'" type="button" :title="tool.label" :aria-label="tool.label" :role="inMenu?'menuitem':undefined" :tabindex="inMenu?-1:undefined" :disabled="tool.disabled===true" :aria-expanded="menu === 'density'" aria-haspopup="menu" @click="invoke($event,true)" @keydown="openMenuFromKey('density', $event)"><TableIcon v-if="tool.display!=='text'" :name="tool.icon??'density'"/><span v-if="tool.display!=='icon'">{{tool.label}}</span></button><div v-if="menu === 'density'" class="q-popup q-density-menu" role="menu" aria-label="行高密度"><button v-for="option in ([{ id: 'compact', label: '紧凑' }, { id: 'default', label: '标准' }, { id: 'comfortable', label: '舒适' }] as const)" :key="option.id" role="menuitemradio" tabindex="-1" :aria-checked="density === option.id" @click="density = option.id; closeMenu()"><TableIcon v-if="density === option.id" name="check"/><span v-else class="q-icon-space"/>{{ option.label }}</button></div></div>
          </template>
          <template #tool-sort="{tool,invoke,inMenu}">
            <div class="q-menu-anchor"><button :class="[tool.display==='icon'?'q-icon-btn':'q-btn',{'is-active':tool.active}]" type="button" :title="tool.label" :aria-label="tool.label" :role="inMenu?'menuitem':undefined" :tabindex="inMenu?-1:undefined" :disabled="tool.disabled===true" :aria-expanded="menu === 'sort'" @click="invoke($event,true)"><TableIcon v-if="tool.display!=='text'" :name="tool.icon??'sort'"/><span v-if="tool.display!=='icon'">{{tool.label}}</span></button><div v-if="menu === 'sort'" class="q-popup q-sort-menu" role="dialog" aria-label="排序规则"><strong>排序规则</strong><label>排序字段<select v-model="sortField"><option v-for="column in quotationColumns.filter(column => column.sortable)" :key="column.id" :value="column.field">{{ column.title }}</option></select></label><label>排序方式<select v-model="sortOrder"><option value="asc">升序</option><option value="desc">降序</option></select></label><footer><button class="q-btn q-text" @click="table?.setQuery({ sorts: [] }); closeMenu()">清除排序</button><button class="q-btn q-primary" @click="applySort">应用</button></footer></div></div>
          </template>
        </ToolStrip>
      </template>
      <template #after-toolbar><div v-if="chipsVisible && (filters.length || queryPending)" class="q-filter-summary"><span v-for="filter in filters" :key="filter.field" class="q-filter-chip"><span>{{ filter.text }}</span><button type="button" :aria-label="`移除${filter.text}`" @click="removeFilter(filter.field)"><TableIcon name="close" :size="12"/></button></span><button v-if="filters.length" class="q-btn q-text" type="button" @click="resetSearch">清除条件</button><span v-if="queryPending" class="q-pending">条件已修改，点击查询生效</span></div></template>
      <template #cell="{ row, column, text }"><button v-if="column.id === 'id'" class="q-link q-id-link" type="button" @click="showQuotation('view', row)">{{ text }}</button><div v-else-if="column.id === 'name'" class="q-project-cell"><span>{{ row.name }}</span><small>{{ row.customer }}</small></div><span v-else-if="column.id === 'status'" class="q-status" :class="{ 'q-status--draft': row.status === '草稿', 'q-status--contract': row.status === '已转合同', 'q-status--review': row.status === '评审中', 'q-status--approved': row.status === '已批准', 'q-status--closed': row.status === '已关闭' }"><i/>{{ row.status }}</span><span v-else>{{ text }}</span></template>
      <template #summary="{ total, page, pageSize }"><div class="q-result-summary"><span>共 {{ total }} 条 · 第 {{ total ? (page - 1) * pageSize + 1 : 0 }}–{{ Math.min(page * pageSize, total) }} 条</span><span class="q-summary-divider">·</span><span>筛选合计 <strong>￥{{ money(totalAmount) }}</strong></span></div></template>
    </BusinessTable>

    <footer class="q-page-note"><span>数据仅保存在当前浏览器，不会提交到服务器。</span><span>金额单位：人民币元</span></footer>
    <input ref="restoreInput" class="q-hidden" type="file" accept=".json,application/json" aria-label="恢复报价备份文件" @change="restoreBackup"/>
    <Transition name="q-toast"><div v-if="message" class="q-toast" role="status"><TableIcon name="check"/><span>{{ message }}</span><button class="q-icon-btn" aria-label="关闭提示" @click="message = ''"><TableIcon name="close"/></button></div></Transition>
    <QuotationDialog v-if="editor" :title="editor.mode === 'new' ? '新增报价' : editor.mode === 'edit' ? '修改报价' : '报价详情'" wide @close="editor = null">
      <form id="quotation-editor" class="q-editor-form" @submit.prevent="saveEditor"><fieldset :disabled="editor.mode === 'view'"><label class="q-full-field">报价编号<input v-model="editor.row.id" readonly/></label><label class="q-full-field">项目名称<input v-model="editor.row.name" required autofocus maxlength="160"/></label><label>客户<input v-model="editor.row.customer" required list="quotation-customers" maxlength="100"/><datalist id="quotation-customers"><option v-for="customer in customers" :key="customer" :value="customer"/></datalist></label><label>含税金额（元）<input v-model.number="editor.row.amount" type="number" required min="0" step="0.01"/></label><label>状态<select v-model="editor.row.status"><option v-for="status in quotationStatuses" :key="status">{{ status }}</option></select></label><label>负责人<input v-model="editor.row.owner" required maxlength="50"/></label><label>大区<input v-model="editor.row.region" required maxlength="50"/></label><label>有效期至<input v-model="editor.row.date" type="date" required/></label><label>创建日期<input v-model="editor.row.createdAt" type="date" required/></label><label class="q-full-field">备注<textarea v-model="editor.row.notes" rows="3"/></label></fieldset><p v-if="editorError" class="q-form-error" role="alert">{{ editorError }}</p></form>
      <template #footer><button class="q-btn" @click="editor = null">{{ editor.mode === 'view' ? '关闭' : '取消' }}</button><button v-if="editor.mode === 'view'" class="q-btn q-primary" @click="editor.mode = 'edit'">修改报价</button><button v-else class="q-btn q-primary" type="submit" form="quotation-editor">保存</button></template>
    </QuotationDialog>
    <QuotationDialog v-if="confirmation" :title="confirmation.title" @close="confirmation = null"><p class="q-confirm-text">{{ confirmation.text }}</p><template #footer><button class="q-btn" @click="confirmation = null">取消</button><button class="q-btn" :class="confirmation.danger ? 'q-danger-button' : 'q-primary'" @click="confirmAction">确定</button></template></QuotationDialog>
    <QuotationDialog v-if="viewEditor" :title="viewEditor.id ? '重命名视图' : '另存为视图'" @close="viewEditor = null"><form id="quotation-view-editor" class="q-view-editor" @submit.prevent="saveViewName"><label>视图名称<input v-model="viewEditor.name" autofocus maxlength="40" required placeholder="为当前查询和表格设置命名"/></label><p v-if="viewError" class="q-form-error" role="alert">{{ viewError }}</p></form><template #footer><button class="q-btn" @click="viewEditor = null">取消</button><button class="q-btn q-primary" type="submit" form="quotation-view-editor">保存</button></template></QuotationDialog>
    <QuotationDialog v-if="helpVisible" title="使用说明" @close="helpVisible = false"><div class="q-help"><p>这是本地报价演示。数据和视图仅保存在当前浏览器。</p><p>在查询区输入条件后点击“查询”。点击报价编号或“查看”可查看完整信息，“修改”可编辑，“更多”中可以复制、导出和删除。</p><p>视图会保存当前查询、排序和列设置。通过工具栏调整行高、排序、列显示或打开完整表格设置。</p><p>清理浏览器数据前，请使用右上角“更多页面操作”中的备份功能。备份可在同一页面恢复。</p></div><template #footer><button class="q-btn q-primary" @click="helpVisible = false">知道了</button></template></QuotationDialog>
  </main>
</template>
