import type { ColumnConfig, FilterConfig, Query, SortConfig, UserColumnConfig, ViewConfig } from '../../src/types'

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
export const quotationStatuses = ['草稿', '评审中', '已批准', '已转合同', '已关闭']
export function makeExampleQuotations(): Quotation[] {
  return [
    { id: 'Q20260914-0181', name: '化学品储罐监测 · 181', customer: '澄川水务', amount: 237450, status: '草稿', owner: '林予安', region: '华东大区', date: '2026-11-02', createdAt: '2026-09-14', notes: '' },
    { id: 'Q20260914-0121', name: '工艺车间传感器改造 · 121', customer: '澄川水务', amount: 75200, status: '已转合同', owner: '林予安', region: '华东大区', date: '2026-12-02', createdAt: '2026-09-14', notes: '' },
    { id: 'Q20260914-0001', name: '二期计量系统改造 · 001', customer: '澄川水务', amount: 63860, status: '草稿', owner: '林予安', region: '华东大区', date: '2026-11-02', createdAt: '2026-09-14', notes: '' },
    { id: 'Q20260914-0003', name: '生产线测量点升级', customer: '泽临管道', amount: 231540, status: '评审中', owner: '陈景行', region: '华北大区', date: '2026-12-22', createdAt: '2026-09-14', notes: '' },
    { id: 'Q20260914-0004', name: '智能水厂仪表配置', customer: '临溪能源', amount: 189050, status: '已批准', owner: '周子衡', region: '华南大区', date: '2026-11-03', createdAt: '2026-09-15', notes: '' },
    { id: 'Q20260912-0013', name: '储罐安全网监测 · 013', customer: '林越科技', amount: 229350, status: '已转合同', owner: '纪远', region: '华中大区', date: '2026-11-14', createdAt: '2026-09-12', notes: '' },
  ]
}
export const quotationColumns: ColumnConfig<Quotation>[] = [
  { id: 'id', field: 'id', title: '报价编号', width: 316, fixed: 'left', sortable: true, configurable: { visible: false, order: true, rename: true, align: true, width: true, fixed: true, sortable: true, headerStyle: true, cellStyle: true } },
  { id: 'name', field: 'name', title: '项目名称 / 客户', minWidth: 264, sortable: true, configurable: { visible: true, order: true, rename: true, align: true, width: { enabled: true, min: 180, max: 640 }, fixed: true, sortable: true, headerStyle: true, cellStyle: true } },
  { id: 'customer', field: 'customer', title: '客户', visible: false, width: 180 },
  { id: 'amount', field: 'amount', title: '含税金额（元）', type: 'number', width: 138, align: 'right', sortable: true, numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true } },
  { id: 'status', field: 'status', title: '状态', width: 268, sortable: true },
  { id: 'owner', field: 'owner', title: '负责人', width: 120, sortable: true },
  { id: 'region', field: 'region', title: '大区', visible: false, width: 140 },
  { id: 'date', field: 'date', title: '有效期至', width: 138, sortable: true },
  { id: 'createdAt', field: 'createdAt', title: '创建日期', visible: false, width: 140, sortable: true },
]
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
  const result = rows.filter(row => (!keyword || [row.id, row.name, row.customer].some(value => value.toLocaleLowerCase().includes(keyword))) && query.filters.every(filter => {
    const value = row[filter.field]
    switch (filter.operator) {
      case 'eq': return value === filter.value
      case 'contains': return String(value ?? '').includes(String(filter.value ?? ''))
      case 'in': return Array.isArray(filter.value) && filter.value.includes(value)
      case 'gt': return String(value ?? '') > String(filter.value ?? '')
      case 'gte': return String(value ?? '') >= String(filter.value ?? '')
      case 'lt': return String(value ?? '') < String(filter.value ?? '')
      case 'lte': return String(value ?? '') <= String(filter.value ?? '')
    }
  }))
  return result.sort((a, b) => {
    for (const sort of query.sorts) {
      const first = a[sort.field] ?? '', second = b[sort.field] ?? ''
      const direction = sort.order === 'asc' ? 1 : -1
      if (first !== second) return (first < second ? -1 : 1) * direction
    }
    return 0
  })
}
export function createQuotationDraft(source: Quotation | undefined, rows: Quotation[], now = new Date()): Quotation {
  const day = now.toISOString().slice(0, 10)
  const prefix = `Q${day.replaceAll('-', '')}-`
  const max = Math.max(0, ...rows.filter(row => row.id.startsWith(prefix)).map(row => Number(row.id.slice(prefix.length)) || 0))
  return {
    id: `${prefix}${String(max + 1).padStart(4, '0')}`, name: source ? `${source.name}（副本）` : '',
    customer: source?.customer ?? '', amount: source?.amount ?? 0, status: '草稿', owner: source?.owner ?? '林予安',
    region: source?.region ?? '华东大区', date: source?.date ?? day, createdAt: day, notes: source?.notes ?? '',
  }
}
function normalizeQuotation(quotation: Quotation): Quotation {
  for (const [field, title] of Object.entries({ id: '报价编号', name: '项目名称', customer: '客户', owner: '负责人', region: '大区', date: '有效期至', createdAt: '创建日期', status: '状态' })) {
    if (typeof quotation[field] !== 'string' || !String(quotation[field]).trim()) throw new Error(`请填写${title}`)
  }
  if (typeof quotation.amount !== 'number' || !Number.isFinite(quotation.amount)) throw new Error('请填写有效金额')
  if (quotation.amount < 0) throw new Error('金额不能小于 0')
  if (!quotationStatuses.includes(quotation.status)) throw new Error('报价状态无效')
  for (const field of ['date', 'createdAt'] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quotation[field]) || Number.isNaN(Date.parse(quotation[field]))) throw new Error('日期格式无效')
  }
  return { id: quotation.id.trim(), name: quotation.name.trim(), customer: quotation.customer.trim(), amount: quotation.amount,
    status: quotation.status, owner: quotation.owner.trim(), region: quotation.region.trim(), date: quotation.date, createdAt: quotation.createdAt,
    notes: typeof quotation.notes === 'string' ? quotation.notes : '' }
}
export function saveQuotation(rows: Quotation[], quotation: Quotation): Quotation[] {
  const normalized = normalizeQuotation(quotation)
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
export function updateSavedView(views: QuotationView[], id: string, snapshot: { keyword?: string; filters: FilterConfig[]; sorts: SortConfig[]; columns?: Record<string, UserColumnConfig> }): QuotationView[] {
  return views.map(view => view.id === id ? { ...view, ...JSON.parse(JSON.stringify(snapshot)) } : view)
}
export function parseQuotationViews(text: string): QuotationView[] {
  const views: unknown = JSON.parse(text)
  const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  if (!Array.isArray(views) || !views.length || views.length > 50) throw new Error('视图数据无效')
  const ids = new Set<string>()
  for (const view of views) {
    if (!isObject(view) || typeof view.id !== 'string' || !view.id || typeof view.name !== 'string' || !view.name.trim() || (view.keyword !== undefined && typeof view.keyword !== 'string')) throw new Error('视图数据无效')
    if (ids.has(view.id)) throw new Error('视图编号重复')
    ids.add(view.id)
    if (!Array.isArray(view.filters) || view.filters.some(filter => !isObject(filter) || typeof filter.field !== 'string' || !['eq', 'contains', 'in', 'gt', 'gte', 'lt', 'lte'].includes(String(filter.operator)) || (filter.operator === 'in' && !Array.isArray(filter.value)))) throw new Error('视图查询条件无效')
    if (!Array.isArray(view.sorts) || view.sorts.some(sort => !isObject(sort) || typeof sort.field !== 'string' || !['asc', 'desc'].includes(String(sort.order)))) throw new Error('视图排序无效')
    if (view.columns !== undefined && (!isObject(view.columns) || Object.values(view.columns).some(column => !isObject(column)))) throw new Error('视图列设置无效')
  }
  return views as QuotationView[]
}
