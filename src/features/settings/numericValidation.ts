import { provide, ref, type InjectionKey } from 'vue'

export interface NumericDraft { text: string; message: string; value?: number; inheritedValue?: number }
interface NumericValidation {
  read: (path: readonly string[]) => NumericDraft | undefined
  report: (path: readonly string[], draft?: NumericDraft) => void
  register: (id: string, path: readonly string[], reset: () => void) => void
  unregister: (id: string) => void
}
export const numericValidationKey: InjectionKey<NumericValidation> = Symbol('settings-numeric-validation')

/** Invalid input stays in the settings session across tab/column changes, outside persisted configuration. */
export function provideNumericValidation() {
  const errors = ref<Record<string, string>>({})
  const drafts = new Map<string, {path: readonly string[]; draft: NumericDraft}>()
  const controls = new Map<string, {path: readonly string[]; reset: () => void}>()
  const matches = (path: readonly string[], prefix: readonly string[]) => prefix.every((part, index) => path[index] === part)
  function report(path: readonly string[], draft?: NumericDraft) {
    const key = JSON.stringify(path)
    if (draft) {drafts.set(key, {path, draft});errors.value[key] = draft.message}
    else {drafts.delete(key);delete errors.value[key]}
  }
  provide(numericValidationKey, {
    read: path => drafts.get(JSON.stringify(path))?.draft, report,
    register: (id, path, reset) => controls.set(id, {path, reset}),
    unregister: id => {controls.delete(id)},
  })
  function reset(prefix: readonly string[] = []) {
    for (const {path} of drafts.values()) if (matches(path, prefix)) report(path)
    for (const control of controls.values()) if (matches(control.path, prefix)) control.reset()
  }
  return {errors, reset, prune: (canEdit: (path: readonly string[]) => boolean) => {
    for (const {path} of drafts.values()) if (!canEdit(path)) reset(path)
  }}
}
