/** A deadline is used only for optional preferences, never for authorization definitions. */
export function withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parent?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController()
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      parent?.removeEventListener('abort', abort)
      callback()
    }
    const abort = () => finish(() => {
      controller.abort()
      reject(new DOMException('配置读取已取消', 'AbortError'))
    })
    const delay = Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : 3000
    const timer = setTimeout(() => finish(() => {
      controller.abort()
      reject(new Error('个人设置读取超时，已使用默认设置。'))
    }), delay)
    parent?.addEventListener('abort', abort, { once: true })
    if (parent?.aborted) { abort(); return }
    Promise.resolve().then(() => operation(controller.signal)).then(
      value => finish(() => resolve(value)),
      error => finish(() => reject(error)),
    )
  })
}
