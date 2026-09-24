import { applyFilters, applySorts } from '../../src/core'
import { compileFilterGroup } from '../../src/runtime/filter'
import { readViews, type ViewSnapshot } from '../../src/features/views/runtime'
import type { ColumnConfig, FilterConfig, Query, SortConfig, ViewConfig } from '../../src/types'
import type { SearchDefinition } from '../../src/features/search/model'
import { readRichDocument, type RichDocument } from '../../src/features/rich-text/document'
import type { TemplateDefinition, TemplateField } from '../../src/features/export/template'
import type { ConditionalFormattingDefinition } from '../../src/features/conditional-formatting/model'
import type { GroupingDefinition, CompareDefinition } from '../../src/features/reports/model'
import type { RangeSelectionDefinition } from '../../src/features/range-selection/context'

export interface Quotation extends Record<string, unknown> {
  id: string
  name: string
  customer: string
  amount: number
  status: string
  owner: string
  region: string
  date: string
  createdAt: string
  notes: string
  notesRich?: RichDocument
}
export interface QuotationSearch {
  keyword: string
  customer: string
  status: string
  region: string
  owner: string
  from: string
  to: string
}
export interface QuotationView extends ViewConfig { keyword?: string }
export const emptySearch = (): QuotationSearch => ({ keyword: '', customer: '', status: '', region: '', owner: '', from: '', to: '' })
export const quotationStatuses = ['草稿', '评审中', '已转合同']
export const quotationRegions = ['华东', '华北', '华南', '华中', '西南', '西北', '东北']
export function quotationSearchDefinition(rows: Quotation[]): SearchDefinition {
  const options = (field: 'customer' | 'owner' | 'region') => [...new Set(rows.map(row => row[field]))].map(value => ({ value, label: value }))
  return { resetBehavior: 'default', items: [
    { id: 'keyword', label: '关键词', kind: 'keyword', defaultValue: '', placeholder: '报价编号 / 项目 / 客户' },
    { id: 'customer', label: '客户', kind: 'select', field: 'customer', operator: 'eq', defaultValue: null, options: options('customer') },
    { id: 'status', label: '状态', kind: 'select', field: 'status', operator: 'eq', defaultValue: null, options: [...[...new Set([...quotationStatuses,...rows.map(row=>row.status)])].map(value => ({ value, label: value })),{value:'open',label:'未结（草稿 / 评审中）',filters:[{field:'status',operator:'in',value:['草稿','评审中']}]}] },
    { id: 'region', label: '大区', kind: 'select', field: 'region', operator: 'eq', defaultValue: null, advanced: true, options: [...new Set([...quotationRegions,...rows.map(row=>row.region)])].map(value=>({value,label:value})) },
    { id: 'owner', label: '负责人', kind: 'select', field: 'owner', operator: 'eq', defaultValue: null, advanced: true, options: options('owner') },
    { id: 'from', label: '创建开始日期', kind: 'date', field: 'createdAt', operator: 'gte', advanced: true, defaultValue: '' },
    { id: 'to', label: '创建结束日期', kind: 'date', field: 'createdAt', operator: 'lte', advanced: true, defaultValue: '' },
  ] }
}
export function makeExampleQuotations(): Quotation[] {
  return [
    { id: 'Q20260914-0001', name: '二期计量系统改造 · 001', customer: '澄川水务', amount: 63860, status: '草稿', owner: '林予安', region: '华东', date: '2026-11-02', createdAt: '2026-09-14', notes: '' },
    { id: 'Q20260914-0181', name: '化学品储罐监测 · 181', customer: '澄川水务', amount: 237450, status: '草稿', owner: '林予安', region: '华东', date: '2026-11-02', createdAt: '2026-09-14', notes: '' },
    { id: 'Q20260914-0121', name: '工艺车间传感器改造 · 121', customer: '澄川水务', amount: 75200, status: '已转合同', owner: '林予安', region: '华东', date: '2026-12-02', createdAt: '2026-09-14', notes: '' },
    { id: 'Q20260912-0051', name: '生产线测量点升级 · 051', customer: '泽临管道', amount: 231540, status: '评审中', owner: '陈景行', region: '华北', date: '2026-12-22', createdAt: '2026-09-12', notes: '' },
    { id: 'Q20260912-0013', name: '储罐安全网监测 · 013', customer: '林越科技', amount: 229350, status: '已转合同', owner: '纪远', region: '华南', date: '2026-11-14', createdAt: '2026-09-12', notes: '' },
    { id: 'Q20260912-0002', name: '智能水厂仪表配置 · 002', customer: '临溪能源', amount: 189050, status: '草稿', owner: '周子衡', region: '华东', date: '2026-11-03', createdAt: '2026-09-12', notes: '' },
  ]
}
const baseQuotationColumns: ColumnConfig<Quotation>[] = [
  { id: 'id', field: 'id', title: '报价编号', width: 194, minWidth: 170, fixed: 'left', sortable: true,content:{link:true,copyable:true} },
  { id: 'name', field: 'name', grow: 1, title: '项目名称 / 客户', minWidth: 180, width: 280, sortable: true,content:{showSecondary:true,secondaryField:'customer',copyable:true} },
  { id: 'customer', field: 'customer', type: 'enum', title: '客户', visible: false, width: 180 },
  { id: 'amount', field: 'amount', title: '含税金额（元）', type: 'number', width: 180, minWidth: 138, align: 'right', sortable: true, numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true },
    filter: { enabled: true, type: 'number', source: 'data', search: true, counts: true, inputUnit: '元', operators: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'notEmpty'], options: [] } },
  { id: 'status', field: 'status', type: 'enum', title: '状态', width: 112, minWidth: 102, sortable: true,mapping:{enabled:true,type:'text',presentation:'tag',empty:'—',unknown:'未匹配',items:[
    {value:'草稿',label:'草稿',color:'#526177',background:'#f0f2f6'},
    {value:'评审中',label:'评审中',color:'#245fbb',background:'#edf3ff'},
    {value:'已转合同',label:'已转合同',color:'#167457',background:'#eaf7f2'},
    {value:'已批准',label:'已批准',color:'#17875b',background:'#edf9f3'},
    {value:'已关闭',label:'已关闭',color:'#8b7085',background:'#f5f0f4'},
  ]} },
  { id: 'owner', field: 'owner', type: 'enum', title: '负责人', width: 120, sortable: true },
  { id: 'region', field: 'region', type: 'enum', title: '大区', visible: false, width: 140 },
  { id: 'date', field: 'date', type: 'date', title: '有效期至', width: 136, minWidth: 120, sortable: true },
  { id: 'createdAt', field: 'createdAt', type: 'date', title: '创建日期', visible: false, width: 140, sortable: true },
]
export const quotationColumns: ColumnConfig<Quotation>[] = baseQuotationColumns.map(column => ({ ...column, configurable: {
  visible: true, order: true, rename: true, align: true, width: true, fixed: true, sortable: true,
  headerStyle: true, cellStyle: true, content: true, format: true, mapping: true, template: true, filter: true, trial: true,
  ...(column.id === 'name' ? { width: { enabled: true, min: 180, max: 640 } } : {}),
} }))
export const quotationConditionalFormatting: ConditionalFormattingDefinition = {
  allowedColumns: quotationColumns.map(column => column.id), defaultColumn: 'amount', defaultRules: [],
}
export const quotationGrouping: GroupingDefinition = {
  groupColumns: ['customer', 'status', 'owner', 'region'], defaultGroups: ['customer'],
  detailColumns: [{ columnId: 'id', label: '报价编号' }, { columnId: 'name', label: '项目名称' }, { columnId: 'amount', label: '含税金额（元）', numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true } }],
  summaryColumns: [{ columnId: 'amount', label: '金额合计（元）', numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true, prefix: '¥ ' } }],
  countLabel: '报价笔数', recordUnit: '笔', exportName: '分组汇总',
}
export const quotationCompare: CompareDefinition = {
  searchColumns: ['id', 'name'], labelColumns: ['id', 'name'], recordLabelColumn: 'id',
  differenceColumns: [{ columnId: 'amount', label: '与基准金额差（元）', numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true } }],
  searchPlaceholder: '搜索编号 / 项目名称', recordName: '报价', exportName: '报价对比',
}
export const quotationRangeSelection: RangeSelectionDefinition = { summaryColumns: [{ columnId: 'amount', label: '金额' }] }
const templateHints:Record<string,string>={id:'必填；字母、数字、下划线、短横线，最多 64 字符。作为文本填写。',name:'必填，最多 100 个字符。',customer:'必填，最多 60 个字符。',amount:'必填，非负金额，最多两位小数，不超过 99999999999.99 元。',status:'必填：草稿、评审中或已转合同。',owner:'必填，最多 40 个字符。',region:'必填，使用下拉选项中的大区。',createdAt:'必填，YYYY-MM-DD，1900-01-01 至 9999-12-31。',date:'必填，YYYY-MM-DD，不能早于创建日期。',notes:'选填，最多 1000 个字符。'}
const templateOrder=['id','name','customer','amount','status','owner','region','createdAt','date','notes']
export const quotationTemplateDefinition:TemplateDefinition={
  fields:templateOrder.map(id=>{
    const source=baseQuotationColumns.find(column=>column.id===id)
    const column:ColumnConfig={id,field:id,title:id==='name'?'项目名称':source?.title??'备注',...(source?.type?{type:source.type}:{}),width:id==='name'?266:id==='notes'?280:source?.width??180}
    const field:TemplateField={id,label:column.title,column,hint:templateHints[id]??'',...(id==='amount'?{total:true}:{})}
    if(id==='status')field.choices=quotationStatuses
    if(id==='region')field.choices=quotationRegions
    return field
  }),
  examples:makeExampleQuotations().slice(0,1),
  notes:[['模板版本','报价字段 v1；金额以元填写，不使用个人表格别名。'],['填写范围','已预设 100 行格式；最多 10000 条。新增行请复制上一空白行格式。'],['使用提示','模板下载不等于数据导入；本版没有 Excel 导入入口。示例在独立工作表，不会写入数据填写区。']],
}
export function makeQuotationQuery(search: QuotationSearch): { keyword: string; filters: FilterConfig[]; sorts: SortConfig[] } {
  const filters: FilterConfig[] = []
  for (const field of ['customer', 'status', 'region', 'owner'] as const) {
    if (search[field]) filters.push({ field, operator: 'eq', value: search[field] })
  }
  if (search.from) filters.push({ field: 'createdAt', operator: 'gte', value: search.from })
  if (search.to) filters.push({ field: 'createdAt', operator: 'lte', value: search.to })
  return { keyword: search.keyword.trim(), filters, sorts: [{ field: 'id', order: 'desc' }] }
}
export function filterQuotations(rows: Quotation[], query: Query): Quotation[] {
  const keyword = query.keyword?.trim().toLocaleLowerCase()
  const searched = keyword ? rows.filter(row => [row.id, row.name, row.customer].some(value => value.toLocaleLowerCase().includes(keyword))) : rows
  return applySorts(applyFilters(applyFilters(searched, query.filters), query.columnFilters ?? []).filter(compileFilterGroup(query.filterGroup)), query.sorts, quotationColumns)
}

export function createQuotationDraft(source: Quotation | undefined, rows: Quotation[], now = new Date()): Quotation {
  const localDay=(value:Date)=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`
  const day = localDay(now),expires=new Date(now);expires.setDate(expires.getDate()+30)
  const prefix = `Q${day.replaceAll('-', '')}-`
  const max = Math.max(0, ...rows.filter(row => row.id.startsWith(prefix)).map(row => Number(row.id.slice(prefix.length)) || 0))
  return {
    id: `${prefix}${String(max + 1).padStart(4, '0')}`, name: source ? `${source.name.slice(0,95)}（副本）` : '',
    customer: source?.customer ?? '', amount: source?.amount ?? 0, status: '草稿', owner: source?.owner ?? '林予安',
    region: source?.region ?? '', date: source&&source.date>=day?source.date:localDay(expires), createdAt: day, notes: source?.notes ?? '',
    ...(source?.notesRich?{notesRich:readRichDocument(source.notesRich,{maxChars:1000})}:{}),
  }
}
export function normalizeQuotation(quotation: Quotation, strict=false): Quotation {
  for (const [field, title] of Object.entries({ id: '报价编号', name: '项目名称', customer: '客户', owner: '负责人', region: '大区', date: '有效期至', createdAt: '创建日期', status: '状态' })) {
    if (typeof quotation[field] !== 'string' || !String(quotation[field]).trim()) throw new Error(`请填写${title}`)
  }
  if (typeof quotation.amount !== 'number' || !Number.isFinite(quotation.amount)) throw new Error('请填写有效金额')
  if (quotation.amount < 0) throw new Error('金额不能小于 0')
  if (![...quotationStatuses,'已批准','已关闭'].includes(quotation.status)) throw new Error('报价状态无效')
  if(strict&&Math.abs(quotation.amount*100-Math.round(quotation.amount*100))>0.00001)throw new Error('金额最多保留两位小数')
  for (const field of ['date', 'createdAt'] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quotation[field]) || Number.isNaN(Date.parse(quotation[field]))) throw new Error('日期格式无效')
  }
  if(strict&&quotation.date<quotation.createdAt)throw new Error('有效期不能早于创建日期')
  if(strict&&(quotation.name.trim().length>100||quotation.customer.trim().length>60||quotation.owner.trim().length>40||(quotation.notes??'').length>1000))throw new Error('填写内容超出允许长度')
  return { id: quotation.id.trim(), name: quotation.name.trim(), customer: quotation.customer.trim(), amount: quotation.amount,
    status: quotation.status, owner: quotation.owner.trim(), region: quotation.region.trim(), date: quotation.date, createdAt: quotation.createdAt,
    notes: typeof quotation.notes === 'string' ? quotation.notes : '',...(quotation.notesRich?{notesRich:readRichDocument(quotation.notesRich,{maxChars:1000})}:{}) }
}
export function saveQuotation(rows: Quotation[], quotation: Quotation): Quotation[] {
  const normalized = normalizeQuotation(quotation,true)
  return rows.some(row => row.id === normalized.id) ? rows.map(row => row.id === normalized.id ? normalized : row) : [normalized, ...rows]
}
export function serializeQuotationBackup(rows: Quotation[]): string {
  return JSON.stringify({ kind: 'quotation-demo', version: 1, rows }, null, 2)
}
export function parseQuotationBackup(text: string): Quotation[] {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'quotation-demo' || !('version' in value) || value.version !== 1 || !('rows' in value) || !Array.isArray(value.rows)) throw new Error('请选择有效的报价备份文件')
  const ids = new Set<string>()
  return value.rows.map(row => {
    if (!row || typeof row !== 'object') throw new Error('备份中的报价记录无效')
    const normalized = normalizeQuotation(row as Quotation)
    if (ids.has(normalized.id)) throw new Error('报价编号重复')
    ids.add(normalized.id)
    return normalized
  })
}
export function updateSavedView(views: QuotationView[], id: string, snapshot: ViewSnapshot): QuotationView[] {
  return views.map(view => view.id === id ? { ...view, ...JSON.parse(JSON.stringify(snapshot)) } : view)
}
export function parseQuotationViews(text: string): QuotationView[] {
  const views = readViews(text, 'quotation.demo.visual')
  if (!views.length) throw new Error('视图数据无效')
  return views
}
