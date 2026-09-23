import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { Component } from 'vue'
import BusinessTable from '../src/BusinessTable.vue'
import type { TableRuntime } from '../src/runtime/useTableRuntime'
import type { DataSource, RowData } from '../src/types'

const wrappers: VueWrapper[] = []
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))
const baseRows = [{ id: '1', name: '甲' }, { id: '2', name: '甲' }, { id: '3', name: '乙' }]
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (cause: unknown) => void; const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail }); return { promise, resolve, reject } }
async function setup(extra: Record<string, unknown> = {}) {
  const onSelectionChange = vi.fn()
  const wrapper = mount(BusinessTable as unknown as Component, {
    props: { tableKey: 'selection', columns: [{ id: 'name', field: 'name', title: '名称' }], data: baseRows,
      selection: true, pagination: { pageSize: 1, pageSizeOptions: [1, 10] }, onSelectionChange, ...extra },
    global: { stubs: { 'vxe-table': { template: '<div><slot /></div>' }, 'vxe-column': true } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  const api = wrapper.vm as unknown as { selectQuery(): Promise<void>; getRuntime(): TableRuntime }
  return { wrapper, api, runtime: api.getRuntime(), onSelectionChange }
}
function source(readAll: DataSource<RowData>['readAll']): DataSource<RowData> { return { query: async () => ({ rows: baseRows.slice(0, 1), total: 3 }), readAll } }

describe('select all query results', () => {
  it('exposes one command for local query results across pages and retains raw rows', async () => {
    const { api, runtime } = await setup()
    await runtime.setQuery({ filters: [{ field: 'name', operator: 'eq', value: '甲' }] })
    expect(runtime.rows.value).toHaveLength(1)
    expect(typeof runtime.selectQuery).toBe('function')
    await api.selectQuery()
    expect(runtime.getSelectedRows()).toEqual(baseRows.slice(0, 2))
  })

  it('reads the complete current query remotely and preserves existing selection on failure', async () => {
    const readAll = vi.fn(async () => { throw new Error('offline') })
    const { runtime, onSelectionChange } = await setup({ dataSource: source(readAll) })
    await runtime.setQuery({ filters: [{ field: 'name', operator: 'eq', value: '甲' }] })
    runtime.selectRow(baseRows[0]!, true)
    const before = onSelectionChange.mock.calls.length
    await expect(runtime.selectQuery()).rejects.toThrow('offline')
    expect(readAll).toHaveBeenCalledWith(expect.objectContaining({ filters: [{ field: 'name', operator: 'eq', value: '甲' }], signal: expect.any(AbortSignal) }), expect.objectContaining({ limit: 10000, signal: expect.any(AbortSignal) }))
    expect(runtime.getSelectedRows()).toEqual([baseRows[0]])
    expect(onSelectionChange).toHaveBeenCalledTimes(before)
  })

  it('does not substitute the current page when complete remote reads are unavailable', async () => {
    const { runtime } = await setup({ dataSource: source(undefined) })
    runtime.selectRow(baseRows[2]!, true)
    await expect(runtime.selectQuery()).rejects.toThrow('完整结果接口')
    expect(runtime.getSelectedRows()).toEqual([baseRows[2]])
  })

  it.each(['query', 'table', 'provider', 'selection'] as const)('does not publish an obsolete result after %s changes', async change => {
    const pending = deferred<RowData[]>()
    const readAll = vi.fn<NonNullable<DataSource<RowData>['readAll']>>((_query, _options) => pending.promise)
    const { runtime, wrapper } = await setup({ dataSource: source(readAll) })
    const request = runtime.selectQuery()
    await flushPromises()
    if (change === 'query') await runtime.setQuery({ keyword: 'changed' })
    if (change === 'table') await wrapper.setProps({ tableKey: 'another-table' })
    if (change === 'provider') await wrapper.setProps({ dataSource: source(async () => [baseRows[2]!]) })
    if (change === 'selection') { await wrapper.setProps({ selection: false }); await wrapper.setProps({ selection: true }) }
    await flushPromises()
    expect(readAll.mock.calls[0]![1]!.signal!.aborted).toBe(true)
    runtime.selectRow(baseRows[2]!, true)
    pending.resolve(baseRows.slice(0, 2))
    await request
    expect(runtime.getSelectedRows()).toEqual([baseRows[2]])
  })

  it('uses the latest request and does not undo an explicit clear', async () => {
    const first = deferred<RowData[]>(), second = deferred<RowData[]>(), third = deferred<RowData[]>()
    const readAll = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise)
    const { runtime } = await setup({ dataSource: source(readAll) })
    const oldRequest = runtime.selectQuery(), currentRequest = runtime.selectQuery()
    second.resolve([baseRows[2]!]); await currentRequest
    first.resolve(baseRows.slice(0, 2)); await oldRequest
    expect(runtime.getSelectedRows()).toEqual([baseRows[2]])
    const clearRequest = runtime.selectQuery()
    runtime.clearSelection()
    third.resolve(baseRows); await clearRequest
    expect(runtime.getSelectedRows()).toEqual([])
  })

  it('aborts on unmount and never emits a late selection', async () => {
    const pending = deferred<RowData[]>(), readAll = vi.fn<NonNullable<DataSource<RowData>['readAll']>>((_query, _options) => pending.promise)
    const { runtime, wrapper, onSelectionChange } = await setup({ dataSource: source(readAll) })
    const request = runtime.selectQuery()
    wrapper.unmount()
    pending.resolve(baseRows); await request
    expect(readAll.mock.calls[0]![1]!.signal!.aborted).toBe(true)
    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  it('rejects selection when its gate is disabled without calling the provider', async () => {
    const readAll = vi.fn(async () => baseRows)
    const { runtime } = await setup({ selection: false, dataSource: source(readAll) })
    await expect(runtime.selectQuery()).rejects.toThrow('选择')
    expect(readAll).not.toHaveBeenCalled()
  })
})
