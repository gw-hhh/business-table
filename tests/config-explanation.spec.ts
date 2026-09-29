import {describe, expect, it, vi} from 'vitest'
import {explainConfiguration} from '../src/config/explanation'
import {resolveConfiguration} from '../src/config/schema'
import type {TableDefinition} from '../src/config/types'

const definition = (): TableDefinition => ({
  schemaVersion: 3, tableKey: 'assets', columns: [
    {id: 'name', field: 'name', title: '名称', width: 120, default: {width: 140}, configurable: {width: {enabled: true, min: 100, max: 300}, rename: true}},
    {id: 'locked', field: 'locked', title: '锁定', width: 100, configurable: {}},
  ],
})
const preference = (columns: unknown, extra = {}) => ({kind: 'business-table-preference', schemaVersion: 3, tableKey: 'assets', columns, ...extra})

describe('configuration explanation', () => {
  it('records legal same-value overrides from all five sources using the actual resolver result', () => {
    const input = {definition: definition(), remoteOverride: {columns: {name: {width: 160}}}, preference: preference({name: {width: 160}}), viewColumns: {name: {width: 180}}}
    const result = explainConfiguration(input)
    expect(result.scope).toBe('supplied-snapshot')
    expect(result.coverage).toEqual(['columns', 'pagination', 'presentation'])
    expect(result.resolved).toEqual(resolveConfiguration(input))
    expect(result.entries.find(entry => entry.path === '/columns/name/width')).toMatchObject({
      source: 'view', effectiveValue: 180,
      history: [
        {source: 'declaration', status: 'accepted', value: 120},
        {source: 'default', status: 'accepted', value: 140},
        {source: 'remote', status: 'accepted', value: 160},
        {source: 'preference', status: 'accepted', value: 160},
        {source: 'view', status: 'accepted', value: 180},
      ],
    })
  })

  it('explains invalid fields, forbidden overrides and preference identity failures', () => {
    const result = explainConfiguration({definition: definition(), remoteOverride: {columns: {name: {width: 999, visible: false}, locked: {title: '越权'}, missing: {width: 150}}}, preference: preference({name: {width: 200}}, {tableKey: 'other'}), viewColumns: {name: {width: '250'}}})
    expect(result.entries.find(entry => entry.path === '/columns/name/width')).toMatchObject({source: 'default', effectiveValue: 140, history: [
      {source: 'declaration', status: 'accepted'}, {source: 'default', status: 'accepted'},
      {source: 'remote', status: 'rejected', reason: {code: 'CapabilityViolation'}},
      {source: 'view', status: 'rejected', reason: {code: 'SchemaValidationError'}},
    ]})
    expect(result.entries.find(entry => entry.path === '/columns/locked/title')).toMatchObject({source: 'declaration', effectiveValue: '锁定'})
    expect(result.entries.find(entry => entry.path === '/columns/missing')).toMatchObject({source: null, history: [{source: 'remote', status: 'rejected'}]})
    expect(result.entries.find(entry => entry.path === '/preference/tableKey')).toMatchObject({source: null, history: [{source: 'preference', status: 'rejected', reason: {message: '此偏好属于其他表格。'}}]})
  })

  it('uses normalized presentation values and records invalid same-default candidates as rejected', () => {
    const result = explainConfiguration({definition: {...definition(), presentation: {toolbar: {table: {reload: {label: '  刷新  '}}}}}, remoteOverride: {presentation: {appearance: {fontSize: '14', density: 'comfortable'}, toolbar: {table: {reload: {label: '刷新'}}}}}, preference: preference({}, {presentation: {appearance: {fontSize: 16}}})})
    expect(result.entries.find(entry => entry.path === '/presentation/toolbar/table/reload/label')).toMatchObject({source: 'remote', effectiveValue: '刷新', history: [{source: 'declaration', value: '刷新'}, {source: 'remote', value: '刷新'}]})
    expect(result.entries.find(entry => entry.path === '/presentation/appearance/fontSize')).toMatchObject({source: 'preference', effectiveValue: 16, history: [{source: 'default', value: 14}, {source: 'remote', status: 'rejected'}, {source: 'preference', status: 'accepted', value: 16}]})
  })

  it('keeps readonly saved values readable and validates pagination against effective options', () => {
    const local = definition()
    local.columns[0]!.configurable!.width = {enabled: true, disabled: true, min: 100, max: 300}
    const result = explainConfiguration({definition: local, remoteOverride: {pagination: {pageSizeOptions: [50, 100], pageSize: 100}}, preference: preference({name: {width: 250}}, {pagination: {pageSize: 20}})})
    expect(result.entries.find(entry => entry.path === '/columns/name/width')).toMatchObject({source: 'preference', effectiveValue: 250})
    expect(result.entries.find(entry => entry.path === '/pagination/pageSize')).toMatchObject({source: 'remote', effectiveValue: 100, history: expect.arrayContaining([{source: 'preference', status: 'rejected', reason: expect.objectContaining({code: 'SchemaValidationError'})}])})
  })

  it('does not read feature details and produces isolated snapshots with escaped IDs', () => {
    const details = vi.fn(() => {throw new Error('disabled details')})
    const local = definition()
    local.features = {search: Object.defineProperty({enabled: false}, 'details', {get: details})}
    local.columns[0]!.id = 'name/a~b'
    const result = explainConfiguration({definition: local, viewColumns: {'name/a~b': {width: 200}}})
    expect(details).not.toHaveBeenCalled()
    expect(result.entries.find(entry => entry.path === '/columns/name~1a~0b/width')).toMatchObject({source: 'view', effectiveValue: 200})
    local.columns[0]!.default!.width = 300
    expect(result.entries.find(entry => entry.path === '/columns/name~1a~0b/width')!.history[1]!.value).toBe(140)
  })

  it('reports preference parsing failures and preserves explicitly saved default values', () => {
    const result = explainConfiguration({definition: definition(), remoteOverride: {presentation: {appearance: {fontSize: 18}}}, preference: preference({name: {width: '200'}}, {presentation: {appearance: {fontSize: 14, density: 'invalid'}}})})
    expect(result.entries.find(entry => entry.path === '/columns/name/width')).toMatchObject({source: 'default', effectiveValue: 140, history: expect.arrayContaining([expect.objectContaining({source: 'preference', status: 'rejected'})])})
    expect(result.entries.find(entry => entry.path === '/presentation/appearance/fontSize')).toMatchObject({source: 'preference', effectiveValue: 14, history: expect.arrayContaining([expect.objectContaining({source: 'preference', status: 'accepted', value:14})])})
    expect(result.entries.find(entry => entry.path === '/presentation/appearance/density')!.history.at(-1)).toMatchObject({source: 'preference', status: 'rejected'})
  })

  it('records actual ordered positions while preserving locked slots and typed identities', () => {
    const local: TableDefinition = {schemaVersion: 3, tableKey: 'assets', columns: [
      {id: 'a.b', field: 'a', title: 'A', configurable: {order: true}},
      {id: 'locked', field: 'locked', title: '锁定', configurable: {}},
      {id: '__proto__', field: 'b', title: 'B', configurable: {order: true}},
    ]}
    const result = explainConfiguration({definition: local, viewColumns: JSON.parse('{"a.b":{"order":10},"__proto__":{"order":0},"locked":{"order":5}}')})
    expect(result.resolved.columns.map(column => column.id)).toEqual(['__proto__', 'locked', 'a.b'])
    expect(result.entries.find(entry => entry.path === '/columns/a.b/order')).toMatchObject({source: 'view', effectiveValue: 2, history: [{source: 'declaration', value: 0}, {source: 'view', value: 10}]})
    expect(result.entries.find(entry => entry.path === '/columns/locked/order')).toMatchObject({source: 'declaration', effectiveValue: 1, history: [{source: 'declaration', value: 1}, {source: 'view', status: 'rejected'}]})
  })

  it('links derived appearance page size to its actual pagination source', () => {
    const result = explainConfiguration({definition: definition(), remoteOverride: {pagination: {pageSize: 50}}})
    expect(result.entries.find(entry => entry.path === '/presentation/appearance/pageSize')).toMatchObject({source: 'remote', effectiveValue: 50, history: [{source: 'default', value: 10}, {source: 'remote', value: 50, derivedFrom: '/pagination/pageSize'}]})
  })

  it('keeps normal resolution free of snapshot copies and returns independent trace values', () => {
    const clone = vi.spyOn(globalThis, 'structuredClone')
    const input = {definition: definition(), remoteOverride: {columns: {name: {width: 160}}}}
    try {
      resolveConfiguration(input)
      expect(clone).not.toHaveBeenCalled()
      const first = explainConfiguration(input)
      expect(clone).toHaveBeenCalled()
      first.entries.find(entry => entry.path === '/pagination/pageSizeOptions')!.effectiveValue = [999]
      const second = explainConfiguration(input)
      expect(second.entries.find(entry => entry.path === '/pagination/pageSizeOptions')!.effectiveValue).toEqual([20, 50, 100])
    } finally { clone.mockRestore() }
  })
})
