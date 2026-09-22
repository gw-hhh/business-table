import { expect, it } from 'vitest'
import { quotationColumns } from '../demo/quotation/model'

it('uses the legacy column proportions instead of widening the ID and status columns', () => {
  const columns = Object.fromEntries(quotationColumns.map(column => [column.id, column]))
  expect(columns.id.width).toBe(194)
  expect(columns.name.minWidth).toBe(280)
  expect(columns.name.width).toBeUndefined() // The project column takes available space.
  expect(columns.amount.width).toBe(180)
  expect(columns.status.width).toBe(112)
  expect(columns.status.minWidth).toBe(102)
  expect(columns.owner.width).toBe(120)
  expect(columns.date.width).toBe(136)
  expect(columns.id.configurable?.visible).toBe(false)
})
