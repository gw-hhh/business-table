import { computed, readonly, shallowRef, type Ref } from 'vue'
import type { ViewConfig } from '../../types'
import { cloneData } from '../../runtime/value'
import { parseColumnPatch } from '../../config/columns'
import { readFilter, readFilterGroup } from '../filters/model'
import { normalizeSearchDefinition, projectSearchValues, readSearchJson, readSearchValues, restoreLegacySearch, serializeSearchValues, type SearchDefinition, type SearchValues } from '../search/model'
import type { RuntimeRegistry } from '../../runtime/registry'
import { presentationDelta, resolvePresentation } from '../presentation/model'

export interface ViewSnapshot extends Omit<ViewConfig, 'id' | 'name'> {}
export interface ViewSummary{id:string;name:string;isSystem?:boolean;isReadOnly?:boolean;isDefault?:boolean}
export interface ViewsPanelRuntime{views:Readonly<Ref<readonly ViewSummary[]>>;activeId:Readonly<Ref<string|null>>;current:Readonly<Ref<ViewSummary|undefined>>;apply:(id:string)=>Promise<void>;saveAs:(name:string,state:ViewSnapshot)=>Promise<string>;rename:(id:string,name:string)=>Promise<void>;update:(id:string,state:ViewSnapshot)=>Promise<void>;setDefault:(id:string)=>Promise<void>;move:(id:string,offset:number)=>Promise<void>;remove:(id:string)=>Promise<void>}
export interface ViewsOptions {
  tableKey: string; initial: unknown
  apply: (view: ViewConfig) => void | Promise<void>
  save?: (views: ViewConfig[]) => void | Promise<void>
  maxViews?: number
}
/** Track the complete applied snapshot, including layout, page size and host view preferences. */
export function createViewChangeTracker(read:()=>ViewSnapshot){
  const accepted=shallowRef<string>()
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,entry])=>[key,canonical(entry)])):value
  const current=computed(()=>JSON.stringify(canonical(read())))
  return {modified:computed(()=>accepted.value!==undefined&&current.value!==accepted.value),accept:()=>{accepted.value=current.value}}
}
const object = (input: unknown): Record<string, unknown> => input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
function snapshot(input: unknown): ViewSnapshot {
  const value = object(input), result: ViewSnapshot = {}
  if (value.search !== undefined) {
    const search = object(value.search), source = object(search.values)
    if (!search.values || source !== search.values || Object.keys(source).length > 100) throw new Error('视图查询值无效。')
    const values: SearchValues = Object.create(null)
    for (const [id, entry] of Object.entries(source)) {
      if (!id || id.length > 160 || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('视图查询字段无效。')
      const parsed = readSearchJson(entry)
      if (parsed === undefined) throw new Error('视图查询值无效。')
      values[id] = parsed
    }
    result.search = { values }
  }
  if (typeof value.keyword === 'string') result.keyword = value.keyword.slice(0, 1000)
  for (const key of ['filters', 'columnFilters'] as const) {
    const rules = value[key]
    if (rules === undefined) continue
    if (!Array.isArray(rules) || rules.length > 60) throw new Error('视图查询条件无效。')
    result[key] = rules.map(item => { const parsed = readFilter(item); if (!parsed) throw new Error('视图查询条件无效。'); return parsed })
  }
  if (value.sorts !== undefined) {
    if (!Array.isArray(value.sorts) || value.sorts.length > 30) throw new Error('视图排序无效。')
    const seen = new Set<string>()
    result.sorts = value.sorts.map(item => {
      const entry = object(item)
      if (typeof entry.field !== 'string' || !readFilter({ field: entry.field, operator: 'empty', value: null }) || seen.has(entry.field) || !['asc','desc'].includes(String(entry.order))) throw new Error('视图排序无效。')
      seen.add(entry.field); return { field: entry.field, order: entry.order as 'asc' | 'desc' }
    })
  }
  const group = readFilterGroup(value.filterGroup)
  if (value.filterGroup !== undefined && !group) throw new Error('视图组合筛选无效。')
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
/** Query layers retain distinct ownership; an absent group equals an intentionally empty root. */
export function viewQueryEquals(left: ViewSnapshot, right: ViewSnapshot, search?: { definition: SearchDefinition; registry?: RuntimeRegistry }): boolean {
  const query = (value: ViewSnapshot) => {
    const parsed = snapshot(value)
    let keyword = parsed.keyword ?? '', values = parsed.search?.values ?? {}, filters = parsed.filters ?? []
    if (search) {
      const definition = normalizeSearchDefinition(search.definition)
      const restored = parsed.search
        ? { values: readSearchValues(parsed.search.values, definition, search.registry, undefined, 'replace'), filters }
        : restoreLegacySearch(parsed.keyword, filters, definition, search.registry)
      const projected = projectSearchValues(restored.values, definition, search.registry)
      keyword = definition.items.some(item => item.kind === 'keyword') ? projected.keyword : keyword
      values = serializeSearchValues(restored.values, definition, search.registry)
      filters = restored.filters
    }
    const orderedValues = Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)))
    return { keyword, search: orderedValues, filters, columnFilters: parsed.columnFilters ?? [],
      filterGroup: parsed.filterGroup?.rules.length ? parsed.filterGroup : null, sorts: parsed.sorts ?? [] }
  }
  return JSON.stringify(query(left)) === JSON.stringify(query(right))
}
/** The UI and headless consumers share these transactional view operations. */
export function createViewsRuntime(options: ViewsOptions) {
  const views = shallowRef(readViews(options.initial, options.tableKey))
  const activeId = shallowRef<string | null>(views.value.find(view => view.isDefault)?.id ?? views.value[0]?.id ?? null)
  let queue: Promise<void> = Promise.resolve()
  let application=0
  let applyingId:string|undefined
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
    if (!label || label.length > 30) throw new Error('请输入 1–30 个字符的视图名称。')
    const key=label.normalize('NFKC').toLocaleLowerCase()
    if (views.value.some(view => view.id !== id && view.name.normalize('NFKC').toLocaleLowerCase() === key)) throw new Error('这个名称已被使用，请换一个。')
    return label
  }
  async function apply(id: string) {
    const request=++application
    const view = find(id)
    applyingId=id
    const value = view.isSystem ? { id: view.id, name: view.name, isSystem: true, filters: [], columnFilters: [], sorts: [], keyword: '', filterGroup: { logic: 'and' as const, rules: [] } } : cloneData(view)
    try{await options.apply(value);if(request===application&&views.value.some(item=>item.id===id))activeId.value=id}
    finally{if(request===application)applyingId=undefined}
  }
  return {
    // Publish copies so recursive query nodes do not become Vue DeepReadonly proxies.
    views: computed<readonly ViewConfig[]>(() => cloneData(views.value)), activeId: readonly(activeId), current: computed(() => { const view=views.value.find(item=>item.id===activeId.value);return view?cloneData(view):undefined }), apply,
    async saveAs(name: string, state: ViewSnapshot) {
      const id = crypto.randomUUID(),captured=snapshot(state),request=++application
      applyingId=undefined
      await transaction(current => {
        if (current.length >= (options.maxViews ?? 50)) throw new Error('最多保存 50 个视图。')
        return [...current, { id, name: validName(name), ...captured }]
      })
      if(request===application)activeId.value = id
      return id
    },
    async update(id: string, state: ViewSnapshot) { const captured=snapshot(state);await transaction(current => { editable(id); return current.map(view => view.id === id ? { id:view.id,name:view.name,...(view.isDefault?{isDefault:true}:{}),...captured } : view) }) },
    async rename(id: string, name: string) { await transaction(current => { editable(id); const label = validName(name, id); return current.map(view => view.id === id ? { ...view, name: label } : view) }) },
    async setDefault(id: string) { await transaction(current => { find(id); return current.map(view => ({ ...view, isDefault: view.id === id })) }) },
    async move(id: string, offset: number) { await transaction(current => { const index = current.findIndex(view => view.id === id); const target = index + offset; if (index < 0 || target < 0 || target >= current.length || current[index]?.isSystem || current.slice(Math.min(index,target),Math.max(index,target)+1).some(view=>view.isSystem)) return current; const [view] = current.splice(index, 1); current.splice(target, 0, view!); return current }) },
    async remove(id: string) {
      await transaction(current => { const removed=editable(id);const next=current.filter(view => view.id !== id);if(removed.isDefault){const fallback=next.find(view=>view.isSystem)??next[0];if(fallback)fallback.isDefault=true}return next })
      if (activeId.value === id||applyingId===id) { ++application;applyingId=undefined;const next = views.value.find(view => view.isDefault) ?? views.value[0]; activeId.value = next?.id ?? null; if (next) await apply(next.id) }
    },
  }
}
