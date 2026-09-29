import {onScopeDispose, ref} from 'vue'

/** Owned by the table host so closing a lazy feature does not remove its notice. */
export function useNotice() {
  const notice = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined
  function showNotice(message: string) {
    clearTimeout(timer)
    notice.value = message
    timer = setTimeout(() => { notice.value = '' }, 3000)
  }
  onScopeDispose(() => clearTimeout(timer))
  return {notice, showNotice}
}
