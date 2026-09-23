import { describe, expect, it } from 'vitest'
import { createFilterDraft, parseFilterDraft, createFilterGroupDraft, parseFilterGroupDraft } from '../src/features/filters/editor'
import { createFilterPlans, createLocalFilterPlanPersistence } from '../src/features/filters/plans'
import { createFilterOptions } from '../src/features/filters/options'
import type { ColumnConfig, FilterConfig } from '../src/types'

const amount: ColumnConfig = { id: 'amount', field: 'amount', title: '金额', type: 'number', numberRule: { enabled: true, scale: 10000 } }
const date: ColumnConfig = { id: 'date', field: 'date', title: '日期', type: 'date' }
const enumColumn: ColumnConfig = { id: 'status', field: 'status', title: '状态', type: 'enum' }
const state = () => ({ columnFilters: [{ field: 'amount', operator: 'gte' as const, value: 10 }] })
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

describe('validated filter drafts', () => {
  it('captures the input scale and stores raw numeric conditions', () => {
    const draft = createFilterDraft(amount); draft.operator = 'gte'; draft.value = '12.5'
    expect(parseFilterDraft(draft, amount)).toEqual({ field: 'amount', operator: 'gte', value: 125000, unitFactor: 10000 })
    amount.numberRule!.scale = 1000
    expect(parseFilterDraft(draft, amount).value).toBe(125000)
    amount.numberRule!.scale = 10000
  })
  it('reopens the saved scale independently of later column formatting', () => {
    const saved: FilterConfig = { field: 'amount', operator: 'between', value: [10000, 25000], unitFactor: 10000 }
    const draft = createFilterDraft({ ...amount, numberRule: { enabled: true, scale: 1000 } }, saved)
    expect(draft.value).toBe('1'); expect(draft.to).toBe('2.5')
    expect(parseFilterDraft(draft, amount)).toEqual(saved)
  })
  it('makes percent ratio and percent source bases explicit', () => {
    const ratio: ColumnConfig = { id: 'ratio', field: 'ratio', title: '比例', type: 'percent' }
    const percent = { ...ratio, numberFormat: { style: 'percent' as const, percentBase: 'percent' as const } }
    const a = createFilterDraft(ratio); a.value = '10'
    const b = createFilterDraft(percent); b.value = '10'
    expect(parseFilterDraft(a, ratio).value).toBe(0.1)
    expect(parseFilterDraft(b, percent).value).toBe(10)
  })
  it.each(['', '  ', 'abc', 'Infinity', '1e999'])('rejects invalid numeric input %s', value => {
    const draft = createFilterDraft(amount); draft.value = value
    expect(() => parseFilterDraft(draft, amount)).toThrow()
  })
  it('rejects impossible dates and reversed inclusive ranges', () => {
    const draft = createFilterDraft(date); draft.value = '2026-02-30'
    expect(() => parseFilterDraft(draft, date)).toThrow('日期')
    draft.operator = 'between'; draft.value = '2026-09-23'; draft.to = '2026-09-22'
    expect(() => parseFilterDraft(draft, date)).toThrow('上限')
  })
  it('validates membership without string coercion and does not mutate the original query', () => {
    const saved: FilterConfig = { field: 'status', operator: 'in', value: [1, '1', false, null] }
    const draft = createFilterDraft(enumColumn, saved); draft.values.pop()
    expect(parseFilterDraft(draft, enumColumn).value).toEqual([1, '1', false])
    expect(saved.value).toEqual([1, '1', false, null])
    draft.values = []; expect(() => parseFilterDraft(draft, enumColumn)).toThrow('选择')
  })
  it('rejects fields or operators revoked while a draft was open', () => {
    const draft = createFilterDraft(amount); draft.value = '1'; draft.operator = 'gte'
    expect(() => parseFilterDraft(draft, { ...amount, filterable: false })).toThrow()
    expect(() => parseFilterDraft(draft, { ...amount, filter: { enabled: true, type: 'number', source: 'data', search: true, counts: true, operators: ['eq'], options: [] } })).toThrow()
  })
  it('serializes nested drafts without transient IDs and rejects empty child groups', () => {
    const source = { logic: 'and' as const, rules: [{ logic: 'or' as const, rules: [{ field: 'amount', operator: 'gt' as const, value: 100 }] }] }
    const draft = createFilterGroupDraft([amount], source)
    expect(parseFilterGroupDraft(draft, [amount])).toEqual(source)
    expect(JSON.stringify(parseFilterGroupDraft(draft, [amount]))).not.toContain('id')
    draft.rules.push({ id: 'empty', logic: 'and', rules: [] })
    expect(() => parseFilterGroupDraft(draft, [amount])).toThrow('条件组')
  })
})

describe('transactional filter plans', () => {
  it('persists typed snapshots, preserves top query independence and reloads by table key', async () => {
    const persistence = createLocalFilterPlanPersistence()
    const store = createFilterPlans('test.typed', persistence); await store.load()
    await store.save('常用条件', { columnFilters: [{ field: 'status', operator: 'in', value: [1, '1', null] }] })
    const restored = createFilterPlans('test.typed', persistence); await restored.load()
    expect(restored.plans.value[0]?.columnFilters[0]?.value).toEqual([1, '1', null])
    const other = createFilterPlans('test.other', persistence); await other.load()
    expect(other.plans.value).toEqual([])
    await restored.remove(restored.plans.value[0]!.id)
  })
  it('does not publish failed writes or lose the previous saved plan', async () => {
    const store = createFilterPlans('failure', { load: async () => null, save: async () => { throw new Error('磁盘已满') } })
    await expect(store.save('未保存', state())).rejects.toThrow('磁盘已满')
    expect(store.plans.value).toEqual([])
  })
  it('checks duplicate names inside the serialized write transaction', async () => {
    const store = createFilterPlans('duplicate', { load: async () => null, save: async () => {} })
    const results = await Promise.allSettled([store.save('相同', state()), store.save(' 相同 ', state())])
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect(store.plans.value).toHaveLength(1)
  })
  it('waits for the initial snapshot before a mutation so existing plans cannot be overwritten', async () => {
    const pending = deferred<unknown>()
    let saved: string[] | undefined
    const store = createFilterPlans('race', { load: () => pending.promise, save: async (_key, envelope) => { saved = envelope.plans.map(plan => plan.name) } })
    const load = store.load(), write = store.save('新方案', state())
    await Promise.resolve(); await Promise.resolve()
    expect(saved).toBeUndefined()
    pending.resolve({kind:'business-table-filter-plans',version:1,tableKey:'race',plans:[{id:'old',name:'原有方案',...state()}]})
    await load; await write
    expect(saved).toEqual(['原有方案', '新方案'])
    expect(store.plans.value.map(plan => plan.name)).toEqual(['原有方案', '新方案'])
    expect(store.loading.value).toBe(false)
  })
  it('does not overwrite unknown remote plans after their initial read fails', async () => {
    let stored = ['原有方案']
    const store = createFilterPlans('offline', { load: async () => { throw new Error('读取失败') }, save: async (_key, envelope) => { stored = envelope.plans.map(plan => plan.name) } })
    await expect(store.load()).rejects.toThrow('读取失败')
    await expect(store.save('新方案', state())).rejects.toThrow('读取失败')
    expect(stored).toEqual(['原有方案'])
    store.dispose()
  })
  it('rejects corrupt group payloads and foreign table envelopes', async () => {
    const store = createFilterPlans('a', { load: async () => ({ kind: 'business-table-filter-plans', version: 1, tableKey: 'b', plans: [] }), save: async () => {} })
    await expect(store.load()).rejects.toThrow('当前表格')
    await expect(store.save('无效', { columnFilters: [], filterGroup: { logic: 'or', rules: [{ field: 'amount', operator: 'eq', value: [1] }] } })).rejects.toThrow()
  })
  it('does not publish a save completing after disposal', async () => {
    const pending = deferred<void>(), started = deferred<void>()
    const store = createFilterPlans('closed', { load: async () => null, save: () => { started.resolve(); return pending.promise } })
    const save = store.save('旧会话', state()); await started.promise; store.dispose(); pending.resolve(); await save
    expect(store.plans.value).toEqual([])
  })
})

describe('filter option request lifecycle', () => {
  it('aborts previous requests and ignores late results even when the provider ignores abort', async () => {
    const a = deferred<{ value: number; label: string }[]>(), b = deferred<{ value: number; label: string }[]>()
    const signals: AbortSignal[] = []
    const options = createFilterOptions((search, signal) => { signals.push(signal); return search === 'a' ? a.promise : b.promise })
    const first = options.load('a'), second = options.load('b')
    b.resolve([{ value: 2, label: 'B' }]); await second
    a.resolve([{ value: 1, label: 'A' }]); await first
    expect(signals[0]?.aborted).toBe(true)
    expect(options.items.value.map(option => option.label)).toEqual(['B'])
    options.dispose()
  })
  it('reports failed options without clearing checked values or publishing after disposal', async () => {
    const options = createFilterOptions(async () => { throw new Error('选项接口离线') })
    await options.load(''); expect(options.error.value).toBe('选项接口离线'); expect(options.loading.value).toBe(false)
    options.dispose(); await options.load(''); expect(options.items.value).toEqual([])
  })
})
