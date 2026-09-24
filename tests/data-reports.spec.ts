import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { ColumnConfig, RowData } from '../src/types'
import { buildComparison, groupRecords, normalizeCompareDefinition, normalizeGroupingDefinition, summarizeNumbers } from '../src/features/reports/model'
import { createReportsContext, type ReportsSource } from '../src/features/reports/context'
import { comparisonBook, groupingBook } from '../src/features/reports/export'

const columns: ColumnConfig[] = [
  { id: 'code', field: 'code', title: '编号' },
  { id: 'category', field: 'category', title: '类别', mapping: { enabled: true, type: 'text', presentation: 'text', empty: '未填写', unknown: '其他', items: [{ value: 1, label: '甲' }, { value: '1', label: '乙' }] } },
  { id: 'region', field: 'region', title: '区域', visible: false },
  { id: 'cost', field: 'totals.cost', title: '费用', type: 'number', numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
  { id: 'actions', field: 'actions', title: '操作', kind: 'actions' },
]
const rows: RowData[] = [
  { code: 'B', category: 1, region: '西', totals: { cost: '0.1' } },
  { code: 'A', category: '1', region: '东', totals: { cost: '0.2' } },
  { code: 'C', category: 1, region: '东', totals: { cost: '9007199254740993.333' } },
]
const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

describe('typed read-only data report models', () => {
  it('sums raw decimals exactly, skips nonnumeric values and rounds averages to at most 20 places', () => {
    expect(summarizeNumbers(['0.1', '0.2', false, null, '', 'bad'])).toEqual({ count: 2, sum: '0.3', average: '0.15', min: '0.1', max: '0.2' })
    expect(summarizeNumbers(['9007199254740993.333', '-0.333'])).toMatchObject({ sum: '9007199254740993', min: '-0.333', max: '9007199254740993.333' })
    expect(summarizeNumbers([1, 0, 0])?.average).toBe('0.33333333333333333333')
    expect(summarizeNumbers([-1, 0, 0])?.average).toBe('-0.33333333333333333333')
    expect(summarizeNumbers([null, undefined, NaN, Infinity, false, ''])).toBeUndefined()
  })
  it('normalizes explicit invalid declarations locally without replacing an empty allowlist with defaults', () => {
    const value = normalizeGroupingDefinition({ groupColumns: ['missing', 'actions', 'category', 'category'], defaultGroups: ['missing', 'category', 'category'], detailColumns: [{ columnId: 'missing' }, { columnId: 'code' }], summaryColumns: [{ columnId: 'cost' }, { columnId: 'category' }] }, columns)
    expect(value.groupColumns).toEqual(['category']); expect(value.defaultGroups).toEqual(['category'])
    expect(value.detailColumns.map(field => field.columnId)).toEqual(['code'])
    expect(value.summaryColumns.map(field => field.columnId)).toEqual(['cost'])
    expect(normalizeGroupingDefinition({ groupColumns: ['missing'] }, columns).groupColumns).toEqual([])
    expect(normalizeGroupingDefinition(undefined, columns).groupColumns).toContain('region')
    expect(normalizeCompareDefinition({ searchColumns: [], labelColumns: ['actions'], recordLabelColumn: 'missing' }, columns)).toMatchObject({ searchColumns: [], labelColumns: [], recordLabelColumn: '' })
  })
  it('groups typed raw values in query order, including hidden declared grouping fields and exact nested totals', () => {
    const definition = normalizeGroupingDefinition({ groupColumns: ['category', 'region'], defaultGroups: ['category', 'region'], detailColumns: [{ columnId: 'code' }], summaryColumns: [{ columnId: 'cost', label: '费用合计' }] }, columns)
    const groups = groupRecords(rows, columns, definition, definition.defaultGroups)
    expect(groups.map(group => [group.value, group.label, group.count])).toEqual([[1, '类别：甲', 2], ['1', '类别：乙', 1]])
    expect(groups[0]?.children.map(group => group.value)).toEqual(['西', '东'])
    expect(groups[0]?.summaries[0]?.sum).toBe('9007199254740993.433')
    expect(rows.map(row => row.code)).toEqual(['B', 'A', 'C'])
    const book = groupingBook(groups, definition)
    expect(book.sheets[0]?.rows).toHaveLength(4)
    expect(book.sheets[0]?.rows[1]?.[0]?.text).toBe('类别：甲 / 区域：西')
    expect(book.sheets[0]?.rows[2]?.[2]?.value).toBe('9007199254740993.333')
  })
  it('compares current visible fields using typed raw equality while preserving query order after the baseline', () => {
    const definition = normalizeCompareDefinition({ searchColumns: ['code'], labelColumns: ['code'], recordLabelColumn: 'code', differenceColumns: [{ columnId: 'cost', label: '与基准费用差' }] }, columns)
    const result = buildComparison(rows, columns, definition, ['C', 'A', 'B'], 'A', true, row => String(row.code))
    expect(result.headers).toEqual(['字段', 'A（基准）', 'B', 'C'])
    expect(result.rows.map(row => row[0]?.text)).toEqual(['编号', '类别', '费用', '与基准费用差'])
    expect(result.rows[1]?.map(cell => cell.text)).toEqual(['类别', '乙', '甲', '甲'])
    expect(result.rows.at(-1)?.[2]?.text).toBe('-0.10')
    expect(comparisonBook(result).sheets[0]?.rows[0]?.map(cell => cell.text)).toEqual(result.headers)
    expect(comparisonBook(result).sheets[0]?.rows[2]?.[1]?.value).toBe('乙')
    const hidden = columns.map(column => column.id === 'cost' ? { ...column, visible: false } : column)
    expect(buildComparison(rows, hidden, definition, ['A', 'B'], 'A', false, row => String(row.code)).rows.map(row => row[0]?.text)).not.toContain('与基准费用差')
  })
  it('keeps configured numeric differences even when all records are equal and only differences is enabled', () => {
    const definition = normalizeCompareDefinition({ differenceColumns: [{ columnId: 'cost' }] }, columns)
    const same = [rows[0]!, { ...rows[0], code: 'D' }]
    const result = buildComparison(same, columns, definition, ['B', 'D'], 'B', true, row => String(row.code))
    expect(result.rows.map(row => row[0]?.text)).toEqual(['编号', '与基准费用差'])
    expect(result.rows.at(-1)?.[2]?.text).toBe('0.00')
  })
})

describe('report read lifecycle', () => {
  function setup(readRows: ReportsSource['readRows']) {
    const identity = ref({ version: 1 }), currentColumns = ref(columns), definition = ref({ groupColumns: ['category'] }), disabled = ref(false)
    const disposers: (() => void)[] = [], close = vi.fn(), active = ref(true)
    const source: ReportsSource = { filterOptionsIdentity: identity, allResolvedColumns: currentColumns, readRows, rowId: row => String(row.code), getSelectedRows: () => [rows[2]!, rows[0]!] }
    const scope = effectScope(); scopes.push(scope)
    const context = scope.run(() => createReportsContext(source, () => definition.value, { close, isActive: () => active.value, isDisabled: () => disabled.value, onDispose: fn => disposers.push(fn) }))!
    return { context, identity, currentColumns, definition, disabled, disposers, close, active }
  }
  it('reads query scope on demand, aborts old requests and never publishes late closed results', async () => {
    const pending: { resolve: (rows: RowData[]) => void; signal?: AbortSignal }[] = []
    const read = vi.fn((_scope: 'query', signal?: AbortSignal) => new Promise<RowData[]>(resolve => pending.push({ resolve, signal })))
    const { context, identity, close } = setup(read)
    expect(read).not.toHaveBeenCalled()
    const first = context.reload(); expect(read).toHaveBeenCalledWith('query', expect.any(AbortSignal))
    identity.value = { version: 2 }; await nextTick()
    expect(pending[0]?.signal?.aborted).toBe(true); expect(pending).toHaveLength(2)
    pending[0]!.resolve(rows); await first; expect(context.rows).toEqual([])
    pending[1]!.resolve([rows[1]!]); await nextTick(); await nextTick(); expect(context.rows.map(row => row.code)).toEqual(['A'])
    const last = context.reload(); context.close(); expect(close).toHaveBeenCalledOnce(); expect(pending[2]?.signal?.aborted).toBe(true)
    pending[2]!.resolve(rows); await last; expect(context.rows).toEqual([])
    identity.value = { version: 3 }; await nextTick(); expect(read).toHaveBeenCalledTimes(3)
  })
  it('reads current definitions and readonly state, reports failures and can retry without leaking table selection', async () => {
    const read = vi.fn<ReportsSource['readRows']>().mockRejectedValueOnce(new Error('未提供完整查询数据')).mockResolvedValue(rows)
    const { context, definition, disabled, disposers, active } = setup(read)
    await context.reload(); expect(context.error).toBe('未提供完整查询数据'); expect(context.loading).toBe(false)
    await context.reload(); expect(context.rows).toHaveLength(3); expect(context.selectedIds).toEqual(['C', 'B'])
    definition.value = { groupColumns: ['region'] }; disabled.value = true; await nextTick()
    expect(context.definition.groupColumns).toEqual(['region']); expect(context.disabled).toBe(true)
    active.value = false; disposers.forEach(dispose => dispose()); await context.reload()
    expect(context.rows).toEqual([]); expect(read).toHaveBeenCalledTimes(3)
  })
})
