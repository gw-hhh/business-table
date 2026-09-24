import { computed, ref, shallowReactive, watch } from 'vue'
import type { ColumnConfig, RowData } from '../../types'
import { getValue } from '../../runtime/value'
import { evaluateCell } from '../columns/evaluate'
import { summarizeNumbers } from '../reports/model'

export interface RangeSelectionDefinition { summaryColumns?: readonly { columnId: string; label?: string }[] }
export interface RangePoint { rowId: string; columnId: string }
export type RangeDirection = 'left' | 'right' | 'up' | 'down'
export interface RangeStatistic {
  column: ColumnConfig; label: string
  values: NonNullable<ReturnType<typeof summarizeNumbers>>
}
export interface RangeSelectionContext {
  readonly enabled: boolean; readonly count: number; readonly statistics: readonly RangeStatistic[]
  readonly manualCopy: string | undefined; readonly copying: boolean
  toggle(): void; clear(): void; end(): void
  begin(point: RangePoint): void; extend(point: RangePoint): void
  move(point: RangePoint, direction: RangeDirection, expand: boolean): RangePoint | undefined
  isSelected(rowId: string, columnId: string): boolean
  copy(): Promise<void>; dismissCopy(): void
}
export function createRangeSelectionContext(input: {
  rows(): readonly RowData[]; columns(): readonly ColumnConfig[]; rowId(row: RowData): string
  definition(): RangeSelectionDefinition | undefined; identity(): unknown
  copyText?: (text: string) => Promise<void>
}, controls: { isActive(): boolean; isDisabled?(): boolean; close(): void; onDispose(fn: () => void): void }): RangeSelectionContext {
  const enabled = ref(false), anchor = ref<RangePoint>(), focus = ref<RangePoint>(), copying = ref(false), manualCopy = ref<string>()
  let dragging = false, disposed = false, revision = 0
  const columns = computed(() => input.columns().filter(column => column.kind !== 'actions' && column.visible !== false))
  function active() { return !disposed && controls.isActive() && !controls.isDisabled?.() }
  function guard() { if (!active()) throw new Error('区域选择已关闭或只读。') }
  function locate(point: RangePoint) {
    const row = input.rows().findIndex(item => input.rowId(item) === point.rowId), column = columns.value.findIndex(item => item.id === point.columnId)
    return row < 0 || column < 0 ? undefined : { row, column }
  }
  const bounds = computed(() => {
    if (!enabled.value || !active() || !anchor.value || !focus.value) return undefined
    const a = locate(anchor.value), b = locate(focus.value)
    return a && b ? { top: Math.min(a.row, b.row), bottom: Math.max(a.row, b.row), left: Math.min(a.column, b.column), right: Math.max(a.column, b.column) } : undefined
  })
  const cells = computed(() => {
    const range = bounds.value
    if (!range) return []
    return input.rows().slice(range.top, range.bottom + 1).flatMap(row => columns.value.slice(range.left, range.right + 1).map(column => ({ row, column })))
  })
  const statistics = computed<RangeStatistic[]>(() => {
    if (!enabled.value || !active()) return []
    const declared = input.definition()?.summaryColumns ?? columns.value.filter(column => ['number', 'currency', 'percent'].includes(column.type ?? '')).map(column => ({ columnId: column.id }))
    const seen = new Set<string>()
    return declared.flatMap(item => {
      const column = columns.value.find(column => column.id === item.columnId)
      if (!column || seen.has(column.id)) return []
      seen.add(column.id)
      const values = summarizeNumbers(cells.value.filter(cell => cell.column.id === column.id).map(cell => getValue(cell.row, column.field)))
      return values ? [{ column, label: 'label' in item && typeof item.label === 'string' ? item.label : column.title, values }] : []
    })
  })
  function clear() { revision++; anchor.value = undefined; focus.value = undefined; dragging = false; manualCopy.value = undefined }
  function begin(point: RangePoint) {
    guard(); if (!enabled.value || !locate(point)) return
    revision++; anchor.value = { ...point }; focus.value = { ...point }; dragging = true; manualCopy.value = undefined
  }
  function move(point: RangePoint, direction: RangeDirection, expand: boolean) {
    guard(); if (!enabled.value) return
    const origin = focus.value ?? point, current = locate(origin)
    if (!current) return
    const rowIndex = Math.max(0, Math.min(input.rows().length - 1, current.row + (direction === 'down' ? 1 : direction === 'up' ? -1 : 0)))
    const columnIndex = Math.max(0, Math.min(columns.value.length - 1, current.column + (direction === 'right' ? 1 : direction === 'left' ? -1 : 0)))
    const next = { rowId: input.rowId(input.rows()[rowIndex]!), columnId: columns.value[columnIndex]!.id }
    revision++; anchor.value = expand ? anchor.value ?? { ...origin } : next; focus.value = next; dragging = false; manualCopy.value = undefined
    return { ...next }
  }
  function tsv() {
    const range = bounds.value
    if (!range) return ''
    const escape = (text: string) => /["\t\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
    return input.rows().slice(range.top, range.bottom + 1).map(row => columns.value.slice(range.left, range.right + 1)
      .map(column => escape(evaluateCell(row, column, input.columns()).text)).join('\t')).join('\r\n')
  }
  const stops = [
    watch(() => [input.identity(), input.rows(), input.columns()], clear, { deep: true, flush: 'sync' }),
    watch(() => active(), valid => { if (!valid) { enabled.value = false; clear() } }, { flush: 'sync' }),
  ]
  const endDrag = () => { dragging = false }
  if (typeof window !== 'undefined') { window.addEventListener('pointerup', endDrag); window.addEventListener('blur', endDrag) }
  controls.onDispose(() => { disposed = true; enabled.value = false; clear(); stops.forEach(stop => stop()); if (typeof window !== 'undefined') { window.removeEventListener('pointerup', endDrag); window.removeEventListener('blur', endDrag) } })
  return shallowReactive({
    get enabled() { return enabled.value && active() }, get count() { return cells.value.length },
    get statistics() { return statistics.value }, get manualCopy() { return manualCopy.value }, get copying() { return copying.value },
    toggle() { guard(); enabled.value = !enabled.value; clear(); if (!enabled.value) controls.close() },
    clear, begin, end() { dragging = false }, move,
    extend(point: RangePoint) { guard(); if (enabled.value && dragging && locate(point)) { revision++; focus.value = { ...point } } },
    isSelected(rowId: string, columnId: string) {
      const range = bounds.value, point = locate({ rowId, columnId })
      return Boolean(range && point && point.row >= range.top && point.row <= range.bottom && point.column >= range.left && point.column <= range.right)
    },
    async copy() {
      guard(); if (!enabled.value || !cells.value.length || copying.value) return
      const text = tsv(), current = revision
      copying.value = true; manualCopy.value = undefined
      try { await (input.copyText ? input.copyText(text) : navigator.clipboard.writeText(text)) }
      catch { if (active() && current === revision) manualCopy.value = text }
      finally { copying.value = false }
    },
    dismissCopy() { manualCopy.value = undefined },
  })
}
