<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { BusinessTable, createLocalStoragePersistence, type Action, type DataSource, type Query, type SearchContext, type ViewConfig, type ViewSnapshot } from '../src'
import TableIcon from '../src/components/TableIcon.vue'
import ToolStrip from '../src/features/toolbar/ToolStrip.vue'
import { defaultPresentation, type TablePresentation, type ToolDefinition } from '../src/features/presentation/model'
import type { SettingsDefinition } from '../src/features/settings/policy'
import type { DataToolName } from '../src/config/features'
import type { RangeSelectionContext } from '../src/features/range-selection/context'
import { createViewsRuntime, createViewChangeTracker } from '../src/features/views/runtime'
import ViewsPanel from '../src/features/views/ViewsPanel.vue'
import DensityMenu from '../src/features/presentation/DensityMenu.vue'
import {useTableControls} from '../src/features/presentation/useTableControls'
import DialogFrame from '../src/ui/DialogFrame.vue'
import {useSearchShortcut} from '../src/features/search/shortcut'
import QuotationRecordDialog from './quotation/QuotationRecordDialog.vue'
import ExportDialog from '../src/features/export/ExportDialog.vue'
import TemplateDownloadDialog from '../src/features/export/TemplateDownloadDialog.vue'
import {buildExportBook,downloadExport,exportCSV,normalizeExportOptions,type ExportField,type ExportGroup,type ExportPreset} from '../src/features/export/model'
import { createQuotationDraft, filterQuotations, makeExampleQuotations, parseQuotationBackup, parseQuotationViews, quotationColumns, quotationSearchDefinition, quotationRegions, quotationTemplateDefinition, quotationConditionalFormatting, quotationGrouping, quotationCompare, quotationRangeSelection, saveQuotation, serializeQuotationBackup, type Quotation, type QuotationView } from './quotation/model'
import {createQuotationRepository} from './quotation/repository'
import './quotation.css'

const dataKey = 'business-table.quotation-demo.data.v1', viewKey = 'business-table.quotation-demo.views.v1', tableKey = 'quotation.demo.visual'
const message = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function toast(text: string) { message.value = text; clearTimeout(toastTimer); toastTimer = setTimeout(() => { message.value = '' }, 4000) }
function defaultViews(): QuotationView[] {
  return [
    { id: 'all', name: '全部报价', isSystem: true, isDefault: true, keyword: '', filters: [], sorts: [] },
    { id: 'mine', name: '我负责的未结报价', search: {values:{owner:'林予安',status:'open'}}, sorts: [] },
    { id: 'customer', name: '澄川水务专属', search:{values:{customer:'澄川水务'}}, sorts: [] },
  ]
}
function readViews(): QuotationView[] {
  try {
    const saved = localStorage.getItem(viewKey)
    if (!saved) return defaultViews()
    return parseQuotationViews(saved).map(view=>({...view,...(view.id==='all'?{isSystem:true}:{} )}))
  } catch { return defaultViews() }
}
const repository=createQuotationRepository({storage:localStorage,key:dataKey,events:window,onWarning:toast})
repository.read()
const quotations=repository.rows
const {advanced,searchVisible,selectionVisible}=useTableControls({}, {persistence:{load:()=>localStorage.getItem(tableKey+'.controls'),save:value=>localStorage.setItem(tableKey+'.controls',JSON.stringify(value))},onError:()=>toast('查询区域偏好暂时无法保存。')})
const selectedRows = ref<Quotation[]>([])
const density = ref<'compact' | 'default' | 'comfortable'>('default')
const query = ref<Query>({ page: 1, pageSize: 10, keyword: '', filters: [], sorts: [] }), rowCount = ref(0)
const filteredRows = computed(() => filterQuotations(quotations.value, query.value))
const selectedAmount=computed(()=>selectedRows.value.reduce((sum,row)=>sum+row.amount,0))
const totalAmount = computed(() => filteredRows.value.reduce((sum, row) => sum + row.amount, 0))
const money = (value: number) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
const table = ref<{ openDataTool:(name:DataToolName)=>Promise<void>; getFeatureContext:(name:'rangeSelection')=>RangeSelectionContext|undefined; openFilters:(columnId?:string)=>Promise<void>; setQuery: (query: Partial<Query>) => Promise<void>; applyView: (view?: ViewConfig, keyword?: string) => Promise<void>; reload: () => Promise<void>; getState: () => { columns: typeof quotationColumns }; openColumnSettings:(mode:'quick'|'drawer',columnId?:string,tab?:'columns'|'sorts'|'actions'|'appearance'|'toolbar')=>Promise<void>; getRuntime: () => { setPresentation:(value:{appearance:{density:'compact'|'default'|'comfortable'}})=>Promise<void>; searchContext: () => SearchContext; presentation: Ref<TablePresentation> }; clearSelection: () => void; selectQuery:()=>Promise<void>; viewSnapshot: () => ViewSnapshot }>()
const currentSearch = () => table.value?.getRuntime().searchContext()
const persistence = createLocalStoragePersistence()
const features = {
  title: false, search: { enabled: true, mode: 'headless' as const }, views: false, toolbar: false,
  columnSettings: {enabled:true,entry:false}, filters: {enabled:true,entry:false},
  conditionalFormatting: {enabled:true,entry:false}, grouping: {enabled:true,entry:false},
  compare: {enabled:true,entry:false}, rangeSelection: {enabled:true,entry:false},
}
const settingsDefinition: SettingsDefinition = {
  pages: { columns: true, sorts: true, actions: true, appearance: true, toolbar: true },
  columnSections: { basic: true, content: true, number: true, filter: true, mapping: true, template: true, trial: true },
}
const toolbarLayout = computed(() => table.value?.getRuntime().presentation.value.toolbar ?? defaultPresentation().toolbar)
const source: DataSource<Quotation> = { async readAll(request) { return filterQuotations(quotations.value, request) }, async query(request) { const result = filterQuotations(quotations.value, request); rowCount.value = result.length; return { rows: result.slice((request.page - 1) * request.pageSize, request.page * request.pageSize), total: result.length } } }
const customers = computed(() => [...new Set(quotations.value.map(row => row.customer))].sort((a,b)=>a.localeCompare(b,'zh-CN'))), owners = computed(() => [...new Set(quotations.value.map(row => row.owner))].sort((a,b)=>a.localeCompare(b,'zh-CN'))), regions = computed(() => [...new Set([...quotationRegions,...quotations.value.map(row => row.region)])])
const searchDefinition = computed(() => quotationSearchDefinition(quotations.value))
const queryPending = computed(() => currentSearch()?.pending ?? false)
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
async function refresh() {try{repository.read(true);await table.value?.reload()}catch(cause){toast(cause instanceof Error?cause.message:'刷新失败，请重试。')}}
const viewsRuntime=createViewsRuntime({tableKey,initial:readViews(),
  apply:async(view)=>{await table.value?.applyView(view);if(typeof view.searchCollapsed==='boolean')advanced.value=!view.searchCollapsed;viewChanges.accept()},
  save:async(views)=>{localStorage.setItem(viewKey,JSON.stringify(views))},
})
function viewSnapshot():ViewSnapshot{return {...table.value?.viewSnapshot(),searchCollapsed:!advanced.value}}
const viewChanges=createViewChangeTracker(viewSnapshot),viewModified=viewChanges.modified
function viewCommitted(){viewChanges.accept()}
function focusSearch(){searchVisible.value=true;void nextTick(()=>document.getElementById('quotation-keyword')?.focus())}
useSearchShortcut(focusSearch)
const densityMenu=ref<{open:(event:Event)=>void}>()
async function setDensity(value:'compact'|'default'|'comfortable'){await table.value?.getRuntime().setPresentation({appearance:{density:value}})}
const confirmation = ref<{ title: string; text: string; action: () => void | Promise<void>; danger?: boolean } | null>(null)
const confirmBusy=ref(false),confirmationError=ref('')
async function confirmAction() {if(confirmBusy.value)return;confirmationError.value='';confirmBusy.value=true;try{await confirmation.value?.action();confirmation.value=null}catch(cause){confirmationError.value=cause instanceof Error?cause.message:'操作失败，请重试。'}finally{confirmBusy.value=false}}
const editor = ref<{ mode: 'new' | 'edit' | 'copy' | 'view'; row: Quotation; version:number } | null>(null)
function showQuotation(mode: 'new' | 'edit' | 'copy' | 'view', row?: Quotation) { editor.value={mode,version:repository.snapshot().version,row:row??{...createQuotationDraft(undefined,quotations.value),customer:String(currentSearch()?.getValue('customer')??'')}} }
async function saveRecord(row:Quotation){repository.commit(saveQuotation(quotations.value,row),editor.value?.version);await table.value?.reload()}
function copyQuotation(row:Quotation){showQuotation('copy',row)}
function deleteQuotations(rows: Quotation[]) {
  const expectedVersion=repository.snapshot().version;confirmationError.value=''
  confirmation.value = { title: '删除报价', text: `确定删除${rows.length === 1 ? `报价 ${rows[0]!.id}` : `选中的 ${rows.length} 条报价`}吗？删除后可通过备份恢复。`, danger: true, action: async () => { const ids = new Set(rows.map(row => row.id)); repository.commit(quotations.value.filter(row => !ids.has(row.id)),expectedVersion); table.value?.clearSelection(); await refresh(); toast('报价已删除') } }
}
function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type })), link = document.createElement('a')
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0)
}
const exportScope=ref<'query'|'selected'|null>(null),templateVisible=ref(false)
const exportFields=computed<ExportField[]>(()=>{const columns=table.value?.getState().columns??quotationColumns;return quotationTemplateDefinition.fields.map(field=>({...field,column:columns.find(column=>column.id===field.id)??{...field.column,visible:false}}))})
const exportGroups=computed<ExportGroup[]>(()=>[{id:'query',label:'全部查询结果',rows:filteredRows.value},{id:'page',label:'当前页',rows:filteredRows.value.slice((query.value.page-1)*query.value.pageSize,query.value.page*query.value.pageSize)},{id:'selected',label:'选中的报价',rows:selectedRows.value}])
const exportKey=tableKey+'.export-presets'
function exportPresets():unknown{try{return localStorage.getItem(exportKey)}catch{return []}}
function saveExportPresets(presets:ExportPreset[]){localStorage.setItem(exportKey,JSON.stringify(presets))}
async function exportRecord(row:Quotation,format:'xlsx'|'csv'){
  try{const fields=exportFields.value,options=normalizeExportOptions({format},fields),book=buildExportBook([row],fields,options,{scope:'当前报价'})
    if(format==='xlsx'){const {writeXlsx,xlsxMime}=await import('../src/features/export/xlsx');downloadExport(writeXlsx(book),row.id+'.xlsx',xlsxMime)}
    else downloadExport(exportCSV(book),row.id+'.csv','text/csv;charset=utf-8')
    toast('已导出 1 条报价')
  }catch(cause){toast(cause instanceof Error?cause.message:'导出失败，请重试。')}
}
function backup(rows = quotations.value, name = '报价数据备份') { download(`${name}.json`, serializeQuotationBackup(rows), 'application/json') }
async function selectQuery(){try{await table.value?.selectQuery()}catch(cause){toast(cause instanceof Error?cause.message:'选择失败，请重试。')}}
async function copyId(row: Quotation) { try { await navigator.clipboard.writeText(row.id); toast('报价编号已复制') } catch { toast('浏览器未允许复制，请从报价详情中复制编号。') } }
const restoreInput = ref<HTMLInputElement>()
async function restoreBackup(event: Event) {
  const target = event.target as HTMLInputElement, file = target.files?.[0]; target.value = ''; if (!file) return
  try { const rows = parseQuotationBackup(await file.text()),expectedVersion=repository.snapshot().version; confirmationError.value='';confirmation.value = { title: '恢复报价备份', text: `备份中有 ${rows.length} 条报价。恢复后将替换当前数据，请确认已备份。`, action: async () => { repository.commit(rows,expectedVersion); table.value?.clearSelection(); await resetSearch(); toast('报价备份已恢复') } } }
  catch (error) { toast(error instanceof Error ? error.message : '无法读取备份') }
}
function resetExamples() { const expectedVersion=repository.snapshot().version;confirmationError.value='';confirmation.value = { title: '恢复示例数据', text: '将用初始示例替换当前报价数据。继续前请确认已备份。', action: async () => { repository.commit(makeExampleQuotations(),expectedVersion); table.value?.clearSelection(); await refresh(); toast('示例数据已恢复') } } }
const helpVisible = ref(false)
const tools = computed<{ page: ToolDefinition[]; table: ToolDefinition[] }>(() => ({
  page: [
    { id: 'template', label: '模板下载', icon: 'file', handler:()=>{templateVisible.value=true} },
    { id: 'export', label: '导出', icon: 'download', handler: () => {exportScope.value='query'} },
    { id: 'add', label: '新增报价', icon: 'plus', variant: 'primary', fixed: true, handler: () => showQuotation('new') },
    { id: 'backup', label: '备份报价数据（JSON）', icon: 'download', position: 'more', handler: () => backup() },
    { id: 'restore', label: '恢复报价备份', icon: 'upload', position: 'more', handler: () => restoreInput.value?.click() },
    { id: 'examples', label: '恢复示例数据', icon: 'refresh', position: 'more', separator: true, handler: resetExamples },
    { id: 'help', label: '使用说明', icon: 'info', position: 'more', handler: () => { helpVisible.value = true } },
  ],
  table: [
    { id: 'selection', label: '批量操作', icon: 'batch', display: 'icon', active: selectionVisible.value, handler: () => { selectionVisible.value = !selectionVisible.value; table.value?.clearSelection() } },
    { id: 'search', label: '查询条件', icon: 'search', display: 'icon', active: searchVisible.value, handler: () => { searchVisible.value = !searchVisible.value } },
    { id: 'reload', label: '刷新', icon: 'refresh', separator:true, display: 'icon', handler: refresh },
    { id: 'density', label: '行高密度', icon: 'density', display: 'icon', handler: event => densityMenu.value?.open(event) },
    { id: 'sort', label: '排序规则', icon: 'sort', display: 'icon', active: query.value.sorts.length > 0, handler: () => table.value?.openColumnSettings('drawer',undefined,'sorts') },
    {id:'columns',label:'列设置',icon:'columns',display:'icon',handler:()=>table.value?.openColumnSettings('quick')},
    {id:'settings',label:'表格设置',icon:'settings',immutable:true,handler:()=>table.value?.openColumnSettings('drawer')},
    {id:'data-tools',label:'数据工具',icon:'filter',display:'icon',children:[
      {id:'combined-filter',label:'组合筛选',icon:'filter',handler:()=>table.value?.openFilters()},
      {id:'conditional-formatting',label:'条件标记',icon:'info',handler:()=>table.value?.openDataTool('conditionalFormatting')},
      {id:'grouping',label:'分组汇总',icon:'density',handler:()=>table.value?.openDataTool('grouping')},
      {id:'compare',label:'记录对比',icon:'columns',handler:()=>table.value?.openDataTool('compare')},
      {id:'range-selection',label:table.value?.getFeatureContext('rangeSelection')?.enabled?'关闭区域选择':'开启区域选择',icon:'batch',handler:()=>table.value?.openDataTool('rangeSelection')},
      {id:'toolbar-settings',label:'工具栏设置',icon:'settings',separator:true,handler:()=>table.value?.openColumnSettings('drawer',undefined,'toolbar')},
    ]},
  ],
}))
const actions: Action<Quotation>[] = [
  { id: 'view', label: '查看', handler: row => showQuotation('view', row) }, { id: 'edit', label: '修改', handler: row => showQuotation('edit', row) },
  { id: 'copy', label: '复制为草稿', position: 'more', icon: 'copy', handler: copyQuotation }, { id: 'copy-id', label: '复制编号', position: 'more', icon: 'copy', handler: copyId },
  { id: 'export', label: '导出本条', position: 'more', icon: 'download', separator: true, children: [{ id:'export-xlsx',label:'Excel (.xlsx)',handler:row=>exportRecord(row,'xlsx') },{ id:'export-csv',label:'CSV',handler:row=>exportRecord(row,'csv') }] },
  { id: 'delete', label: '删除', position: 'more', icon: 'trash', danger: true, separator: true, handler: row => deleteQuotations([row]) },
]
onMounted(async () => { await nextTick(); if (viewsRuntime.activeId.value) await viewsRuntime.apply(viewsRuntime.activeId.value) })
onBeforeUnmount(() => { clearTimeout(toastTimer);repository.dispose() })
</script>

<template>
  <a class="q-skip-link" href="#quotation.demo.visual-viewport">跳到报价列表</a>
  <main class="quotation-page">
    <header class="q-page-header">
      <div><nav class="q-breadcrumb" aria-label="面包屑">销售管理 <span>/</span> 报价管理</nav><div class="q-title-row"><span class="q-page-symbol"><TableIcon name="file" :size="19"/></span><h1>报价管理</h1><span class="q-local-badge">{{repository.temporary.value?'临时模式':'本地演示'}}</span></div></div>
      <div class="q-header-actions">
        <button class="q-user q-quiet" type="button" title="使用说明" @click="helpVisible = true"><span class="q-avatar">林</span><span>林予安</span><TableIcon name="info" :size="14"/></button>
        <ToolStrip overflow="wrap" :tools="tools.page" :layout="toolbarLayout.page" :gap="toolbarLayout.gap" more-label="更多页面操作" button-class="q-btn" icon-button-class="q-icon-btn" menu-class="q-popup q-page-menu" style="--bt-tool-menu-width:250px" />
      </div>
    </header>

    <BusinessTable ref="table" class="q-main-card" title="报价列表" :features="features" query-summary :settings-definition="settingsDefinition" :tools="tools" :search-definition="searchDefinition" :conditional-formatting="quotationConditionalFormatting" :grouping="quotationGrouping" :compare="quotationCompare" :range-selection="quotationRangeSelection" :table-key="tableKey" row-key="id" :columns="quotationColumns" :data-source="source" :persistence="persistence" :actions="actions" :selection="selectionVisible" :fill="true" :density="density" :pagination="{ pageSize: 10, pageSizeOptions: [10, 25, 50, 100] }" @query-change="query = $event" @selection-change="selectedRows = $event" @cell-action="event=>event.action==='open'&&showQuotation('view',event.row)">
      <template #before="{ search: searchContext }">
        <div v-if="repository.externalChanged.value" class="q-storage-notice" role="status">数据已在其他页面更新。<button class="q-link" @click="refresh">刷新列表</button></div>
        <form v-if="searchVisible && searchContext" class="q-search-panel" aria-label="报价查询" @submit.prevent="submitSearch">
          <div class="q-search-grid">
            <div class="q-search-field"><label for="quotation-keyword">关键词</label><div class="q-input-icon"><TableIcon name="search"/><input id="quotation-keyword" :value="searchContext.getValue('keyword') ?? ''" type="search" maxlength="100" placeholder="报价编号 / 项目 / 客户" autocomplete="off" @input="changeSearch('keyword', $event)"/></div></div>
            <div class="q-search-field"><label for="quotation-customer">客户</label><select id="quotation-customer" :value="searchContext.getValue('customer') ?? ''" @change="changeSearch('customer', $event)"><option value="">全部客户</option><option v-for="customer in customers" :key="customer">{{ customer }}</option></select></div>
            <div class="q-search-field"><label for="quotation-status">状态</label><select id="quotation-status" :value="searchContext.getValue('status') ?? ''" @change="changeSearch('status', $event)"><option value="">全部状态</option><option v-for="option in searchContext.items.find(item=>item.id==='status')?.options??[]" :key="String(option.value)" :value="option.value">{{ option.label }}</option></select></div>
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
        <div v-if="!selectedRows.length" class="q-table-title"><h2>报价列表</h2><span class="q-toolbar-divider" aria-hidden="true"/><ViewsPanel :runtime="viewsRuntime" :snapshot="viewSnapshot" :modified="viewModified" :pending="queryPending" @notice="toast" @committed="viewCommitted" @require-apply="focusSearch"/><span v-if="viewModified" class="q-modified">未保存</span><span class="q-count">{{ rowCount }}</span></div><div v-else class="q-selection"><span>已选 <strong>{{ selectedRows.length }}</strong> 条</span><button class="q-link" @click="selectQuery">选择全部 {{ rowCount }} 条</button><span class="q-toolbar-divider"/><button class="q-link" @click="exportScope='selected'">导出所选</button><button class="q-link q-danger" @click="deleteQuotations(selectedRows)">删除</button><button class="q-link" @click="table?.clearSelection()">取消选择</button></div>
      </template>
      <template #toolbar-end>
        <ToolStrip overflow="wrap" size="small" :tools="tools.table" :layout="toolbarLayout.table" :gap="toolbarLayout.gap" more-label="更多表格工具" button-class="q-btn" icon-button-class="q-icon-btn">
          <template #tool-density="{tool,inMenu}"><DensityMenu ref="densityMenu" :tool="tool" :in-menu="inMenu" :value="table?.getRuntime().presentation.value.appearance.density??density" @change="setDensity"/></template>
        </ToolStrip>
      </template>

      <template #summary="{ total, page, pageSize }"><div class="q-result-summary"><span>共 {{ total }} 条 · 第 {{ total ? (page - 1) * pageSize + 1 : 0 }}–{{ Math.min(page * pageSize, total) }} 条</span><span class="q-summary-divider">·</span><span>{{selectedRows.length?'所选合计':'筛选合计'}}</span><strong>¥ {{ money(selectedRows.length?selectedAmount:totalAmount) }}</strong></div></template>
    </BusinessTable>

    <footer class="q-page-note"><span>数据仅保存在当前浏览器，不会提交到服务器。</span><span>金额单位：人民币元</span></footer>
    <input ref="restoreInput" class="q-hidden" type="file" accept=".json,application/json" aria-label="恢复报价备份文件" @change="restoreBackup"/>
    <Transition name="q-toast"><div v-if="message" class="q-toast" role="status"><TableIcon name="check"/><span>{{ message }}</span><button class="q-icon-btn" aria-label="关闭提示" @click="message = ''"><TableIcon name="close"/></button></div></Transition>
    <ExportDialog v-if="exportScope" title="导出报价" filename="报价清单" :fields="exportFields" :appearance="table?.getRuntime().presentation.value.appearance" :groups="exportGroups" :initial-scope="exportScope" :presets="exportPresets()" :save-presets="saveExportPresets" :conditions="currentSearch()?.summaryItems.map(item=>`${item.label}：${item.displayValue}`)" raw-value-label="原值（金额仍以元输出）" @close="exportScope=null" @complete="count=>toast(`已导出 ${count} 条报价`)"/>
    <TemplateDownloadDialog v-if="templateVisible" :definition="quotationTemplateDefinition" filename="报价导入模板" @close="templateVisible=false" @complete="toast('模板已下载')"/>
    <QuotationRecordDialog v-if="editor" :mode="editor.mode" :row="editor.row" :rows="quotations" :save="saveRecord" @close="editor=null" @saved="toast('报价已保存')"/>
    <DialogFrame class="q-info-dialog" v-if="confirmation" :title="confirmation.title" :busy="confirmBusy" @close="confirmation = null"><p class="q-confirm-text">{{ confirmation.text }}</p><p v-if="confirmationError" class="bt-ui-error" role="alert">{{confirmationError}}</p><template #footer><button class="bt-ui-button" :disabled="confirmBusy" @click="confirmation = null">取消</button><button class="bt-ui-button" :disabled="confirmBusy" :class="confirmation.danger ? 'danger' : 'primary'" @click="confirmAction">确定</button></template></DialogFrame>
    <DialogFrame v-if="helpVisible" class="q-info-dialog" title="使用说明" subtitle="报价管理 · 本地演示" @close="helpVisible = false"><div class="q-help"><p>数据范围：页面使用原型中的 6 条示例报价。新增、修改和删除只作用于当前浏览器，没有连接业务服务器。</p><p>查询与选择：修改条件后点击查询或按 Enter。翻页保留选择；查询和切换视图会清空选择。表头全选只选当前页。</p><p>视图与表格：视图保存查询、列名与样式、多字段排序、操作按钮和表格外观。完整设置有独立预览，点击应用才生效；表头边缘可拖动调整宽度。</p><p>本地保存：建议通过固定本地地址打开。清除浏览器数据、更换浏览器或移动单文件可能无法找到原记录，重要内容请导出 JSON 备份。</p><p>快捷操作：在非输入区域按 / 定位查询框；编辑时 Ctrl / ⌘ + Enter 保存，Esc 关闭窗口。</p></div><template #footer><button class="bt-ui-button primary" @click="helpVisible = false">知道了</button></template></DialogFrame>
  </main>
</template>
