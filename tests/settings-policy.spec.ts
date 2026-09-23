import { describe, expect, it } from 'vitest'
import { resolveControlAccess } from '../src/config/access'
import { getColumnSectionAccess, guardSettingsColumnPatch, guardSettingsCommit, resolveSettingsPolicy } from '../src/features/settings/policy'
import { defaultPresentation } from '../src/features/presentation/model'
import type { ColumnConfig } from '../src/types'

describe('settings visibility and editing policy', () => {
  it('hides undeclared controls and makes only explicit disabled controls read-only', () => {
    expect(resolveControlAccess(undefined)).toEqual({ visible: false, disabled: false })
    expect(resolveControlAccess(false)).toEqual({ visible: false, disabled: false })
    expect(resolveControlAccess(true)).toEqual({ visible: true, disabled: false })
    expect(resolveControlAccess({ enabled: true, visible: false })).toEqual({ visible: false, disabled: false })
    expect(resolveControlAccess({ enabled: true, disabled: true })).toEqual({ visible: true, disabled: true })
    expect(resolveControlAccess(undefined, true).visible).toBe(false)
    expect(resolveControlAccess({ enabled: true, disabled: true }, { disabled: false }).disabled).toBe(true)
  })
  it('uses the same module and column guards for edits and restored backups', () => {
    const column: ColumnConfig = { id: 'name', field: 'name', title: '名称', configurable: { rename: true, mapping: true, template: { enabled: true, disabled: true } } }
    const policy = resolveSettingsPolicy({ pages: { columns: true }, columnSections: { basic: true, mapping: { enabled: true, disabled: true }, template: true } })
    expect(getColumnSectionAccess(column, 'filter', policy).visible).toBe(false)
    expect(getColumnSectionAccess(column, 'template', policy)).toEqual({ visible: true, disabled: true })
    expect(guardSettingsColumnPatch(column, { title: '新名称', width: 200, mapping: { enabled: false, type: 'text', presentation: 'text', empty: '', unknown: '', items: [] }, template: { enabled: false, document: { ops: [] } } }, policy)).toEqual({ title: '新名称' })
  })
  it('preserves hidden and read-only state when a caller submits a complete snapshot', () => {
    const current = { columns: [] as ColumnConfig[], sorts: [{ field: 'name', order: 'asc' as const }], presentation: defaultPresentation() }
    const proposed = defaultPresentation(); proposed.appearance.fontSize = 22; proposed.toolbar.gap = 12; proposed.rowActions.maxInline = 5
    const result = guardSettingsCommit({ columns: {}, sorts: [], presentation: proposed }, current,
      resolveSettingsPolicy({ pages: { appearance: { enabled: true, disabled: true }, toolbar: true } }))
    expect(result.presentation.appearance).toEqual(current.presentation.appearance)
    expect(result.presentation.rowActions).toEqual(current.presentation.rowActions)
    expect(result.presentation.toolbar.gap).toBe(12)
    expect(result.sorts).toEqual(current.sorts)
  })
})
