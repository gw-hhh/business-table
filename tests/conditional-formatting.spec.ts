import { describe, expect, it } from 'vitest'
import type { ColumnConfig } from '../src/types'
import { createFilterDraft, parseFilterDraft } from '../src/features/filters/editor'
import {
  compileConditionalRules,
  conditionalColumn,
  guardConditionalRules,
  readConditionalRules,
  type ConditionalRule,
} from '../src/features/conditional-formatting/model'

const columns: ColumnConfig[] = [
  { id: 'name', field: 'name', title: '项目', type: 'text', filterable: false, filter: { enabled: false, type: 'text', source: 'data', search: false, counts: false, operators: ['eq'], options: [] } },
  { id: 'amount', field: 'amount', title: '金额', type: 'number', numberFormat: { style: 'decimal' }, numberRule: { enabled: true, style: 'decimal', scale: 1000 } },
  { id: 'status', field: 'status', title: '状态', type: 'enum' },
  { id: 'actions', field: 'actions', title: '操作', kind: 'actions' },
]
const rule = (overrides: Partial<ConditionalRule> = {}): ConditionalRule => ({
  id: 'large', condition: { field: 'amount', operator: 'gte', value: 200000 },
  enabled: true, label: '需复核', color: '#92400e', background: '#fffbeb', ...overrides,
})

describe('conditional formatting model', () => {
  it('reads absent rules as empty and rejects an invalid sibling atomically', () => {
    expect(readConditionalRules(undefined)).toEqual([])
    expect(() => readConditionalRules([rule(), rule({ id: 'bad', condition: { field: 'amount', operator: 'gte', value: NaN } })])).toThrow()
  })

  it('rejects unexpected persisted condition fields instead of silently accepting them', () => {
    expect(() => readConditionalRules([rule({ condition: {
      field: 'amount', operator: 'gte', value: 200000, injected: true,
    } as unknown as ConditionalRule['condition'] })])).toThrow()
  })

  it('rejects duplicate IDs, more than thirty rules, long labels and unsafe colors', () => {
    expect(() => readConditionalRules([rule(), rule()])).toThrow()
    expect(() => readConditionalRules(Array.from({ length: 31 }, (_, index) => rule({ id: `r${index}` })))).toThrow()
    expect(() => readConditionalRules([rule({ label: '标'.repeat(25) })])).toThrow()
    expect(() => readConditionalRules([rule({ background: 'red; background:url(evil)' })])).toThrow()
  })

  it('guards current fields and column-ID allowlist without using column filterability', () => {
    const nameRule = rule({ id: 'name-mark', condition: { field: 'name', operator: 'contains', value: '水务' } })
    expect(guardConditionalRules([nameRule], columns, ['name'])).toHaveLength(1)
    expect(() => guardConditionalRules([nameRule], columns, ['amount'])).toThrow()
    expect(() => guardConditionalRules([rule({ condition: { field: 'amount', operator: 'contains', value: '2' } })], columns)).toThrow()
    expect(() => guardConditionalRules([rule({ condition: { field: 'name', operator: 'eq', value: '' } })], columns)).toThrow()
    expect(() => guardConditionalRules([rule({ condition: { field: 'actions', operator: 'eq', value: 1 } })], columns)).toThrow()
  })

  it('preserves typed values and returns an independent validated copy', () => {
    const original = rule({ condition: { field: 'status', operator: 'in', value: [1, false] } })
    const guarded = guardConditionalRules([original], columns)
    expect(guarded[0]?.condition.value).toEqual([1, false])
    ;(guarded[0]!.condition.value as (number | boolean)[]).push(2)
    expect(original.condition.value).toEqual([1, false])
    expect(() => guardConditionalRules([rule({ condition: { field: 'amount', operator: 'gte', value: 200000, unitFactor: 100 } })], columns)).toThrow()
  })

  it('matches the first enabled rule against raw values without filtering rows', () => {
    const first = rule({ enabled: false, label: '禁用' })
    const second = rule({ id: 'review', label: '复核' })
    const third = rule({ id: 'watch', condition: { field: 'status', operator: 'in', value: [1] }, label: '关注' })
    const match = compileConditionalRules([first, second, third], columns)
    expect(match({ amount: 250000, status: 1 })?.id).toBe('review')
    expect(match({ amount: 150000, status: 1 })?.id).toBe('watch')
    expect(match({ amount: 150000, status: '1' })).toBeUndefined()
    expect(match({ amount: '250000', status: '1' })).toBeUndefined()
  })

  it('makes an editor column use default operators and raw numeric units', () => {
    const text = conditionalColumn(columns[0]!)
    expect(text.filterable).toBe(true)
    expect(text.filter?.operators).toContain('contains')
    const number = conditionalColumn(columns[1]!)
    expect(number.numberRule?.enabled).toBe(false)
    expect(number.numberFormat?.style).toBe('decimal')
    const draft = createFilterDraft(number, rule().condition)
    expect(draft.value).toBe('200000')
    expect(parseFilterDraft(draft, number).value).toBe(200000)
  })
})
