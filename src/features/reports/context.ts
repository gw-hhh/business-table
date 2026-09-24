import { onScopeDispose, shallowReactive, watch, type Ref } from 'vue'
import type { ColumnConfig, RowData } from '../../types'
import { cloneData } from '../../runtime/value'

/** Narrow read port accepted by TableRuntime and hosts with a restricted column allowlist. */
export interface ReportsSource {
  readonly filterOptionsIdentity: Readonly<Ref<unknown>>
  readonly allResolvedColumns: Readonly<Ref<readonly ColumnConfig[]>>
  readRows(scope: 'query', signal?: AbortSignal): Promise<readonly RowData[]>
  rowId(row: RowData): string
  getSelectedRows(): readonly RowData[]
}
export interface ReportsContext<D> {
  readonly definition: D; readonly columns: readonly ColumnConfig[]; readonly rows: readonly RowData[]
  readonly selectedIds: readonly string[]; readonly loading: boolean; readonly error: string; readonly disabled: boolean
  rowId(row: RowData): string
  reload(): Promise<void>
  pause(): void
  close(): void
}
export function createReportsContext<D>(source: ReportsSource, definition: () => D, controls: {
  close(): void; isActive(): boolean; isDisabled?(): boolean; onDispose(dispose: () => void): void
}): ReportsContext<D> {
  const state = shallowReactive({ rows: [] as readonly RowData[], selectedIds: [] as readonly string[], loading: false, error: '' })
  let controller: AbortController | undefined, sequence = 0, paused = true, disposed = false
  function pause() {
    paused = true; sequence++; controller?.abort(); controller = undefined
    state.loading = false; state.rows = []; state.selectedIds = []; state.error = ''
  }
  async function reload() {
    if (disposed || !controls.isActive()) { pause(); return }
    paused = false; const request = ++sequence; controller?.abort(); const active = new AbortController(); controller = active
    state.loading = true; state.error = ''; state.rows = []
    state.selectedIds = source.getSelectedRows().map(source.rowId)
    const identity = source.filterOptionsIdentity.value, columns = source.allResolvedColumns.value
    const current = () => !disposed && !paused && request === sequence && !active.signal.aborted && controls.isActive()
      && source.filterOptionsIdentity.value === identity && source.allResolvedColumns.value === columns
    try {
      const rows = await source.readRows('query', active.signal)
      if (current()) state.rows = cloneData(rows)
    } catch (cause) {
      if (current()) state.error = cause instanceof Error ? cause.message : String(cause)
    } finally { if (current()) state.loading = false }
  }
  const stop = watch(() => [source.filterOptionsIdentity.value, source.allResolvedColumns.value, definition()], () => { if (!paused) void reload() }, { deep: true })
  function dispose() { disposed = true; pause(); stop() }
  controls.onDispose(dispose); onScopeDispose(dispose, true)
  return shallowReactive({
    get definition() { return definition() }, get columns() { return source.allResolvedColumns.value },
    get rows() { return state.rows }, get selectedIds() { return state.selectedIds },
    get loading() { return state.loading }, get error() { return state.error }, get disabled() { return controls.isDisabled?.() === true },
    rowId: source.rowId, reload, pause, close() { pause(); controls.close() },
  })
}
