import type { Component, VNodeChild } from 'vue'
import type { DiagnosticReporter } from '../config/diagnostics'
import type { Action, ColumnConfig, FilterConfig, Query, RowData } from '../types'

export type RowCondition<T extends RowData> = boolean | ((row: T) => boolean)

export interface RegisteredRowAction<T extends RowData = RowData> extends Action<T> {
  visible?: RowCondition<T>
  disabled?: RowCondition<T>
}

export interface RowActionConfig {
  id: string
  visible?: boolean
  position?: 'inline' | 'more'
  order?: number
  label?: string
}

export interface TableActionContext<T extends RowData = RowData> {
  selectedRows: readonly T[]
  selectedKeys: readonly (string | number)[]
  query: Query
  currentView?: string | null
  reload: () => void | Promise<void>
  clearSelection: () => void
}

export interface RegisteredTableAction<T extends RowData = RowData> {
  label: string
  order?: number
  danger?: boolean
  visible?: boolean | ((context: TableActionContext<T>) => boolean)
  disabled?: boolean | ((context: TableActionContext<T>) => boolean)
  handler: (context: TableActionContext<T>) => void | Promise<void>
}

export interface RegisteredSearch {
  component: Component
  serialize?: (value: unknown) => unknown
  deserialize?: (value: unknown) => unknown
  toQuery?: (value: unknown) => FilterConfig[]
}

export type RuntimeRenderer<T extends RowData = RowData> = (value: unknown, row?: T, column?: ColumnConfig<T>) => VNodeChild

export interface RegisteredEditor<T extends RowData = RowData> {
  component: Component
  getValue?: (row: T, column: ColumnConfig<T>) => unknown
  setValue?: (row: T, column: ColumnConfig<T>, value: unknown) => void
}

export interface RegisteredFilter<T extends RowData = RowData> {
  component?: Component
  toFilter: (value: unknown, column: ColumnConfig<T>) => FilterConfig | undefined
}

export interface ExporterContext<T extends RowData = RowData> {
  rows: readonly T[]
  columns: readonly ColumnConfig<T>[]
  query: Query
  scope: 'page' | 'query' | 'selected' | 'all'
}

export type RuntimeExporter<T extends RowData = RowData> = (context: ExporterContext<T>) => void | Promise<void>

export interface RegistryItemMap<T extends RowData = RowData> {
  toolbar: RegisteredTableAction<T>
  headerAction: RegisteredTableAction<T>
  rowAction: RegisteredRowAction<T>
  search: RegisteredSearch
  renderer: RuntimeRenderer<T>
  editor: RegisteredEditor<T>
  filter: RegisteredFilter<T>
  exporter: RuntimeExporter<T>
}

export type RegistryKind = keyof RegistryItemMap

export interface RuntimeRegistry<T extends RowData = RowData> {
  register<K extends RegistryKind>(kind: K, id: string, item: RegistryItemMap<T>[K]): boolean
  get<K extends RegistryKind>(kind: K, id: string): RegistryItemMap<T>[K] | undefined
}

export interface RegistryOptions {
  onDiagnostic?: DiagnosticReporter
}

export function createRegistry<T extends RowData = RowData>(options: RegistryOptions = {}): RuntimeRegistry<T> {
  const registries: { [K in RegistryKind]: Map<string, RegistryItemMap<T>[K]> } = {
    toolbar: new Map(),
    headerAction: new Map(),
    rowAction: new Map(),
    search: new Map(),
    renderer: new Map(),
    editor: new Map(),
    filter: new Map(),
    exporter: new Map()
  }

  return {
    register(kind, id, item) {
      const entries = registries[kind]
      if (entries.has(id)) {
        options.onDiagnostic?.({
          code: 'SchemaValidationError',
          path: `registry.${kind}.${id}`,
          message: `Duplicate ${kind} registry ID "${id}"; the first registration is retained.`
        })
        return false
      }
      entries.set(id, item)
      return true
    },
    get(kind, id) {
      const entry = registries[kind].get(id)
      if (entry === undefined) {
        options.onDiagnostic?.({
          code: 'UnknownRegistryId',
          path: `registry.${kind}.${id}`,
          message: `Unknown ${kind} registry ID "${id}".`
        })
      }
      return entry
    }
  }
}

function evaluateCondition<T extends RowData>(condition: RowCondition<T> | undefined, row: T, fallback: boolean, failed:boolean, report?:DiagnosticReporter, path='rowActions'): boolean {
  try{return typeof condition === 'function' ? condition(row) : condition ?? fallback}
  catch(cause){report?.({code:'RuntimeExtensionError',path,message:cause instanceof Error?cause.message:String(cause)});return failed}
}

/** Resolve configuration data against code-owned actions; row predicates stay live. */
export function resolveRowActions<T extends RowData>(
  registry: RuntimeRegistry<T>,
  allowed: readonly string[],
  configured: readonly RowActionConfig[] = [],
  row?: T,
  report?:DiagnosticReporter,
): RegisteredRowAction<T>[] {
  const actions: RegisteredRowAction<T>[] = []
  for (const id of new Set(allowed)) {
    const registered = registry.get('rowAction', id)
    if (!registered) continue
    const presentation = configured.find(item => item.id === id)
    if (presentation?.visible === false || registered.visible === false) continue
    const visible=(value:T)=>evaluateCondition(registered.visible,value,true,false,report,`rowActions.${id}.visible`)
    const disabled=(value:T)=>evaluateCondition(registered.disabled,value,false,true,report,`rowActions.${id}.disabled`)
    if (row !== undefined && !visible(row)) continue

    const action: RegisteredRowAction<T> = {
      ...registered,
      id,
      visible,
      disabled,
      handler: registered.handler && (currentRow => {
        if (!visible(currentRow)) return
        if (disabled(currentRow)) return
        return registered.handler?.(currentRow)
      })
    }
    // Only data fields are copied. Configuration never supplies handlers or predicates.
    if (typeof presentation?.label === 'string') action.label = presentation.label
    if (presentation?.position === 'inline' || presentation?.position === 'more') action.position = presentation.position
    if (typeof presentation?.order === 'number' && Number.isFinite(presentation.order)) action.order = presentation.order
    actions.push(action)
  }
  return actions.sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
}

export function resolveRenderer<T extends RowData>(registry: RuntimeRegistry<T>, id?: string, report?:DiagnosticReporter): RuntimeRenderer<T> {
  const renderer = id === undefined ? undefined : registry.get('renderer', id)
  return (value,row,column)=>{
    try{return renderer?renderer(value,row,column):String(value??'—')}
    catch(cause){report?.({code:'RuntimeExtensionError',path:`renderer.${id}`,message:cause instanceof Error?cause.message:String(cause)});return String(value??'—')}
  }
}
