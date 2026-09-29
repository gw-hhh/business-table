import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, markRaw, nextTick, reactive, shallowReactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { useQueryRuntime } from '../src/runtime/query'
import { useTableRuntime, type TableRuntime, type TableRuntimeInput } from '../src/runtime/useTableRuntime'
import { createRegistry } from '../src/runtime/registry'
import type { ColumnConfig, Query } from '../src/types'

type Row = { id: number; name: string; status?: number | string }
const wrappers: VueWrapper[] = []
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function create(extra: Partial<TableRuntimeInput<Row>> = {}, shallow = false) {
  let runtime!: TableRuntime<Row>
  const source: TableRuntimeInput<Row> = {
    columns: [{ id: 'name', field: 'name', title: '名称' }],
    data: [{ id: 1, name: '甲' }, { id: 2, name: '乙' }, { id: 3, name: '丙' }],
    pagination: { pageSize: 1, pageSizeOptions: [1, 2] },
    searchDefinition: { items: [{ id: 'q', kind: 'keyword' }] },
    ...extra,
  }
  const input = shallow ? shallowReactive(source) : reactive(source)
  wrappers.push(mount(defineComponent({ setup() { runtime = useTableRuntime(input); return () => null } })))
  await flushPromises()
  return { runtime, input }
}

describe('runtime work is limited to changed query dependencies', () => {
  it.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])('does not clone or serialize manual drafts with autoSubmitMs=%s', async autoSubmitMs => {
    const requests: Query[] = []
    const { runtime } = await create({
      searchPanel: { autoSubmitMs },
      dataSource: { async query(query) { requests.push(query); return { rows: [], total: 0 } } },
    })
    const search = runtime.searchContext()
    const serialize = vi.spyOn(JSON, 'stringify')
    const clone = vi.spyOn(globalThis, 'structuredClone')
    search.setValue('q', '第一笔草稿')
    search.setValue('q', '第二笔草稿')
    expect(serialize).not.toHaveBeenCalled()
    expect(clone).not.toHaveBeenCalled()
    serialize.mockRestore()
    clone.mockRestore()
    expect(requests).toHaveLength(1)
    expect(search.pending).toBe(true)
    await search.submit()
    expect(requests.at(-1)?.keyword).toBe('第二笔草稿')
  })

  it('reuses deep reactive definition fingerprints across context consumers and tracks nested getter dependencies', () => {
    const config = reactive({ label: '状态', options: [{ value: 'open', label: '未结', filters: [{ field: 'status', operator: 'eq', value: 1 as number | string }] }] })
    let sourceReads = 0
    const definition = reactive({ items: [{ id: 'status', kind: 'select', field: 'status',
      get label() { sourceReads++; return config.label }, options: config.options, defaultValue: 'open',
    }] })
    const runtime = useQueryRuntime({
      searchDefinition: () => definition,
      searchAllowedItems: () => undefined, registry: () => undefined, columns: () => [], report: () => {},
    })
    const search = runtime.context(async () => {})
    expect(search.summaryItems[0]?.label).toBe('状态')
    sourceReads = 0
    for (let index = 0; index < 5; index++) {
      expect(search.getValue('status')).toBe('open')
      expect(search.pending).toBe(false)
      expect(search.items).toHaveLength(1)
      expect(runtime.snapshot().search?.values).toEqual({ status: 'open' })
    }
    expect(sourceReads).toBe(0)
    config.label = '业务状态'
    config.options[0]!.filters[0]!.value = '1'
    expect(search.summaryItems[0]?.label).toBe('业务状态')
    expect(runtime.query.value.filters).toEqual([{ field: 'status', operator: 'eq', value: '1' }])
  })

  it('reuses resolved column metadata and filtered rows when only the page changes', async () => {
    let metadataReads = 0, rowReads = 0
    const columns: ColumnConfig<Row>[] = [{ id: 'name', field: 'name', title: '名称', numberFormat: { get prefix() { metadataReads++; return '' } } }]
    const data = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, get name() { rowReads++; return '匹配' } }))
    const { runtime } = await create({ columns, data })
    await runtime.setQuery({ keyword: '匹配' })
    metadataReads = 0
    rowReads = 0
    await runtime.goPage(2)
    await runtime.goPage(3)
    expect(runtime.rows.value.map(row => row.id)).toEqual([3])
    expect(metadataReads).toBe(0)
    expect(rowReads).toBe(0)
  })

  it('updates nested presets on the same definition object while preserving draft and applied values', async () => {
    const definition = reactive({ items: [{ id: 'status', kind: 'select', field: 'status', defaultValue: 'open', options: [
      { value: 'open', label: '未结', filters: [{ field: 'status', operator: 'eq', value: 1 as number | string }] },
      { value: 'closed', label: '已结', filters: [{ field: 'status', operator: 'eq', value: 2 as number | string }] },
    ] }] })
    const allowed = reactive(['status'])
    const runtime = useQueryRuntime({ searchDefinition: () => definition, searchAllowedItems: () => allowed,
      registry: () => undefined, columns: () => [], report: () => {},
    })
    const search = runtime.context(async () => {})
    search.setValue('status', 'closed')
    expect(runtime.query.value.filters).toEqual([{ field: 'status', operator: 'eq', value: 1 }])
    definition.items[0]!.options[0]!.label = '仍未结'
    definition.items[0]!.options[0]!.filters[0]!.value = '1'
    expect(runtime.query.value.filters).toEqual([{ field: 'status', operator: 'eq', value: '1' }])
    expect(search.summaryItems[0]?.displayValue).toBe('仍未结')
    expect(search.getValue('status')).toBe('closed')
    expect(search.pending).toBe(true)
    allowed.splice(0)
    expect(search.items).toEqual([])
    expect(runtime.query.value.filters).toEqual([])
    expect(() => search.setValue('status', 'open')).toThrow('查询字段已不可用。')
  })

  it('continues reading ordinary definition and allowlist getters when their untracked values change', async () => {
    const definition = { items: [{ id: 'status', kind: 'select', field: 'status', defaultValue: 1,
      options: [{ value: 1, label: '一' }, { value: 2, label: '二' }],
    }] }
    let allowed = ['status']
    const runtime = useQueryRuntime({ searchDefinition: () => definition, searchAllowedItems: () => allowed,
      registry: () => undefined, columns: () => [], report: () => {},
    })
    const search = runtime.context(async () => {})
    expect(search.getValue('status')).toBe(1)
    definition.items[0]!.defaultValue = 2
    await search.reset()
    expect(search.getValue('status')).toBe(2)
    allowed = []
    expect(search.items).toEqual([])
    expect(() => search.setValue('status', 1)).toThrow('查询字段已不可用。')
    runtime.clear()
    expect(search.items).toEqual([])
    allowed.push('status')
    expect(search.items.map(item => item.id)).toEqual(['status'])
    await search.reset()
    expect(search.getValue('status')).toBe(2)
  })

  it('refreshes nested custom defaults on the same reactive definition before reset', async () => {
    const definition = reactive({ items: [{ id: 'custom', kind: 'custom', defaultValue: { nested: [1 as number | string] } }] })
    const registry = createRegistry()
    registry.register('search', 'custom', { component: defineComponent({ render: () => null }) })
    const runtime = useQueryRuntime({ searchDefinition: () => definition, searchAllowedItems: () => undefined,
      registry: () => registry, columns: () => [], report: () => {},
    })
    const search = runtime.context(async () => {})
    expect(search.getValue('custom')).toEqual({ nested: [1] })
    definition.items[0]!.defaultValue.nested[0] = '1'
    await search.reset()
    expect(search.getValue('custom')).toEqual({ nested: ['1'] })
    expect(search.appliedValues.custom).toEqual({ nested: ['1'] })
  })

  it('keeps mutable raw children observable inside a reactive search definition', async () => {
    const item = markRaw({ id: 'status', kind: 'select', field: 'status', defaultValue: 1,
      options: [{ value: 1, label: '一' }, { value: 2, label: '二' }],
    })
    const definition = reactive({ items: [item] })
    const runtime = useQueryRuntime({ searchDefinition: () => definition, searchAllowedItems: () => undefined,
      registry: () => undefined, columns: () => [], report: () => {},
    })
    const search = runtime.context(async () => {})
    expect(search.getValue('status')).toBe(1)
    item.defaultValue = 2
    await search.reset()
    expect(search.getValue('status')).toBe(2)
  })

  it('invalidates local results for nested mapping changes, data edits and explicit refresh', async () => {
    const columns = reactive<ColumnConfig<Row>[]>([{ id: 'status', field: 'status', title: '状态', sortable: true,
      mapping: { enabled: true, sort: true, type: 'number', presentation: 'text', empty: '空', unknown: '未知',
        items: [{ value: 2, label: '二' }, { value: 1, label: '一' }] },
    }])
    const data = reactive<Row[]>([{ id: 1, name: '甲', status: 1 }, { id: 2, name: '乙', status: 2 }])
    const { runtime } = await create({ columns, data })
    await runtime.setQuery({ sorts: [{ field: 'status', order: 'asc' }] })
    expect(runtime.rows.value.map(row => row.id)).toEqual([2])
    columns[0]!.mapping!.items.reverse()
    await runtime.goPage(1)
    expect(runtime.rows.value.map(row => row.id)).toEqual([1])
    data[0]!.status = 2
    data[1]!.status = 1
    await nextTick()
    expect(runtime.rows.value.map(row => row.id)).toEqual([2])
    const raw = { id: 3, name: '丙', status: 2 }
    const plainData = [raw, { id: 4, name: '丁', status: 1 }]
    const { runtime: plain } = await create({ columns, data: plainData })
    await plain.setQuery({ sorts: [{ field: 'status', order: 'asc' }] })
    raw.status = 1
    await plain.reload()
    expect(plain.rows.value.map(row => row.id)).toEqual([3])
  })

  it('invalidates mapped sorting for ordinary nested columns passed through shallow props', async () => {
    let visualReads = 0
    const columns: ColumnConfig<Row>[] = [{ id: 'status', field: 'status', title: '状态', sortable: true,
      numberFormat: { get prefix() { visualReads++; return '' } },
      mapping: { enabled: true, sort: true, type: 'number', presentation: 'text', empty: '空', unknown: '未知',
        items: [{ value: 2, label: '二' }, { value: 1, label: '一' }] },
    }]
    const { runtime } = await create({ columns, data: [{ id: 1, name: '甲', status: 1 }, { id: 2, name: '乙', status: 2 }] }, true)
    await runtime.setQuery({ sorts: [{ field: 'status', order: 'asc' }] })
    expect(runtime.rows.value.map(row => row.id)).toEqual([2])
    visualReads = 0
    columns[0]!.mapping!.items.reverse()
    await runtime.goPage(1)
    expect(runtime.rows.value.map(row => row.id)).toEqual([1])
    expect(visualReads).toBe(0)
    columns[0]!.mapping!.enabled = false
    await runtime.goPage(2)
    expect(runtime.rows.value.map(row => row.id)).toEqual([2])
  })

  it('distinguishes numeric, string and nested JSON auto-submit drafts without losing snapshot isolation', async () => {
    const registry = createRegistry<Row>()
    registry.register('search', 'custom', { component: defineComponent({ render: () => null }),
      toQuery: value => [{ field: 'status', operator: 'eq', value: JSON.stringify(value) }],
    })
    const requests: Query[] = []
    const { runtime } = await create({ registry, searchDefinition: { items: [{ id: 'custom', kind: 'custom' }] }, searchPanel: { autoSubmitMs: 100 },
      dataSource: { async query(query) { requests.push(query); return { rows: [], total: 0 } } },
    })
    const search = runtime.searchContext()
    vi.useFakeTimers()
    for (const { value, projected } of [{ value: 1, projected: '1' }, { value: '1', projected: '"1"' },
      { value: { nested: [1] }, projected: '{"nested":[1]}' }, { value: { nested: ['1'] }, projected: '{"nested":["1"]}' }]) {
      search.setValue('custom', value)
      expect(search.pending).toBe(true)
      await vi.advanceTimersByTimeAsync(100)
      expect(requests.at(-1)?.filters).toEqual([{ field: 'status', operator: 'eq', value: projected }])
      expect(search.appliedValues.custom).toEqual(value)
      expect(search.pending).toBe(false)
    }
    const snapshot = search.values
    snapshot.custom = 'changed outside the runtime'
    expect(search.getValue('custom')).toEqual({ nested: ['1'] })
    expect(requests).toHaveLength(5)
  })

  it('resumes observing fresh drafts after automatic submission is disabled and enabled again', async () => {
    const panel = reactive<{ autoSubmitMs: number | undefined }>({ autoSubmitMs: undefined })
    const requests: Query[] = []
    const { runtime } = await create({ searchPanel: panel,
      dataSource: { async query(query) { requests.push(query); return { rows: [], total: 0 } } },
    })
    const search = runtime.searchContext()
    vi.useFakeTimers()
    search.setValue('q', '手动草稿')
    panel.autoSubmitMs = 100
    await nextTick()
    await vi.advanceTimersByTimeAsync(100)
    expect(requests).toHaveLength(1)
    search.setValue('q', '待取消草稿')
    await vi.advanceTimersByTimeAsync(50)
    panel.autoSubmitMs = undefined
    await nextTick()
    await vi.advanceTimersByTimeAsync(100)
    expect(requests).toHaveLength(1)
    panel.autoSubmitMs = 0
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
    expect(requests).toHaveLength(1)
    search.setValue('q', '立即提交新草稿')
    await vi.advanceTimersByTimeAsync(0)
    expect(requests).toHaveLength(2)
    expect(requests.at(-1)?.keyword).toBe('立即提交新草稿')
    expect(search.pending).toBe(false)
  })
})
