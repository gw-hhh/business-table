import { readonly, shallowRef } from 'vue'
import { readFilterOptions, type FilterOption } from './model'
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
        items.value = readFilterOptions(result)
      } catch (cause) { if (current()) error.value = cause instanceof Error ? cause.message : String(cause) }
      finally { if (current()) loading.value = false }
    },
    dispose() { disposed = true; ++sequence; controller?.abort(); loading.value = false },
  }
}
