import type { ColumnConfig } from '../types'

type LayoutColumn = Pick<ColumnConfig, 'id' | 'kind' | 'width' | 'minWidth' | 'visible' | 'fixed' | 'grow'>

/** Render widths are derived from the viewport; saved widths remain the minimum requested layout. */
export function resolveColumnLayout(columns: readonly LayoutColumn[], viewportWidth: number, reservedWidth = 0) {
  const visible = columns.filter(column => column.visible !== false)
  const widths: Record<string, number> = Object.create(null)
  for (const column of visible) widths[column.id] = Math.max(column.minWidth ?? 0, column.width ?? column.minWidth ?? 120)
  const baseWidth = visible.reduce((total, column) => total + widths[column.id]!, reservedWidth)
  const remaining = Math.max(0, Math.floor(viewportWidth - baseWidth))
  const weighted = visible.filter(column => Number.isFinite(column.grow) && (column.grow ?? 0) > 0)
  const fallback = visible.find(column => column.kind !== 'actions' && !column.fixed && column.grow !== 0)
    ?? visible.find(column => column.kind !== 'actions' && column.grow !== 0)
    ?? visible.find(column => column.grow !== 0)
  const flexible = weighted.length ? weighted : fallback ? [fallback] : []
  const weight = flexible.reduce((sum, column) => sum + (column.grow || 1), 0)
  let allocated = 0
  for (const [index, column] of flexible.entries()) {
    const extra = index === flexible.length - 1 ? remaining - allocated : Math.floor(remaining * (column.grow || 1) / weight)
    widths[column.id]! += extra
    allocated += extra
  }
  return { widths, totalWidth: baseWidth + allocated }
}
