/** Cache code only. Intent must never instantiate a feature or read its data. */
export function createModuleLoader<T>(loader: () => Promise<T>) {
  let pending: Promise<T> | undefined
  function load(): Promise<T> {
    return pending ??= Promise.resolve().then(loader).catch(cause => {
      pending = undefined
      throw cause
    })
  }
  async function preload(): Promise<void> {
    try { await load() } catch { /* The explicit open retries and reports failures. */ }
  }
  return { load, preload }
}
