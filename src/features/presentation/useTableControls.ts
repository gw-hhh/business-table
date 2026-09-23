import { ref, watch } from 'vue'

export interface TableControlsSnapshot { advanced: boolean; searchVisible: boolean }
export interface TableControlsPersistence {
  load(): unknown
  save(value: TableControlsSnapshot): void
}
export interface TableControlsOptions { persistence?: TableControlsPersistence; onError?: (cause: unknown) => void }

/** Workspace preferences are independent of query data and saved views. */
export function useTableControls(initial: Partial<TableControlsSnapshot> & { selectionVisible?: boolean } = {}, options: TableControlsOptions = {}) {
  const defaults = { advanced: initial.advanced ?? false, searchVisible: initial.searchVisible ?? true }
  const report = (cause: unknown) => { try { options.onError?.(cause) } catch { /* Preference errors must not interrupt controls. */ } }
  let restored = defaults
  if (options.persistence) {
    try {
      const stored = options.persistence.load()
      const value: unknown = typeof stored === 'string' ? JSON.parse(stored) : stored
      if (value != null) {
        if (typeof value !== 'object' || Array.isArray(value)) throw new Error('查询区显示偏好格式无效。')
        const data = value as Record<string, unknown>
        if (['advanced', 'searchVisible'].some(key => Object.hasOwn(data, key) && typeof data[key] !== 'boolean')) throw new Error('查询区显示偏好格式无效。')
        restored = { advanced: typeof data.advanced === 'boolean' ? data.advanced : defaults.advanced, searchVisible: typeof data.searchVisible === 'boolean' ? data.searchVisible : defaults.searchVisible }
      }
    } catch (cause) { report(cause) }
  }
  const controls = {
    advanced: ref(restored.advanced),
    searchVisible: ref(restored.searchVisible),
    selectionVisible: ref(initial.selectionVisible ?? false),
  }
  if (options.persistence) watch([controls.advanced, controls.searchVisible], ([advanced, searchVisible]) => {
    try { options.persistence!.save({ advanced, searchVisible }) } catch (cause) { report(cause) }
  })
  return controls
}
