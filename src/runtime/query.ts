import { computed, shallowRef, type ShallowRef } from 'vue'
import type { DiagnosticReporter } from '../config/diagnostics'
import type { ColumnConfig, FilterConfig, Query, SortConfig, ViewConfig } from '../types'
import type { RuntimeRegistry } from './registry'
import { cloneData } from './value'
import { guardFilterState, type FilterState } from './filter-state'
import { operatorLabels, readFilter, readFilterGroup, type FilterGroup } from './filter'
import {
  defaultSearchValues, normalizeSearchDefinition, projectSearchValues, readSearchJson, readSearchValues, readRuntimeSearchValues,
  restoreLegacySearch, serializeSearchValues, type SearchDefinition, type SearchValues,
} from '../features/search/model'

export type QueryChange = Partial<Pick<Query, 'keyword' | 'filters' | 'sorts' | 'viewId' | 'filterGroup'>>

interface QueryRuntimeOptions {
  searchDefinition(): unknown | undefined
  searchAllowedItems(): readonly string[] | undefined
  registry(): RuntimeRegistry | undefined
  columns(): readonly ColumnConfig[]
  report: DiagnosticReporter
}

interface SearchState {
  definition: SearchDefinition
  applied: ShallowRef<SearchValues>
  draft: ShallowRef<SearchValues>
}

/** Owns the durable query layers. Search remains absent until its Feature gate opens. */
export function useQueryRuntime(options: QueryRuntimeOptions) {
  const legacyKeyword = shallowRef('')
  const legacyDraft = shallowRef('')
  const filters = shallowRef<FilterConfig[]>([])
  const columnFilters = shallowRef<FilterConfig[]>([])
  const filterGroup = shallowRef<FilterGroup>()
  const sorts = shallowRef<SortConfig[]>([])
  const activeView = shallowRef<string | null>(null)
  let source: unknown
  let sourceFingerprint: string | undefined
  let allowedKey: string | undefined
  let searchState: SearchState | undefined

  function search(): SearchState | undefined {
    const nextSource = options.searchDefinition()
    if (nextSource === undefined) {
      source = undefined
      sourceFingerprint = undefined
      searchState = undefined
      return undefined
    }
    const allowed = options.searchAllowedItems()
    const nextAllowedKey = allowed?.join('\u0000')
    let nextFingerprint: string | undefined
    try { nextFingerprint = JSON.stringify(nextSource) } catch { /* validation reports malformed definitions below */ }
    if (searchState && source === nextSource && sourceFingerprint === nextFingerprint && allowedKey === nextAllowedKey) return searchState
    const definition = normalizeSearchDefinition(nextSource, allowed, options.report)
    const registry = options.registry()
    const persisted = searchState ? serializeSearchValues(searchState.applied.value, searchState.definition, registry, options.report) : undefined
    const persistedDraft = searchState ? serializeSearchValues(searchState.draft.value, searchState.definition, registry, options.report) : undefined
    const applied = readSearchValues(persisted, definition, registry, options.report, 'replace')
    const draft = persistedDraft ? readSearchValues(persistedDraft, definition, registry, options.report, 'replace') : cloneData(applied)
    searchState = { definition, applied: shallowRef(applied), draft: shallowRef(draft) }
    source = nextSource
    sourceFingerprint = nextFingerprint
    allowedKey = nextAllowedKey
    return searchState
  }

  const projected = computed(() => {
    const state = search()
    if (!state) return { keyword: legacyKeyword.value, filters: [] as FilterConfig[] }
    const result = projectSearchValues(state.applied.value, state.definition, options.registry(), options.report)
    if (!state.definition.items.some(item => item.kind === 'keyword')) result.keyword = legacyKeyword.value
    return result
  })
  const keyword = computed(() => projected.value.keyword)
  const searchSignature = computed(() => JSON.stringify(projected.value))
  const searchDraft = computed({
    get() { const state = search(); const item = state?.definition.items.find(item => item.kind === 'keyword'); return item ? String(state?.draft.value[item.id] ?? '') : legacyDraft.value },
    set(value: string) { const state = search(); const item = state?.definition.items.find(item => item.kind === 'keyword'); if (state && item) setValue(item.id, value); else legacyDraft.value = value },
  })
  const query = computed(() => ({
    keyword: projected.value.keyword,
    filters: [...cloneData(filters.value), ...cloneData(projected.value.filters)],
    ...(columnFilters.value.length ? { columnFilters: cloneData(columnFilters.value) } : {}),
    ...(filterGroup.value ? { filterGroup: cloneData(filterGroup.value) } : {}),
    sorts: cloneData(sorts.value),
    viewId: activeView.value,
  }))

  function getValue(id: string): unknown { return cloneData(search()?.draft.value[id]) }
  function setValue(id: string, value: unknown) {
    const state = search()
    if (!state || !state.definition.items.some(item => item.id === id)) throw new Error('查询字段已不可用。')
    if (value === undefined) {
      const next = { ...state.draft.value }
      delete next[id]
      state.draft.value = next
      return
    }
    const accepted = readSearchJson(value)
    if (accepted === undefined) throw new Error('查询值必须是可保存的数据。')
    state.draft.value = { ...state.draft.value, [id]: accepted }
  }
  const pending = computed(() => {
    const state = search()
    return state ? JSON.stringify(state.draft.value) !== JSON.stringify(state.applied.value)
      || !state.definition.items.some(item => item.kind === 'keyword') && legacyDraft.value !== legacyKeyword.value
      : legacyDraft.value !== legacyKeyword.value
  })
  function commitSearch(): void {
    const state = search()
    if (!state) { legacyKeyword.value = legacyDraft.value; return }
    const issues: string[] = []
    const accepted = readRuntimeSearchValues(state.draft.value, state.definition, options.registry(), diagnostic => {
      options.report(diagnostic)
      issues.push(diagnostic.message)
    }, 'replace')
    if (issues.length) throw new Error(issues[0])
    projectSearchValues(accepted, state.definition, options.registry(), options.report)
    state.applied.value = accepted
    state.draft.value = cloneData(accepted)
    if (!state.definition.items.some(item => item.kind === 'keyword')) legacyKeyword.value = legacyDraft.value
  }
  function resetSearch(): void {
    const state = search()
    if (!state) { legacyKeyword.value = ''; legacyDraft.value = ''; return }
    const values = state.definition.resetBehavior === 'empty' ? Object.create(null) as SearchValues
      : readSearchValues(defaultSearchValues(state.definition, 'reset'), state.definition, options.registry(), options.report)
    projectSearchValues(values, state.definition, options.registry(), options.report)
    state.applied.value = values
    state.draft.value = cloneData(values)
    if (!state.definition.items.some(item => item.kind === 'keyword')) { legacyKeyword.value = ''; legacyDraft.value = '' }
  }

  function validFilters(source: readonly FilterConfig[] | undefined, persisted = false): FilterConfig[] {
    return (source ?? []).flatMap((entry, index) => {
      const parsed = readFilter(entry)
      if (parsed) return [parsed]
      if (!persisted && entry && readFilter({ field: entry.field, operator: 'empty', value: null }) && (entry.operator === 'eq' || entry.operator === 'ne')
        && Object.hasOwn(operatorLabels, entry.operator) && entry.value !== null && typeof entry.value === 'object') {
        return [cloneData(entry)]
      }
      options.report({ code: 'CapabilityViolation', path: `query.filters.${index}`, message: '查询条件已不可用，已忽略。' })
      return []
    })
  }
  function validSorts(source: readonly SortConfig[] | undefined): SortConfig[] {
    const allowed = new Set(options.columns().filter(column => column.sortable).map(column => column.field))
    const seen = new Set<string>()
    return (source ?? []).filter(sort => {
      if (allowed.has(sort.field) && (sort.order === 'asc' || sort.order === 'desc') && !seen.has(sort.field)) { seen.add(sort.field); return true }
      options.report({ code: 'CapabilityViolation', path: `query.sorts.${sort.field}`, message: '排序字段已不可用，已忽略。' })
      return false
    }).map(sort => ({ ...sort }))
  }
  function setQuery(change: QueryChange): void {
    const group = change.filterGroup === undefined ? undefined : readFilterGroup(change.filterGroup)
    if (change.filterGroup !== undefined && !group) throw new Error('组合筛选配置无效。')
    if (change.keyword !== undefined) {
      const state = search()
      const item = state?.definition.items.find(item => item.kind === 'keyword')
      if (state && item) {
        const values = readRuntimeSearchValues({ ...state.applied.value, [item.id]: change.keyword }, state.definition, options.registry(), options.report, 'replace')
        state.applied.value = values
        state.draft.value = cloneData(values)
      } else { legacyKeyword.value = change.keyword; legacyDraft.value = change.keyword }
    }
    if (change.filters !== undefined) filters.value = validFilters(change.filters)
    if (change.sorts !== undefined) sorts.value = validSorts(change.sorts)
    if (change.viewId !== undefined) activeView.value = change.viewId
    if (change.filterGroup !== undefined) filterGroup.value = group
  }
  function setFilterState(next: FilterState, allowedColumns: readonly ColumnConfig[] = options.columns()): void {
    const accepted = guardFilterState(next, allowedColumns)
    columnFilters.value = accepted.columnFilters
    filterGroup.value = accepted.filterGroup
  }
  function sort(column: ColumnConfig): void {
    if (!column.sortable) return
    const old = sorts.value.find(sort => sort.field === column.field)
    sorts.value = old?.order === 'desc' ? [] : [{ field: column.field, order: old ? 'desc' : 'asc' }]
  }
  function restoreView(view?: ViewConfig, searchKeyword?: string): void {
    activeView.value = view?.id ?? null
    const state = search()
    legacyKeyword.value = state?.definition.items.some(item => item.kind === 'keyword') ? '' : searchKeyword ?? view?.keyword ?? ''
    legacyDraft.value = legacyKeyword.value
    if (state) {
      const incoming = validFilters(view?.filters, true)
      const restored = view?.search?.values !== undefined
        ? { values: readSearchValues(view.search.values, state.definition, options.registry(), options.report, 'replace'), filters: incoming }
        : restoreLegacySearch(searchKeyword ?? view?.keyword, incoming, state.definition, options.registry(), options.report)
      state.applied.value = restored.values
      state.draft.value = cloneData(restored.values)
      filters.value = restored.filters
    } else {
      filters.value = validFilters(view?.filters, true)
    }
    sorts.value = validSorts(view?.sorts)
    try {
      const accepted = guardFilterState({ columnFilters: view?.columnFilters ?? [], filterGroup: view?.filterGroup }, options.columns())
      columnFilters.value = accepted.columnFilters
      filterGroup.value = accepted.filterGroup
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      options.report({ code: 'CapabilityViolation', path: 'view.filterState', message })
      columnFilters.value = []
      filterGroup.value = undefined
    }
  }
  function snapshot() {
    const state = search()
    return {
      ...(state ? { search: { values: serializeSearchValues(state.applied.value, state.definition, options.registry(), options.report) } } : {}),
      keyword: keyword.value,
      filters: cloneData(filters.value),
      columnFilters: cloneData(columnFilters.value),
      filterGroup: cloneData(filterGroup.value),
      sorts: cloneData(sorts.value),
    }
  }
  function clear(): void {
    legacyKeyword.value = ''; legacyDraft.value = ''; filters.value = []; columnFilters.value = []
    filterGroup.value = undefined; sorts.value = []; activeView.value = null
    source = undefined; sourceFingerprint = undefined; allowedKey = undefined; searchState = undefined
  }
  function context(onCommit: () => Promise<void>) {
    return {
      get items() { return search()?.definition.items ?? [] },
      get values() { return cloneData(search()?.draft.value ?? {}) },
      get appliedValues() { return cloneData(search()?.applied.value ?? {}) },
      get defaultCollapsed() { return search()?.definition.defaultCollapsed === true },
      get pending() { return pending.value },
      get draft() { return searchDraft.value },
      set draft(value: string) { searchDraft.value = value },
      getValue, setValue,
      component(id: string) { const item = search()?.definition.items.find(item => item.id === id); return item?.kind === 'custom' ? options.registry()?.get('search', item.id)?.component : undefined },
      async submit() { commitSearch(); await onCommit() },
      async reset() { resetSearch(); await onCommit() },
    }
  }
  return { keyword, searchSignature, searchDraft, filters, columnFilters, filterGroup, sorts, activeView, query,
    getValue, setValue, pending, commitSearch, resetSearch, setQuery, setFilterState, sort, restoreView, snapshot, clear, context }
}

export type QueryRuntime = ReturnType<typeof useQueryRuntime>
export type SearchContext = ReturnType<QueryRuntime['context']>
