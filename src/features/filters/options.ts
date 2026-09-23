import { readonly, shallowRef } from 'vue'
import type { FilterOption } from './model'
import { typedKey } from '../../runtime/value'
import { withDeadline } from '../../runtime/deadline'

export function createFilterOptions(loader: (search: string, signal: AbortSignal) => Promise<FilterOption[]>, timeoutMs = 10000) {
  const items = shallowRef<FilterOption[]>([]), loading = shallowRef(false), error = shallowRef('')
  let sequence = 0, disposed = false, controller: AbortController | undefined
  return {
    items: readonly(items), loading: readonly(loading), error: readonly(error),
    async load(search: string) {
      if (disposed) return
      const request = ++sequence; controller?.abort(); controller = new AbortController()
      const signal = controller.signal, current = () => !disposed && request === sequence && !signal.aborted
      loading.value = true; error.value = ''; items.value = []
      try {
        const result = await withDeadline(child => loader(search, child), timeoutMs, signal, '筛选项加载超时，请重试。')
        if (!current()) return
        if (!Array.isArray(result) || result.length > 10000) throw new Error('选项接口返回的数据无效。')
        const seen = new Set<string>()
        items.value = result.map(option => {
          if (!option || typeof option.label !== 'string' || option.label.length > 2000
            || !(option.value === null || typeof option.value === 'boolean' || typeof option.value === 'string' && option.value.length <= 2000 || typeof option.value === 'number' && Number.isFinite(option.value))) throw new Error('选项接口返回的数据无效。')
          return { value: option.value, label: option.label, ...(Number.isSafeInteger(option.count) && Number(option.count) >= 0 ? { count: option.count } : {}) }
        }).filter(option => { const key = typedKey(option.value); if (seen.has(key)) return false; seen.add(key); return true })
      } catch (cause) { if (current()) error.value = cause instanceof Error ? cause.message : String(cause) }
      finally { if (current()) loading.value = false }
    },
    dispose() { disposed = true; ++sequence; controller?.abort(); loading.value = false },
  }
}
