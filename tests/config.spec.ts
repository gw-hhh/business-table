import { describe, expect, it } from 'vitest'
import { applyColumnPatches, getColumnCapabilityAccess, getColumnWidthBounds, guardColumnPatch, isColumnCapabilityEnabled } from '../src/config/columns'
import { createPreferenceDelta, parsePreference, resolveConfiguration } from '../src/config/schema'
import type { ConfigDiagnostic } from '../src/config/diagnostics'
import type { ColumnCapabilities, ColumnDefinition, TableDefinition } from '../src/config/types'
import type { TableConfig } from '../src/types'

const editable: ColumnCapabilities = { visible: true, order: true, width: true, fixed: true, rename: true, align: true }
const preference = (columns: unknown, extra = {}) => ({ kind: 'business-table-preference', schemaVersion: 3, tableKey: 'assets', columns, ...extra })
const definition = (columns: ColumnDefinition[] = [
  { id: 'Id', field: 'id', title: 'ID', default: { visible: true, width: 100, fixed: 'left' }, configurable: { width: { enabled: true, min: 80, max: 180 } } },
  { id: 'Name', field: 'name', title: '名称', width: 160, configurable: editable },
  { id: 'Code', field: 'code', title: '编号', width: 120, configurable: editable },
]): TableDefinition => ({ schemaVersion: 3, tableKey: 'assets', columns, pagination: { pageSize: 20, pageSizeOptions: [20, 50, 100] } })

describe('column capability guard', () => {
  it('retains valid legacy fields while discarding unknown and invalid siblings', () => {
    const diagnostics: ConfigDiagnostic[] = []
    expect(guardColumnPatch({ id: 'Name', field: 'name', title: 'Name' }, { width: 200, align: 'center', title: '新名称', visible: 'yes', fixed: 'top', order: -1, field: 'secret', handler: () => 1 }, d => diagnostics.push(d)))
      .toEqual({ width: 200, align: 'center', title: '新名称' })
    expect(diagnostics.length).toBeGreaterThanOrEqual(5)
  })

  it('denies undeclared new-definition capabilities and preserves allowed width', () => {
    const column = { ...definition().columns[0]!, visible: true, fixed: 'left' as const }
    const diagnostics: ConfigDiagnostic[] = []
    expect(guardColumnPatch(column, { width: 150, visible: false, fixed: false, order: 9, title: 'override', align: 'right' }, d => diagnostics.push(d))).toEqual({ width: 150 })
    expect(diagnostics.every(d => d.code === 'CapabilityViolation')).toBe(true)
    expect(guardColumnPatch({ id: 'locked', field: 'locked', title: 'Locked', configurable: {} }, { visible: false })).toEqual({})
    expect(isColumnCapabilityEnabled(column, 'width')).toBe(true)
    expect(isColumnCapabilityEnabled(column, 'fixed')).toBe(false)
    expect(isColumnCapabilityEnabled({ id: 'legacy', field: 'legacy', title: 'Legacy' }, 'visible')).toBe(true)
  })

  it('enforces width bounds and fixed allowed values without mutating patches', () => {
    const column = { id: 'Name', field: 'name', title: 'Name', minWidth: 110, configurable: { width: { enabled: true, min: 90, max: 180 }, fixed: { enabled: true, allowedValues: [false, 'left'] as (false | 'left')[] }, visible: true } }
    const patch = Object.freeze({ width: 100, fixed: 'right', visible: false })
    expect(guardColumnPatch(column, patch)).toEqual({ visible: false })
    expect(guardColumnPatch(column, { width: 180, fixed: false })).toEqual({ width: 180, fixed: false })
    expect(getColumnWidthBounds(column)).toEqual({ min: 110, max: 180 })
    expect(getColumnWidthBounds({ id: 'x', field: 'x', title: 'X' })).toEqual({ min: 80, max: 500 })
    expect(guardColumnPatch({ id: 'x', field: 'x', title: 'X' }, { width: 501 })).toEqual({})
  })

  it('anchors locked positions when movable neighbours request earlier positions', () => {
    const columns = [
      { id: 'A', field: 'a', title: 'A', configurable: editable },
      { id: 'Id', field: 'id', title: 'ID', configurable: {} },
      { id: 'B', field: 'b', title: 'B', configurable: editable },
    ]
    expect(applyColumnPatches(columns, { B: { order: 0 }, A: { order: 2 }, Id: { order: 2 } }).map(c => c.id)).toEqual(['B', 'Id', 'A'])
    expect(columns.map(c => c.id)).toEqual(['A', 'Id', 'B'])
  })

  it('never broadens a maximum width when minWidth conflicts with it', () => {
    const column = { id: 'x', field: 'x', title: 'X', minWidth: 250, configurable: { width: { enabled: true, max: 180 } } }
    expect(guardColumnPatch(column, { width: 250 })).toEqual({})
    expect(getColumnWidthBounds(column)).toEqual({ min: 250, max: 180 })
  })

  it('distinguishes an omitted control from an explicit read-only control after schema parsing', () => {
    const local = definition([{ id: 'Name', field: 'name', title: '名称', configurable: {
      width: { enabled: true, disabled: true, min: 100, max: 200 },
      fixed: { enabled: true, visible: false, allowedValues: [false, 'left'] },
      rename: { enabled: true, disabled: true },
      align: true,
      mapping: { enabled: false },
    } }])
    const result = resolveConfiguration({ definition: local })
    const column = result.baseColumns[0]!
    expect(result.diagnostics).toEqual([])
    expect(getColumnCapabilityAccess(column, 'width')).toEqual({ visible: true, disabled: true })
    expect(getColumnCapabilityAccess(column, 'rename')).toEqual({ visible: true, disabled: true })
    expect(getColumnCapabilityAccess(column, 'align')).toEqual({ visible: true, disabled: false })
    for (const field of ['fixed', 'visible', 'mapping'] as const) expect(getColumnCapabilityAccess(column, field)).toEqual({ visible: false, disabled: false })
    expect(getColumnWidthBounds(column)).toEqual({ min: 100, max: 200 })
    expect(guardColumnPatch(column, { title: '新名称', width: 180, fixed: 'left', align: 'right' })).toEqual({ align: 'right' })
    expect(local.columns[0]!.configurable!.width).toEqual({ enabled: true, disabled: true, min: 100, max: 200 })
  })

  it('restores and preserves valid saved values for controls declared read-only', () => {
    const local = definition([{ id: 'Name', field: 'name', title: '名称', width: 160, configurable: {
      width: { enabled: true, disabled: true, min: 100, max: 240 },
      rename: { enabled: true, disabled: true },
      align: true,
    } }])
    const saved = preference({ Name: { width: 220, title: '已保存名称' } })
    const result = resolveConfiguration({ definition: local, preference: saved })
    expect(result.columns[0]).toMatchObject({ title: '已保存名称', width: 220 })
    expect(result.preference?.columns).toEqual({ Name: { width: 220, title: '已保存名称' } })
    expect(guardColumnPatch(result.columns[0]!, { width: 240, title: '禁止修改', align: 'right' })).toEqual({ align: 'right' })
  })
})

describe('preference migration and schema recovery', () => {
  it.each([
    { schemaVersion: 1, tableKey: 'assets', columns: { Name: { width: 200 } }, pageSize: 50 },
    { kind: 'business-table-preference', schemaVersion: 2, tableKey: 'assets', columns: { Name: { width: 200 } }, pageSize: 50 },
    preference({ Name: { width: 200 } }, { pagination: { pageSize: 50 } }),
  ])('migrates a supported preference to the v3 data-only envelope ($schemaVersion)', input => {
    expect(parsePreference(JSON.stringify(input), 'assets')).toEqual(preference({ Name: { width: 200 } }, { pagination: { pageSize: 50 } }))
  })

  it('reports corrupt JSON instead of throwing', () => {
    const diagnostics: ConfigDiagnostic[] = []
    expect(parsePreference('{ broken', 'assets', d => diagnostics.push(d))).toBeNull()
    expect(diagnostics[0]?.code).toBe('ConfigParseError')
  })

  it.each([
    { schemaVersion: 2, tableKey: 'assets', columns: {} },
    { schemaVersion: 3, tableKey: 'assets', columns: {} },
    { kind: 'quotation', schemaVersion: 3, tableKey: 'assets', columns: {} },
    preference({}, { schemaVersion: 99 }),
    preference({}, { tableKey: 'another-table' }),
  ])('rejects unrelated sources, unsupported versions, and another table', input => {
    const diagnostics: ConfigDiagnostic[] = []
    expect(parsePreference(input, 'assets', d => diagnostics.push(d))).toBeNull()
    expect(diagnostics.length).toBeGreaterThan(0)
  })

  it('recovers individual preference fields and drops runtime or executable fields', () => {
    const diagnostics: ConfigDiagnostic[] = []
    const parsed = parsePreference(preference({ Name: { width: 200, visible: 'bad', handler: () => 1 }, Code: null }, { pagination: { pageSize: -20 }, page: 9, selectedRows: ['private'] }), 'assets', d => diagnostics.push(d))
    expect(parsed).toEqual(preference({ Name: { width: 200 } }))
    expect(diagnostics.length).toBeGreaterThanOrEqual(3)
  })

  it('uses own stable IDs safely including prototype property names', () => {
    const parsed = parsePreference('{"kind":"business-table-preference","schemaVersion":3,"tableKey":"assets","columns":{"__proto__":{"width":220},"constructor":{"visible":false}}}', 'assets')!
    expect(parsed).not.toBeNull()
    expect(Object.hasOwn(parsed.columns, '__proto__')).toBe(true)
    expect(parsed.columns.__proto__).toEqual({ width: 220 })
    expect(parsed.columns.constructor).toEqual({ visible: false })
    expect(({} as Record<string, unknown>).width).toBeUndefined()
  })
})

describe('configuration layers', () => {
  it('applies remote then preference then view and preserves each base default', () => {
    const local = definition()
    const remote = { columns: { Name: { width: 210, title: '后台名称' } } }
    const result = resolveConfiguration({ definition: local, remoteOverride: remote, preference: preference({ Name: { width: 230 } }), viewColumns: { Name: { width: 260 } } })
    expect(result.baseColumns[1]).toMatchObject({ id: 'Name', title: '后台名称', width: 210 })
    expect(result.columns[1]).toMatchObject({ id: 'Name', title: '后台名称', width: 260 })
    expect(result.columns[0]).toMatchObject({ id: 'Id', visible: true, width: 100, fixed: 'left' })
    expect(local.columns[1]?.width).toBe(160)
    expect(remote.columns.Name.width).toBe(210)
  })

  it.each(['remote', 'preference', 'view'] as const)('guards fixed visibility, freeze and order against the %s layer', layer => {
    const patch = { Id: { visible: false, fixed: false, order: 2, width: 150 }, Name: { order: 2 }, Code: { order: 0 } }
    const result = resolveConfiguration({ definition: definition(), remoteOverride: layer === 'remote' ? { columns: patch } : undefined, preference: layer === 'preference' ? preference(patch) : undefined, viewColumns: layer === 'view' ? patch : undefined })
    expect(result.columns.map(c => c.id)).toEqual(['Id', 'Code', 'Name'])
    expect(result.columns[0]).toMatchObject({ visible: true, fixed: 'left', width: 150 })
    expect(result.diagnostics.some(d => d.code === 'CapabilityViolation')).toBe(true)
  })

  it('keeps valid columns when a sibling or optional field is invalid and retains the first duplicate', () => {
    const local = definition() as unknown as { schemaVersion: number; tableKey: string; columns: unknown[]; pagination: unknown }
    local.columns = [local.columns[0], { id: 'Name', field: 'name', title: 'First', width: 'wide', visible: 'yes', configurable: editable }, { id: 'Name', field: 'other', title: 'Duplicate' }, { id: 'Bad', title: 'Missing field' }, { id: 'Code', field: 'code', title: 'Code', configurable: editable }]
    const result = resolveConfiguration({ definition: local })
    expect(result.columns.map(c => c.id)).toEqual(['Id', 'Name', 'Code'])
    expect(result.columns[1]).toMatchObject({ title: 'First' })
    expect(result.columns[1]?.width).toBeUndefined()
    expect(result.columns[1]?.visible).toBeUndefined()
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(4)
  })

  it('does not allow remote capability or access expansion and excludes inaccessible columns', () => {
    const local = definition([{ id: 'A', field: 'a', title: 'A', width: 100 }, { id: 'Secret', field: 'secret', title: 'Secret', access: false, configurable: editable }])
    const result = resolveConfiguration({ definition: local, remoteOverride: { columns: { A: { width: 400, configurable: editable }, Secret: { access: true }, Injected: { field: 'private' } } }, preference: preference({ A: { visible: false } }), viewColumns: { A: { fixed: 'right' } } })
    expect(result.columns).toHaveLength(1)
    expect(result.columns[0]).toMatchObject({ id: 'A', width: 100, configurable: {} })
    expect(result.columns[0]?.visible).toBeUndefined()
    expect(result.diagnostics.some(d => d.path.includes('Secret'))).toBe(true)
  })

  it('never reads feature details and retains opaque local function references', () => {
    const render = () => 'rendered'
    const local = definition([{ id: 'Name', field: 'name', title: 'Name', formatter: render } as ColumnDefinition])
    Object.defineProperty(local, 'features', { enumerable: true, get() { throw new Error('Feature details read before gate') } })
    const remote = { columns: { Name: { width: 180 } }, get features() { throw new Error('Remote feature details read') } }
    const result = resolveConfiguration({ definition: local, remoteOverride: remote })
    expect(result.columns[0]).toMatchObject({ id: 'Name', formatter: render })
  })

  it('validates page size at each layer and preserves the most recent legal value', () => {
    const result = resolveConfiguration({ definition: definition(), remoteOverride: { pagination: { pageSize: 50 } }, preference: preference({}, { pagination: { pageSize: 37 } }) })
    expect(result.pageSize).toBe(50)
    expect(result.pageSizeOptions).toEqual([20, 50, 100])
    expect(result.diagnostics.some(d => d.path.includes('pageSize'))).toBe(true)
    expect(resolveConfiguration({ definition: definition(), preference: preference({}, { pagination: { pageSize: 100 } }) }).pageSize).toBe(100)
  })

  it('returns only the legal preference delta, keeping view overrides separate', () => {
    const result = resolveConfiguration({ definition: definition(), preference: preference({ Id: { visible: false }, Name: { width: 210, visible: true }, Unknown: { width: 250 } }, { pagination: { pageSize: 37 } }), viewColumns: { Name: { width: 260 } } })
    expect(result.preference).toEqual(preference({ Name: { width: 210 } }))
    expect(result.columns[1]?.width).toBe(260)
    expect(result.baseColumns[1]?.width).toBe(160)
  })

  it('exposes the remote page size default separately from a personal page size', () => {
    const result = resolveConfiguration({ definition: definition(), remoteOverride: { pagination: { pageSize: 50 } }, preference: preference({}, { pagination: { pageSize: 100 } }) })
    expect(result.basePageSize).toBe(50)
    expect(result.pageSize).toBe(100)
    expect(result.preference).toEqual(preference({}, { pagination: { pageSize: 100 } }))
  })

  it('recovers pagination siblings and invalid remote envelopes without losing the core', () => {
    const local = definition()
    local.pagination = { pageSize: 37, pageSizeOptions: [0, 50, 50, 100] }
    const diagnostics: ConfigDiagnostic[] = []
    const result = resolveConfiguration({ definition: local, remoteOverride: '{bad' }, d => diagnostics.push(d))
    expect(result.pageSizeOptions).toEqual([50, 100])
    expect(result.pageSize).toBe(50)
    expect(result.columns).toHaveLength(3)
    expect(diagnostics).toEqual(result.diagnostics)
  })

  it('ignores stale IDs while preserving stable IDs that coincide with prototype keys', () => {
    const local = definition([{ id: '__proto__', field: 'name', title: 'Name', width: 100, configurable: editable }, { id: 'constructor', field: 'code', title: 'Code', configurable: editable }])
    const result = resolveConfiguration({ definition: local, preference: '{"kind":"business-table-preference","schemaVersion":3,"tableKey":"assets","columns":{"__proto__":{"width":220},"constructor":{"visible":false},"Removed":{"width":100}}}' })
    expect(result.columns[0]?.width).toBe(220)
    expect(result.columns[1]?.visible).toBe(false)
    expect(result.diagnostics.some(d => d.path.includes('Removed'))).toBe(true)
  })
})

describe('preference deltas', () => {
  it('removes unchanged snapshot values and forbidden fields, retaining legal changes only', () => {
    const base = resolveConfiguration({ definition: definition() }).baseColumns
    const config: TableConfig = { schemaVersion: 1, tableKey: 'assets', columns: { Id: { visible: false, fixed: false, order: 2, width: 100 }, Name: { title: '名称', visible: true, fixed: false, order: 1, align: 'left', width: 220 }, Code: { width: 120, order: 2 }, Unknown: { width: 250 } }, pageSize: 20 }
    expect(createPreferenceDelta('assets', base, config, 20)).toEqual(preference({ Name: { width: 220 } }))
    expect(config.columns.Id?.visible).toBe(false)
  })

  it('stores guarded column order and a changed page size in the v3 envelope', () => {
    const base = resolveConfiguration({ definition: definition() }).baseColumns
    const config: TableConfig = { schemaVersion: 1, tableKey: 'assets', columns: { Id: { order: 2 }, Name: { order: 2 }, Code: { order: 0 } }, pageSize: 50 }
    const delta = createPreferenceDelta('assets', base, config, 20)
    expect(delta).toEqual(preference({ Name: { order: 2 }, Code: { order: 1 } }, { pagination: { pageSize: 50 } }))
    expect(resolveConfiguration({ definition: definition(), preference: delta }).columns.map(c => c.id)).toEqual(['Id', 'Code', 'Name'])
  })

  it('retains the effective order when the supplied configuration is a sparse delta', () => {
    const base = resolveConfiguration({ definition: definition() }).baseColumns
    const config: TableConfig = { schemaVersion: 1, tableKey: 'assets', columns: { Code: { order: 0 } } }
    const delta = createPreferenceDelta('assets', base, config)
    expect(delta).toEqual(preference({ Name: { order: 2 }, Code: { order: 1 } }))
    expect(resolveConfiguration({ definition: definition(), preference: delta }).columns.map(c => c.id)).toEqual(['Id', 'Code', 'Name'])
  })
})
