import { describe, expect, it } from 'vitest'
import { applyFilters } from '../src/core'
import { matchesFilter, matchesFilterGroup, readFilter, readFilterGroup, type FilterGroup } from '../src/features/filters/model'
import { filterQuotations, makeExampleQuotations } from '../demo/quotation/model'
import type { FilterConfig, Query } from '../src/types'

const rule = (operator: FilterConfig['operator'], value: unknown): FilterConfig => ({ field: 'value', operator, value })
describe('shared filter engine migration', () => {
  it.each([
    ['ne', 2, [1, 3]], ['starts', 'a', ['ab', 'ac']], ['notIn', [2], [1, 3]],
    ['between', [1, 2], [1, 2]], ['empty', null, [null, '']], ['notEmpty', null, [1, 2, 3]],
  ] as const)('supports %s through the public local filtering pipeline', (operator, value, expected) => {
    const values = operator === 'starts' ? ['ab', 'ac', 'bc'] : operator === 'empty' ? [null, '', 1] : [1, 2, 3]
    expect(applyFilters(values.map(value => ({ value })), [rule(operator, value)]).map(row => row.value)).toEqual(expected)
  })
  it('does not coerce an empty cell or a boolean to numeric zero', () => {
    expect(applyFilters([null, '', ' ', false, 0].map(value => ({ value })), [rule('lte', 0)]).map(row => row.value)).toEqual([0])
  })
  it('preserves primitive types in membership and equality', () => {
    expect(applyFilters([1, '1', '01', false, null].map(value => ({ value })), [rule('in', [1, false])]).map(row => row.value)).toEqual([1, false])
  })
  it('rejects impossible calendar dates rather than normalizing into the next month', () => {
    expect(matchesFilter({ value: '2026-02-30' }, rule('nextDays', 10), '2026-02-28')).toBe(false)
  })
  it('does not follow inherited object properties', () => {
    expect(applyFilters([{ value: Object.create({ secret: 1 }) }], [{ field: 'value.secret', operator: 'eq', value: 1 }])).toEqual([])
  })
  it('rejects invalid operator payloads at the data boundary', () => {
    expect(readFilter(rule('nextDays', -1))).toBeNull()
    expect(readFilter(rule('eq', [1]))).toBeNull()
    expect(readFilter(rule('between', [null, 2]))).toBeNull()
    expect(readFilter({ field: '__proto__.secret', operator: 'eq', value: 1 })).toBeNull()
  })
  it('enforces a total of 30 rules across nested groups, not 30 per group', () => {
    const group: FilterGroup = { logic: 'and', rules: [
      { logic: 'and', rules: Array.from({ length: 20 }, () => rule('eq', 1)) },
      { logic: 'or', rules: Array.from({ length: 20 }, () => rule('eq', 1)) },
    ] }
    expect(readFilterGroup(group)).toBeUndefined()
    expect(matchesFilterGroup({ value: 1 }, group)).toBe(false)
  })
  it('does not silently discard invalid children and broaden a saved query', () => {
    expect(readFilterGroup({ logic: 'and', rules: [rule('eq', 1), { field: 'value', operator: 'execute', value: 2 }] })).toBeUndefined()
  })
  it('rejects cyclic groups without recursing indefinitely or accepting a partial group', () => {
    const group: FilterGroup = { logic: 'or', rules: [rule('eq', 1)] }; group.rules.push(group)
    expect(readFilterGroup(group)).toBeUndefined()
    expect(matchesFilterGroup({ value: 1 }, group)).toBe(false)
  })
  it('rejects empty nested groups that would make an OR expression match everything', () => {
    expect(readFilterGroup({ logic: 'or', rules: [{ logic: 'and', rules: [] }, rule('eq', 1)] })).toBeUndefined()
  })
  it('leaves an intentionally empty root as an unrestricted query', () => {
    expect(matchesFilterGroup({ value: 1 }, { logic: 'and', rules: [] })).toBe(true)
  })
  it('applies numeric conditions and combined groups in the quotation data adapter', () => {
    const rows = makeExampleQuotations()
    const query: Query = { page: 1, pageSize: 100, sorts: [], filters: [{ field: 'amount', operator: 'gt', value: 200000 }],
      filterGroup: { logic: 'or', rules: [{ field: 'customer', operator: 'eq', value: '澄川水务' }, { field: 'status', operator: 'eq', value: '评审中' }] } }
    expect(filterQuotations(rows, query).map(row => row.id)).toEqual(['Q20260914-0181', 'Q20260912-0051'])
    expect(rows[0]?.id).toBe('Q20260914-0001')
  })
})
