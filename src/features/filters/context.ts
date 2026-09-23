import { shallowReactive } from 'vue'
import type { ColumnConfig, RowData } from '../../types'
import type { TableRuntime } from '../../runtime/useTableRuntime'
import { cloneData } from '../../runtime/value'
import { guardFilterState, readFilterState, type FilterState } from '../../runtime/filter-state'
import { defaultColumnFilter, type FilterOption } from './model'
import { createFilterPlans, createLocalFilterPlanPersistence, type FilterPlanPersistence } from './plans'

export interface FiltersContext {
  readonly tableKey: string
  readonly columns: readonly ColumnConfig[]
  readonly state: FilterState
  readonly plans?: ReturnType<typeof createFilterPlans>
  columnId?: string
  revision: number
  optionsFor(column: ColumnConfig, search: string, signal: AbortSignal, values?: readonly FilterOption['value'][]): Promise<FilterOption[]>
  apply(state: FilterState): Promise<void>
  readPlan(id: string): FilterState
  close(): void
}
export function createFiltersContext<T extends RowData>(runtime: TableRuntime<T>, options: {
  tableKey: string; columnId?: string; allowedItems?: string[]; persistence?: FilterPlanPersistence | null
}, controls: { close(): void; isActive(): boolean; onDispose(dispose: () => void): void }): FiltersContext {
  const columns = () => runtime.allResolvedColumns.value.filter(column => defaultColumnFilter(column).enabled
    && (!options.allowedItems || options.allowedItems.includes(column.id)))
  const guard = () => { if (!controls.isActive()) throw new Error('筛选设置已失效，请重新打开。') }
  const persistence = options.persistence === null ? undefined : options.persistence ?? (options.tableKey ? createLocalFilterPlanPersistence() : undefined)
  const plans = persistence ? createFilterPlans(options.tableKey, persistence, {
    assertActive: guard,
    validateState: state => guardFilterState(state, columns()),
  }) : undefined
  if (plans) controls.onDispose(() => plans.dispose())
  return shallowReactive({
    tableKey: options.tableKey, columnId: options.columnId, revision: 0,
    get columns() { return columns() },
    get state() { return cloneData({ columnFilters: runtime.columnFilters.value, filterGroup: runtime.filterGroup.value }) },
    plans,
    async apply(state: FilterState) { guard(); await runtime.setFilterState(guardFilterState(state, columns())) },
    readPlan(id: string) {
      guard()
      if (!plans) throw new Error('筛选方案不可用。')
      const plan = plans.plans.value.find(item => item.id === id)
      if (!plan) throw new Error('筛选方案已删除。')
      return guardFilterState(readFilterState(plan), columns())
    },
    async optionsFor(column: ColumnConfig, search: string, signal: AbortSignal, values?: readonly FilterOption['value'][]) {
      guard()
      if (!columns().some(item => item.id === column.id && item.field === column.field)) throw new Error('筛选字段已不可用。')
      return runtime.optionsFor(column, search, signal, values)
    },
    close: controls.close,
  })
}
