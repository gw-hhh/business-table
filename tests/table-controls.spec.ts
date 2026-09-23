import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useTableControls } from '../src/features/presentation/useTableControls'

describe('workspace control preferences', () => {
  it('restores and saves only query visibility and expansion', async () => {
    let saved: unknown = { advanced: true, searchVisible: false, selectionVisible: true }
    const save = vi.fn((value: unknown) => { saved = value })
    const scope = effectScope()
    const controls = scope.run(() => useTableControls({}, { persistence: { load: () => saved, save } }))!
    expect(controls.advanced.value).toBe(true)
    expect(controls.searchVisible.value).toBe(false)
    expect(controls.selectionVisible.value).toBe(false)
    controls.selectionVisible.value = true
    await nextTick()
    expect(save).not.toHaveBeenCalled()
    controls.advanced.value = false; controls.searchVisible.value = true
    await nextTick()
    expect(saved).toEqual({ advanced: false, searchVisible: true })
    scope.stop()
    const nextScope = effectScope()
    const next = nextScope.run(() => useTableControls({}, { persistence: { load: () => JSON.stringify(saved), save } }))!
    expect(next.advanced.value).toBe(false)
    expect(next.searchVisible.value).toBe(true)
    expect(next.selectionVisible.value).toBe(false)
    nextScope.stop()
  })

  it.each(['{broken', { advanced: 'yes', searchVisible: false }, 42])('falls back to declared defaults for malformed storage %#', async saved => {
    const onError = vi.fn(), scope = effectScope()
    const controls = scope.run(() => useTableControls({ advanced: true }, { persistence: { load: () => saved, save: () => {} }, onError }))!
    expect(controls.advanced.value).toBe(true)
    expect(controls.searchVisible.value).toBe(true)
    expect(onError).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('keeps controls usable when storage load or save throws', async () => {
    const onError = vi.fn(), scope = effectScope()
    const controls = scope.run(() => useTableControls({}, { persistence: { load() { throw new Error('denied') }, save() { throw new Error('quota') } }, onError }))!
    expect(controls.searchVisible.value).toBe(true)
    controls.advanced.value = true
    await nextTick()
    expect(controls.advanced.value).toBe(true)
    expect(onError.mock.calls.map(([cause]) => (cause as Error).message)).toEqual(['denied', 'quota'])
    scope.stop()
  })
})
