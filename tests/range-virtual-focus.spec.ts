import { afterEach, describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createRangeSelectionContext, type RangePoint } from '../src/features/range-selection/context'
import { rangeKey } from '../src/features/range-selection/surface'

const disposers: (() => void)[] = []
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren() })
function deferred() {
  let resolve!: () => void, reject!: (cause: Error) => void
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
function fixture(reveal: (point: RangePoint) => Promise<void>) {
  const surface = document.createElement('div')
  const outside = document.createElement('button')
  document.body.append(surface, outside)
  function cell(id: string) {
    const element = document.createElement('div')
    element.tabIndex = 0
    element.dataset.rangeRow = id
    element.dataset.rangeColumn = 'name'
    // jsdom has no layout; expose only the visibility consumed by the adapter.
    element.getClientRects = () => Object.assign([new DOMRect(0, 0, 40, 20)], { item: (index: number) => index === 0 ? new DOMRect(0, 0, 40, 20) : null })
    element.scrollIntoView = () => {}
    surface.append(element)
    return element
  }
  const origin = cell('a'), scope = effectScope(), cleanups: (() => void)[] = []
  const context = scope.run(() => createRangeSelectionContext({
    rows: () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    columns: () => [{ id: 'name', field: 'id', title: '名称' }], rowId: row => String(row.id),
    definition: () => undefined, identity: () => 'table',
  }, { isActive: () => true, close: () => {}, onDispose: fn => cleanups.push(fn) }))!
  disposers.push(() => { cleanups.forEach(dispose => dispose()); scope.stop() })
  const errors: unknown[] = []
  surface.addEventListener('keydown', event => rangeKey(event, surface, context, cause => errors.push(cause), reveal))
  context.toggle()
  context.begin({ rowId: 'a', columnId: 'name' })
  context.end()
  origin.focus()
  const key = (name = 'ArrowDown') => origin.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
  return { surface, outside, origin, context, errors, cell, key }
}

describe('virtual range keyboard focus', () => {
  it('focuses the revealed row when virtualization removes the original focused cell', async () => {
    const task = deferred(), f = fixture(() => task.promise)
    f.key()
    f.origin.remove()
    const next = f.cell('b')
    task.resolve()
    await flushPromises()
    expect(document.activeElement).toBe(next)
    expect(f.context.isSelected('b', 'name')).toBe(true)
  })

  it('preserves focus moved to an outside control while a row is being revealed', async () => {
    const task = deferred(), f = fixture(() => task.promise)
    f.key()
    f.outside.focus()
    f.cell('b')
    task.resolve()
    await flushPromises()
    expect(document.activeElement).toBe(f.outside)
    expect(f.context.isSelected('b', 'name')).toBe(true)
  })

  it('lets only the latest reveal move focus when results arrive out of order', async () => {
    const first = deferred(), second = deferred()
    const f = fixture(point => point.rowId === 'b' ? first.promise : second.promise)
    f.key()
    f.key()
    const latest = f.cell('c')
    second.resolve()
    await flushPromises()
    f.cell('b')
    first.resolve()
    await flushPromises()
    expect(document.activeElement).toBe(latest)
    expect(f.context.isSelected('c', 'name')).toBe(true)
  })

  it('does not restore focus after Escape clears the pending selection', async () => {
    const task = deferred(), f = fixture(() => task.promise)
    f.key()
    f.key('Escape')
    f.cell('b')
    task.resolve()
    await flushPromises()
    expect(document.activeElement).toBe(f.origin)
    expect(f.context.count).toBe(0)
  })

  it('reports a current reveal failure without moving focus', async () => {
    const task = deferred(), f = fixture(() => task.promise), error = new Error('reveal failed')
    f.key()
    task.reject(error)
    await flushPromises()
    expect(f.errors).toEqual([error])
    expect(document.activeElement).toBe(f.origin)
  })

  it('ignores failures from an earlier reveal after a new move succeeds', async () => {
    const first = deferred(), second = deferred()
    const f = fixture(point => point.rowId === 'b' ? first.promise : second.promise)
    f.key()
    f.key()
    const latest = f.cell('c')
    second.resolve()
    await flushPromises()
    first.reject(new Error('stale reveal failed'))
    await flushPromises()
    expect(f.errors).toEqual([])
    expect(document.activeElement).toBe(latest)
  })

  it.each(['resolve', 'reject'] as const)('ignores a disconnected surface when reveal promises %s', async settle => {
    const task = deferred(), f = fixture(() => task.promise)
    f.key()
    f.surface.remove()
    f.outside.focus()
    f.cell('b')
    if (settle === 'resolve') task.resolve()
    else task.reject(new Error('detached reveal failed'))
    await flushPromises()
    expect(f.errors).toEqual([])
    expect(document.activeElement).toBe(f.outside)
  })
})
