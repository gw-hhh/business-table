import { describe, expect, it } from 'vitest'
import {
  createQuotationDraft, filterQuotations, makeQuotationQuery, parseQuotationBackup,
  saveQuotation, serializeQuotationBackup, updateSavedView, makeExampleQuotations, parseQuotationViews,
} from '../demo/quotation/model'

describe('quotation demo product interactions', () => {
  it('defaults new validity to thirty days and rejects fractional cents or reversed dates',()=>{
    const rows=makeExampleQuotations(),draft=createQuotationDraft(undefined,rows,new Date('2026-09-23T08:00:00Z'))
    expect(draft.date).toBe('2026-10-23')
    expect(()=>saveQuotation(rows,{...rows[0]!,amount:1.234})).toThrow('两位小数')
    expect(()=>saveQuotation(rows,{...rows[0]!,date:'2026-09-01'})).toThrow('有效期')
  })
  it('combines keyword, customer, owner and inclusive creation dates before pagination', () => {
    const rows = makeExampleQuotations()
    const query = makeQuotationQuery({ keyword: '计量', customer: '澄川水务', status: '', region: '', owner: '林予安', from: '2026-09-14', to: '2026-09-14' })
    expect(filterQuotations(rows, { ...query, page: 1, pageSize: 100 }).map(row => row.id)).toEqual(['Q20260914-0001'])
    expect(filterQuotations(rows, { ...query, page: 1, pageSize: 100, filters: [...query.filters, {field: 'createdAt', operator: 'lt', value: '2026-09-14'}] })).toEqual([])
  })

  it('copies a quotation as a distinct draft without mutating the source', () => {
    const rows = makeExampleQuotations()
    const original = rows.find(row => row.id === 'Q20260914-0121')!
    const copy = createQuotationDraft(original, rows, new Date('2026-09-21T08:00:00Z'))
    expect(copy.id).toBe('Q20260921-0001')
    expect(copy.status).toBe('草稿')
    expect(copy.name).toBe('工艺车间传感器改造 · 121（副本）')
    expect(original.status).toBe('已转合同')
    expect(original.name).toBe('工艺车间传感器改造 · 121')
  })

  it('rejects incomplete edits and saves valid edits without changing another row', () => {
    const rows = makeExampleQuotations()
    expect(() => saveQuotation(rows, { ...rows[0]!, customer: '  ' })).toThrow('请填写客户')
    expect(() => saveQuotation(rows, { ...rows[0]!, amount: -1 })).toThrow('金额不能小于 0')
    const saved = saveQuotation(rows, { ...rows[0]!, name: ' 新的项目名称 ', amount: 1 })
    expect(saved[0]!.name).toBe('新的项目名称')
    expect(saved[0]!.amount).toBe(1)
    expect(saved[1]).toEqual(rows[1])
    expect(rows[0]!.amount).toBe(63860)
  })

  it('round trips a backup and rejects broken or duplicate records before replacing data', () => {
    const rows = makeExampleQuotations()
    expect(parseQuotationBackup(serializeQuotationBackup(rows))).toEqual(rows)
    expect(() => parseQuotationBackup(JSON.stringify({ kind: 'quotation-demo', version: 1, rows: [{ ...rows[0]!, amount: 'bad' }] }))).toThrow()
    expect(() => parseQuotationBackup(JSON.stringify({ kind: 'quotation-demo', version: 1, rows: [rows[0], rows[0]] }))).toThrow('报价编号重复')
  })

  it('updates the chosen view query as an independent snapshot and keeps other views', () => {
    const query = makeQuotationQuery({ keyword: '', customer: '澄川水务', status: '', region: '', owner: '', from: '', to: '' })
    const views = [{ id: 'all', name: '全部报价', filters: [] }, { id: 'customer', name: '客户专属', filters: [] }]
    const result = updateSavedView(views, 'customer', { ...query, columns: { name: { width: 264 } } })
    query.filters[0]!.value = '其它客户'
    expect(result[1]!.filters).toEqual([{ field: 'customer', operator: 'eq', value: '澄川水务' }])
    expect(result[1]!.columns).toEqual({ name: { width: 264 } })
    expect(result[0]).toEqual(views[0])
    expect(views[1]!.filters).toEqual([])
  })

  it('uses the shared view codec for column and nested group filters without losing the original search', () => {
    const original = [{ id: 'complex', name: '组合视图', keyword: '', filters: [{ field: 'customer', operator: 'eq', value: '澄川水务' }], sorts: [],
      columnFilters: [{ field: 'amount', operator: 'between', value: [70000, 250000], unitFactor: 1 }],
      filterGroup: { logic: 'or', rules: [{ field: 'name', operator: 'starts', value: '化学' }, { logic: 'and', rules: [{ field: 'status', operator: 'in', value: ['已转合同'] }] }] } }]
    expect(parseQuotationViews(JSON.stringify(original))).toEqual(original)
    const invalid = [{ ...original[0], filterGroup: { logic: 'or', rules: [{ field: 'name', operator: 'eval', value: 'x' }] } }]
    expect(() => parseQuotationViews(JSON.stringify(invalid))).toThrow()
  })
  it('rejects damaged saved views before a nested filter can crash the page', () => {
    const views = [{ id: 'customer', name: '客户专属', filters: [{ field: 'customer', operator: 'eq', value: '澄川水务' }], sorts: [{ field: 'id', order: 'desc' }] }]
    expect(parseQuotationViews(JSON.stringify(views))).toEqual(views)
    expect(() => parseQuotationViews(JSON.stringify([{ ...views[0], filters: [null] }]))).toThrow()
    expect(() => parseQuotationViews(JSON.stringify([{ ...views[0], sorts: [{ field: 'id', order: 'wrong' }] }]))).toThrow()
    expect(() => parseQuotationViews(JSON.stringify([views[0], views[0]]))).toThrow()
  })
})
