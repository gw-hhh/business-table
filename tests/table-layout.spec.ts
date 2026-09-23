import { expect, it } from 'vitest'
import { resolveColumnLayout } from '../src/presentation/columnLayout'
import { resolveConfiguration } from '../src/config/schema'

const columns = [
  { id: 'id', width: 194, fixed: 'left' as const },
  { id: 'name', width: 280, minWidth: 180, grow: 1 },
  { id: 'amount', width: 180 }, { id: 'status', width: 112 },
  { id: 'owner', width: 120 }, { id: 'date', width: 136 },
  { id: 'actions', kind: 'actions' as const, width: 196, fixed: 'right' as const },
]

it('fills the measured viewport while keeping the declared widths immutable', () => {
  const input = columns.map(column => Object.freeze({ ...column }))
  const layout = resolveColumnLayout(input, 1375)
  expect(layout.totalWidth).toBe(1375)
  expect(layout.widths.name).toBe(437)
  expect(layout.widths.id).toBe(194)
  expect(layout.widths.actions).toBe(196)
  expect(input[1]!.width).toBe(280)
  expect(resolveColumnLayout(input, 1855).widths.name).toBe(917)
})

it('reallocates after width, visibility and utility-column changes', () => {
  const changed = columns.map(column => column.id === 'owner' ? { ...column, width: 160 } : column)
  expect(resolveColumnLayout(changed, 1375).widths.name).toBe(397)
  const hidden = changed.map(column => column.id === 'name' ? { ...column, visible: false } : column)
  const layout = resolveColumnLayout(hidden, 1375, 44 + 48)
  expect(layout.widths.name).toBeUndefined()
  expect(layout.widths.amount).toBe(485)
  expect(layout.totalWidth).toBe(1375)
})

it('preserves overflow widths and includes every fixed column in the same layout', () => {
  const pinned = columns.map(column => column.id === 'name' ? { ...column, fixed: 'left' as const } : column)
  expect(resolveColumnLayout(pinned, 1855).widths.name).toBe(917)
  expect(resolveColumnLayout(pinned, 900).totalWidth).toBe(1218)
  expect(resolveColumnLayout(pinned, 900).widths.name).toBe(280)
})

it('supports weighted growth, minimum widths and exact integer totals', () => {
  const layout = resolveColumnLayout([{ id: 'a', minWidth: 100, grow: 1 }, { id: 'b', width: 100, grow: 2 }], 301)
  expect(layout.widths).toEqual({ a: 133, b: 168 })
  expect(layout.totalWidth).toBe(301)
  expect(resolveColumnLayout([], 600, 44).totalWidth).toBe(44)
})

it('keeps growth as developer configuration, outside saved user width preferences', () => {
  const definition = { schemaVersion: 3 as const, tableKey: 'layout', columns: [{ id: 'name', field: 'name', title: 'Name', width: 280, grow: 1, configurable: { width: true } }] }
  const resolved = resolveConfiguration({ definition })
  expect(resolved.columns[0]).toMatchObject({ grow: 1, width: 280 })
})
