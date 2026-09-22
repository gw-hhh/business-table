import { computed, readonly, shallowRef } from 'vue'
import type { ViewConfig } from '../../types'
import { cloneData } from '../../runtime/value'
import { parseColumnPatch } from '../../config/columns'
import { readFilter, readFilterGroup } from '../filters/model'
import { presentationDelta, resolvePresentation } from '../presentation/model'

export interface ViewSnapshot extends Omit<ViewConfig, 'id' | 'name'> {}
export interface ViewsOptions {
  tableKey: string; initial: unknown
  apply: (view: ViewConfig) => void | Promise<void>
  save?: (views: ViewConfig[]) => void | Promise<void>
  maxViews?: number
}
const object = (input: unknown): Record<string, unknown> => input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
function snapshot(input: unknown): ViewSnapshot {
  const value = object(input), result: ViewSnapshot = {}
  if (typeof value.keyword === 'string') result.keyword = value.keyword.slice(0, 1000)
  if (Array.isArray(value.filters)) result.filters = value.filters.slice(0, 60).flatMap(item => { const parsed = readFilter(item); return parsed ? [parsed] : [] })
  if (Array.isArray(value.columnFilters)) result.columnFilters = value.columnFilters.slice(0, 60).flatMap(item => { const parsed = readFilter(item); return parsed ? [parsed] : [] })
  if (Array.isArray(value.sorts)) {
    const seen = new Set<string>()
    result.sorts = value.sorts.slice(0, 30).flatMap(item => {
      const entry = object(item)
      if (typeof entry.field !== 'string' || !entry.field || seen.has(entry.field) || !['asc','desc'].includes(String(entry.order))) return []
      seen.add(entry.field); return [{ field: entry.field, order: entry.order as 'asc' | 'desc' }]
    })
  }
  const group = readFilterGroup(value.filterGroup)
  if (group) result.filterGroup = group
  if (value.columns && typeof value.columns === 'object' && !Array.isArray(value.columns)) {
    result.columns = Object.create(null)
    for (const [id, patch] of Object.entries(value.columns).slice(0, 200)) if (id && id.length <= 160) result.columns![id] = parseColumnPatch(patch)
  }
  if (Number.isInteger(value.pageSize) && Number(value.pageSize) > 0 && Number(value.pageSize) <= 1000) result.pageSize = Number(value.pageSize)
  if (value.presentation) {
    const presentation = resolvePresentation(value.presentation)
    const delta = presentationDelta(presentation)
    if (!presentation.toolbar.followView) delete delta.toolbar
    result.presentation = delta
  }
  if (typeof value.searchCollapsed === 'boolean') result.searchCollapsed = value.searchCollapsed
  return result
}
export function readViews(input: unknown, tableKey: string): ViewConfig[] {
  let value = input
  if (typeof value === 'string') value = JSON.parse(value)
  if (!Array.isArray(value)) {
    const envelope = object(value)
    if (envelope.kind !== 'business-table-views' || envelope.schemaVersion !== 3 || envelope.tableKey !== tableKey) throw new Error('视图配置不属于当前表格。')
    value = envelope.views
  }
  if (!Array.isArray(value) || value.length > 50) throw new Error('视图配置无效。')
  const ids = new Set<string>(), names = new Set<string>()
  let hasDefault = false
  return value.map(item => {
    const view = object(item)
    if (typeof view.id !== 'string' || !view.id || typeof view.name !== 'string' || !view.name.trim() || view.name.length > 40 || ids.has(view.id) || names.has(view.name.trim())) throw new Error('视图名称或标识重复。')
    ids.add(view.id); names.add(view.name.trim())
    const isDefault = view.isDefault === true && !hasDefault
    hasDefault ||= isDefault
    return { id: view.id, name: view.name.trim(), ...snapshot(view), ...(view.isSystem === true ? { isSystem: true } : {}), ...(view.isReadOnly === true ? { isReadOnly: true } : {}), ...(isDefault ? { isDefault: true } : {}) }
  })
}
/** The UI and headless consumers share these transactional view operations. */
export function createViewsRuntime(options: ViewsOptions) {
  const views = shallowRef(readViews(options.initial, options.tableKey))
  const activeId = shallowRef<string | null>(views.value.find(view => view.isDefault)?.id ?? views.value[0]?.id ?? null)
  let queue: Promise<void> = Promise.resolve()
  const find = (id: string) => { const view = views.value.find(item => item.id === id); if (!view) throw new Error('视图已删除，请重新选择。'); return view }
  const editable = (id: string) => { const view = find(id); if (view.isSystem || view.isReadOnly) throw new Error('系统视图不能修改。'); return view }
  function transaction(update: (current: ViewConfig[]) => ViewConfig[]) {
    const pending = queue.catch(() => {}).then(async () => {
      const next = update(cloneData(views.value))
      await options.save?.(cloneData(next))
      views.value = next
    })
    queue = pending
    return pending
  }
  function validName(name: string, id?: string) {
    const label = name.trim()
    if (!label || label.length > 40) throw new Error('请填写 1–40 字的视图名称。')
    if (views.value.some(view => view.id !== id && view.name === label)) throw new Error('已有同名视图。')
    return label
  }
  async function apply(id: string) {
    const view = find(id)
    const value = view.isSystem ? { id: view.id, name: view.name, filters: [], columnFilters: [], sorts: [], keyword: '', filterGroup: { logic: 'and' as const, rules: [] } } : cloneData(view)
    await options.apply(value)
    activeId.value = id
  }
  return {
    views: readonly(views), activeId: readonly(activeId), current: computed(() => views.value.find(view => view.id === activeId.value)), apply,
    async saveAs(name: string, state: ViewSnapshot) {
      const id = crypto.randomUUID()
      await transaction(current => {
        if (current.length >= (options.maxViews ?? 50)) throw new Error('最多保存 50 个视图。')
        return [...current, { id, name: validName(name), ...snapshot(state) }]
      })
      activeId.value = id
      return id
    },
    async update(id: string, state: ViewSnapshot) { await transaction(current => { editable(id); return current.map(view => view.id === id ? { ...view, ...snapshot(state) } : view) }) },
    async rename(id: string, name: string) { await transaction(current => { editable(id); const label = validName(name, id); return current.map(view => view.id === id ? { ...view, name: label } : view) }) },
    async setDefault(id: string) { await transaction(current => { find(id); return current.map(view => ({ ...view, isDefault: view.id === id })) }) },
    async move(id: string, offset: number) { await transaction(current => { const index = current.findIndex(view => view.id === id); const target = index + offset; if (index < 0 || target < 0 || target >= current.length) return current; const [view] = current.splice(index, 1); current.splice(target, 0, view!); return current }) },
    async remove(id: string) {
      await transaction(current => { editable(id); return current.filter(view => view.id !== id) })
      if (activeId.value === id) { const next = views.value.find(view => view.isDefault) ?? views.value[0]; activeId.value = next?.id ?? null; if (next) await apply(next.id) }
    },
  }
}
