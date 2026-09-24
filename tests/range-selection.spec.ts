import { effectScope, reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { ColumnConfig, RowData } from '../src/types'
import { createRangeSelectionContext } from '../src/features/range-selection/context'
import { rangePointer } from '../src/features/range-selection/surface'

function fixture(copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)) {
  const source = reactive({
    rows: [{ id: 'a', name: '甲\t乙', amount: '9007199254740993.01' }, { id: 'b', name: '"丙"\n丁', amount: '-0.01' }] as RowData[],
    columns: [{ id: 'name', field: 'name', title: '名称' }, { id: 'amount', field: 'amount', title: '金额', type: 'number' }, { id: 'hidden', field: 'id', title: '隐藏', visible: false }, { id: 'actions', field: 'id', title: '操作', kind: 'actions' }] as ColumnConfig[],
    identity: 1, active: true, disabled: false,
  })
  const scope = effectScope(), disposers: (() => void)[] = []
  const close = vi.fn()
  const context = scope.run(() => createRangeSelectionContext({
    rows: () => source.rows, columns: () => source.columns, rowId: row => String(row.id),
    definition: () => ({ summaryColumns: [{ columnId: 'amount', label: '金额' }] }),
    identity: () => source.identity, copyText,
  }, { isActive: () => source.active, isDisabled: () => source.disabled, close, onDispose: fn => disposers.push(fn) }))!
  return { source, context, copyText, close, dispose: () => { disposers.forEach(fn => fn()); scope.stop() } }
}

describe('current-page range selection', () => {
  it('starts from the cell padding but preserves interactive child actions', () => {
    const f = fixture(); f.context.toggle()
    const cell = document.createElement('div'); cell.className = 'vxe-body--column'
    cell.innerHTML = '<div data-range-row="a" data-range-column="name"><button>打开</button></div>'
    cell.addEventListener('pointerdown', event => rangePointer(event, f.context, 'start'))
    cell.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    expect(f.context.count).toBe(1)
    f.context.clear()
    cell.querySelector('button')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    expect(f.context.count).toBe(0)
    f.dispose()
  })
  it('continues keyboard expansion from the drag endpoint even when DOM focus stays on the anchor', () => {
    const f = fixture(); f.context.toggle()
    f.context.begin({ rowId: 'a', columnId: 'name' }); f.context.extend({ rowId: 'b', columnId: 'name' }); f.context.end()
    expect(f.context.move({ rowId: 'a', columnId: 'name' }, 'right', true)).toEqual({ rowId: 'b', columnId: 'amount' })
    expect(f.context.count).toBe(4)
    f.dispose()
  })
  it('selects a reverse rectangle of data cells without selecting business rows', () => {
    const f = fixture(); f.context.toggle()
    f.context.begin({ rowId: 'b', columnId: 'amount' }); f.context.extend({ rowId: 'a', columnId: 'name' }); f.context.end()
    expect(f.context.count).toBe(4)
    expect(f.context.isSelected('a', 'amount')).toBe(true)
    expect(f.context.isSelected('b', 'hidden')).toBe(false)
    expect(f.context.isSelected('b', 'actions')).toBe(false)
    expect(f.source.rows).toHaveLength(2)
    f.dispose()
  })
  it('expands with Shift arrows, clamps at edges and moves to a single cell otherwise', () => {
    const f = fixture(); f.context.toggle(); f.context.begin({ rowId: 'a', columnId: 'name' }); f.context.end()
    expect(f.context.move({ rowId: 'a', columnId: 'name' }, 'right', true)).toEqual({ rowId: 'a', columnId: 'amount' })
    f.context.move({ rowId: 'a', columnId: 'amount' }, 'down', true)
    expect(f.context.count).toBe(4)
    expect(f.context.move({ rowId: 'b', columnId: 'amount' }, 'right', false)).toEqual({ rowId: 'b', columnId: 'amount' })
    expect(f.context.count).toBe(1)
    f.context.clear(); expect(f.context.count).toBe(0); expect(f.context.enabled).toBe(true)
    f.dispose()
  })
  it('clears selection on query/page/data/column changes while keeping the mode enabled', () => {
    const f = fixture(); f.context.toggle()
    f.context.begin({ rowId: 'a', columnId: 'name' }); f.source.identity++
    expect(f.context.count).toBe(0); expect(f.context.enabled).toBe(true)
    f.context.begin({ rowId: 'a', columnId: 'name' }); f.source.columns[0]!.visible = false
    expect(f.context.count).toBe(0)
    f.context.begin({ rowId: 'a', columnId: 'amount' }); f.source.rows[0]!.amount = 123
    expect(f.context.count).toBe(0)
    f.dispose()
  })
  it('keeps exact numeric totals and quotes displayed TSV without headers', async () => {
    const f = fixture(); f.context.toggle(); f.context.begin({ rowId: 'a', columnId: 'name' }); f.context.extend({ rowId: 'b', columnId: 'amount' }); f.context.end()
    expect(f.context.statistics[0]?.values.sum).toBe('9007199254740993')
    expect(f.context.statistics[0]?.values.min).toBe('-0.01')
    await f.context.copy()
    const text = f.copyText.mock.calls[0]![0]
    expect(text).toContain('"甲\t乙"\t9,007,199,254,740,993.01\r\n"""丙""\n丁"\t-0.01')
    expect(text).not.toContain('名称')
    f.dispose()
  })
  it('offers the same text for manual copy when clipboard access fails', async () => {
    const f = fixture(vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('denied')))
    f.context.toggle(); f.context.begin({ rowId: 'a', columnId: 'name' }); f.context.end()
    await f.context.copy()
    expect(f.context.manualCopy).toBe('"甲\t乙"')
    expect(f.context.count).toBe(1)
    f.context.dismissCopy(); expect(f.context.manualCopy).toBeUndefined()
    f.context.toggle(); expect(f.context.enabled).toBe(false); expect(f.close).toHaveBeenCalled()
    f.dispose()
  })
  it('rejects disabled/revoked/stale commands and ignores unknown cells', async () => {
    const f = fixture(); f.source.disabled = true
    expect(() => f.context.toggle()).toThrow()
    f.source.disabled = false; f.context.toggle(); f.context.begin({ rowId: 'missing', columnId: 'name' })
    expect(f.context.count).toBe(0)
    f.context.begin({ rowId: 'a', columnId: 'amount' }); f.source.active = false
    await expect(f.context.copy()).rejects.toThrow()
    expect(f.copyText).not.toHaveBeenCalled()
    f.dispose(); expect(() => f.context.toggle()).toThrow()
  })
})
