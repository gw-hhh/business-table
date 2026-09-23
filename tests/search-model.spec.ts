import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { createRegistry } from '../src/runtime/registry'
import type { ConfigDiagnostic } from '../src/config/diagnostics'
import type { FilterConfig } from '../src/types'
import {
  defaultSearchValues,
  normalizeSearchDefinition,
  projectSearchValues,
  readRuntimeSearchValues,
  readSearchJson,
  readSearchValues,
  restoreLegacySearch,
  serializeSearchValues,
} from '../src/features/search/model'

const definitions = () => normalizeSearchDefinition({
  resetBehavior: 'default',
  items: [
    { id: 'Keyword', kind: 'keyword', defaultValue: 'initial' },
    { id: 'Status', kind: 'select', field: 'status', operator: 'eq', defaultValue: 1,
      options: [{ value: 1, label: '数字' }, { value: '1', label: '文本' }, { value: false, label: '否' }] },
    { id: 'From', kind: 'date', field: 'createdAt', operator: 'gte', advanced: true },
    { id: 'To', kind: 'date', field: 'createdAt', operator: 'lte', advanced: true },
    { id: 'Amount', kind: 'number', field: 'amount', operator: 'gte' },
    { id: 'Name', kind: 'text', field: 'name', operator: 'contains' },
  ],
})

describe('Search definition and values', () => {
  it('copies safe JSON for View snapshots and rejects cycles without invoking accessors', () => {
    const original = { values: [1, false, { id: 'D01' }] }
    const copy = readSearchJson(original)
    expect(copy).toEqual(original)
    expect(copy).not.toBe(original)
    const issues: ConfigDiagnostic[] = []
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(readSearchJson(cycle, issue => issues.push(issue), 'view.search.values')).toBeUndefined()
    expect(issues[0]?.path).toBe('view.search.values')
    let reads = 0
    const withGetter = Object.defineProperty({}, 'value', { enumerable: true, get() { reads++; return 1 } })
    expect(readSearchJson(withGetter, issue => issues.push(issue))).toBeUndefined()
    expect(reads).toBe(0)
  })

  it('normalizes public kind and labels, default collapse and an unselected select', () => {
    const definition = normalizeSearchDefinition({ defaultCollapsed: true, items: [
      { id: 'Keyword', label: '关键词', kind: 'keyword', defaultValue: '' },
      { id: 'Status', label: '状态', kind: 'select', field: 'status', defaultValue: null,
        options: [{ value: 1, label: '待处理' }] },
    ] })
    expect(definition.defaultCollapsed).toBe(true)
    expect(definition.items).toEqual([
      { id: 'Keyword', label: '关键词', kind: 'keyword', defaultValue: '' },
      { id: 'Status', label: '状态', kind: 'select', field: 'status', operator: 'eq', defaultValue: null,
        options: [{ value: 1, label: '待处理' }] },
    ])
    expect(projectSearchValues(defaultSearchValues(definition), definition)).toEqual({ keyword: '', filters: [] })
  })

  it('keeps UI placeholders and treats cleared date and number fields as absent conditions', () => {
    const definition = normalizeSearchDefinition({ items: [
      { id: 'Amount', label: '金额', kind: 'number', field: 'amount', operator: 'gte', placeholder: '最低金额' },
      { id: 'Date', label: '日期', kind: 'date', field: 'createdAt', operator: 'eq' },
    ] })
    expect(definition.items[0]?.placeholder).toBe('最低金额')
    const values = readSearchValues({ Amount: null, Date: '' }, definition)
    expect(values).toEqual({ Amount: null, Date: '' })
    expect(projectSearchValues(values, definition)).toEqual({ keyword: '', filters: [] })
  })

  it('keeps stable IDs, field operators and typed options while diagnosing duplicate or disallowed items', () => {
    const issues: ConfigDiagnostic[] = []
    const definition = normalizeSearchDefinition({ items: [
      { id: 'Status', kind: 'select', field: 'status', operator: 'eq', defaultValue: 1,
        options: [{ value: 1, label: '数字' }, { value: '1', label: '文本' }] },
      { id: 'Status', kind: 'text', field: 'other', operator: 'contains' },
      { id: 'Hidden', kind: 'text', field: 'hidden', operator: 'eq' },
    ] }, ['Status'], issue => issues.push(issue))
    expect(definition.items).toEqual([{ id: 'Status', kind: 'select', field: 'status', operator: 'eq',
      defaultValue: 1, options: [{ value: 1, label: '数字' }, { value: '1', label: '文本' }] }])
    expect(issues).toHaveLength(2)
  })

  it('starts from definition defaults and uses an empty reset when requested', () => {
    const definition = definitions()
    expect(defaultSearchValues(definition)).toEqual({ Keyword: 'initial', Status: 1 })
    const emptyReset = normalizeSearchDefinition({ resetBehavior: 'empty', items: [
      { id: 'Keyword', kind: 'keyword', defaultValue: 'initial' },
    ] })
    expect(defaultSearchValues(emptyReset)).toEqual({ Keyword: 'initial' })
    expect(defaultSearchValues(emptyReset, 'reset')).toEqual({})
  })

  it('overlays valid saved values on defaults and drops expired IDs or invalid values', () => {
    const issues: ConfigDiagnostic[] = []
    const values = readSearchValues({ Keyword: 'hello', Status: false, Amount: 120.5,
      Missing: 'stale', From: '2026-02-30' }, definitions(), undefined, issue => issues.push(issue))
    expect(values).toEqual({ Keyword: 'hello', Status: false, Amount: 120.5 })
    expect(issues.map(issue => issue.path)).toEqual(expect.arrayContaining(['search.values.Missing', 'search.values.From']))
  })

  it('rejects a reversed date interval atomically without losing other valid values', () => {
    const issues: ConfigDiagnostic[] = []
    const values = readSearchValues({ Keyword: 'new', From: '2026-09-20', To: '2026-09-10' },
      definitions(), undefined, issue => issues.push(issue))
    expect(values).toEqual({ Keyword: 'initial', Status: 1 })
    expect(issues.some(issue => issue.path === 'search.values.dateRange')).toBe(true)
    expect(projectSearchValues({ From: '2026-09-20', To: '2026-09-10' }, definitions(), undefined,
      issue => issues.push(issue)).filters).toEqual([])
  })

  it('projects keyword and typed field conditions once, including date boundaries', () => {
    const values = { Keyword: '  test  ', Status: false, From: '2026-09-01', To: '2026-09-30', Amount: 25, Name: '甲' }
    expect(projectSearchValues(values, definitions())).toEqual({ keyword: 'test', filters: [
      { field: 'status', operator: 'eq', value: false },
      { field: 'createdAt', operator: 'gte', value: '2026-09-01' },
      { field: 'createdAt', operator: 'lte', value: '2026-09-30' },
      { field: 'amount', operator: 'gte', value: 25 },
      { field: 'name', operator: 'contains', value: '甲' },
    ] })
  })

  it('uses only registered code for custom conversion and keeps persistence data-only', () => {
    const registry = createRegistry()
    registry.register('search', 'Department', {
      component: defineComponent({ render: () => null }),
      deserialize: value => ({ id: value }),
      serialize: value => (value as { id: string }).id,
      toQuery: value => [{ field: 'departmentId', operator: 'eq', value: (value as { id: string }).id }],
    })
    const definition = normalizeSearchDefinition({ items: [{ id: 'Department', kind: 'custom' }] })
    const values = readSearchValues({ Department: 'D01' }, definition, registry)
    expect(values).toEqual({ Department: { id: 'D01' } })
    expect(serializeSearchValues(values, definition, registry)).toEqual({ Department: 'D01' })
    expect(projectSearchValues(values, definition, registry)).toEqual({ keyword: '', filters: [
      { field: 'departmentId', operator: 'eq', value: 'D01' },
    ] })
  })

  it('deserializes a custom default before projecting it into provider conditions', () => {
    const registry = createRegistry()
    registry.register('search', 'Department', {
      component: defineComponent({ render: () => null }),
      deserialize: value => ({ id: value }),
      serialize: value => (value as { id: string }).id,
      toQuery: value => [{ field: 'departmentId', operator: 'eq', value: (value as { id: string }).id }],
    })
    const definition = normalizeSearchDefinition({ items: [
      { id: 'Department', kind: 'custom', defaultValue: 'D01' },
    ] })
    const values = readSearchValues(undefined, definition, registry)
    expect(values).toEqual({ Department: { id: 'D01' } })
    expect(projectSearchValues(values, definition, registry).filters).toEqual([
      { field: 'departmentId', operator: 'eq', value: 'D01' },
    ])
  })

  it('rolls back a custom override when the same saved search has an inverted date range', () => {
    const registry = createRegistry()
    registry.register('search', 'Department', {
      component: defineComponent({ render: () => null }),
      deserialize: value => ({ id: value }),
      serialize: value => (value as { id: string }).id,
      toQuery: value => [{ field: 'departmentId', operator: 'eq', value: (value as { id: string }).id }],
    })
    const definition = normalizeSearchDefinition({ items: [
      { id: 'Department', kind: 'custom', defaultValue: 'D01' },
      { id: 'From', kind: 'date', field: 'createdAt', operator: 'gte' },
      { id: 'To', kind: 'date', field: 'createdAt', operator: 'lte' },
    ] })
    expect(readSearchValues({ Department: 'D02', From: '2026-09-20', To: '2026-09-10' }, definition, registry))
      .toEqual({ Department: { id: 'D01' } })
  })

  it('validates an in-memory custom value without deserializing it a second time', () => {
    const registry = createRegistry()
    registry.register('search', 'Department', {
      component: defineComponent({ render: () => null }),
      deserialize: value => ({ id: value }),
      serialize: value => (value as { id: string }).id,
      toQuery: value => [{ field: 'departmentId', operator: 'eq', value: (value as { id: string }).id }],
    })
    const definition = normalizeSearchDefinition({ items: [
      { id: 'Department', kind: 'custom', defaultValue: 'D01' },
      { id: 'From', kind: 'date', field: 'createdAt', operator: 'gte' },
      { id: 'To', kind: 'date', field: 'createdAt', operator: 'lte' },
    ] })
    expect(readRuntimeSearchValues({ Department: { id: 'D02' } }, definition, registry)).toEqual({ Department: { id: 'D02' } })
    expect(readRuntimeSearchValues({ Department: { id: 'D02' }, From: '2026-09-20', To: '2026-09-10' }, definition, registry))
      .toEqual({ Department: { id: 'D01' } })
  })

  it('treats cleared date endpoints as absent when validating a range', () => {
    const definition = normalizeSearchDefinition({ items: [
      { id: 'From', kind: 'date', field: 'createdAt', operator: 'gte' },
      { id: 'To', kind: 'date', field: 'createdAt', operator: 'lte' },
    ] })
    const values = readRuntimeSearchValues({ From: '2026-09-20', To: '' }, definition)
    expect(values).toEqual({ From: '2026-09-20', To: '' })
    expect(projectSearchValues(values, definition)).toEqual({ keyword: '', filters: [
      { field: 'createdAt', operator: 'gte', value: '2026-09-20' },
    ] })
  })

  it('reports a missing custom registry entry and omits its value and filters', () => {
    const issues: ConfigDiagnostic[] = []
    const definition = normalizeSearchDefinition({ items: [{ id: 'Department', kind: 'custom', defaultValue: 'D01' }] })
    expect(readSearchValues({ Department: 'D02' }, definition, createRegistry(), issue => issues.push(issue))).toEqual({})
    expect(projectSearchValues({ Department: 'D02' }, definition, createRegistry(), issue => issues.push(issue))).toEqual({ keyword: '', filters: [] })
    expect(issues.some(issue => issue.code === 'UnknownRegistryId')).toBe(true)
  })

  it('rejects cyclic or executable values from storage and custom hooks', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const issues: ConfigDiagnostic[] = []
    expect(readSearchValues({ Name: cycle }, definitions(), undefined, issue => issues.push(issue))).toEqual({ Keyword: 'initial', Status: 1 })
    const registry = createRegistry()
    registry.register('search', 'Department', { component: defineComponent({ render: () => null }),
      serialize: () => cycle, toQuery: () => [{ field: 'id', operator: 'eq', value: () => 1 }] })
    const definition = normalizeSearchDefinition({ items: [{ id: 'Department', kind: 'custom' }] })
    expect(serializeSearchValues({ Department: 'x' }, definition, registry, issue => issues.push(issue))).toEqual({})
    expect(projectSearchValues({ Department: 'x' }, definition, registry, issue => issues.push(issue))).toEqual({ keyword: '', filters: [] })
    expect(issues.length).toBeGreaterThanOrEqual(3)
  })

  it('restores only matching legacy conditions and returns unmatched filters intact', () => {
    const filters: FilterConfig[] = [
      { field: 'status', operator: 'eq', value: 1 },
      { field: 'createdAt', operator: 'gte', value: '2026-09-01' },
      { field: 'createdAt', operator: 'lte', value: '2026-09-30' },
      { field: 'status', operator: 'eq', value: false },
      { field: 'owner', operator: 'eq', value: '林' },
    ]
    expect(restoreLegacySearch('legacy', filters, definitions())).toEqual({
      values: { Keyword: 'legacy', Status: 1, From: '2026-09-01', To: '2026-09-30' },
      filters: [{ field: 'status', operator: 'eq', value: false }, { field: 'owner', operator: 'eq', value: '林' }],
    })
    expect(filters).toHaveLength(5)
  })
})
