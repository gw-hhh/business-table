import { describe, expect, it } from 'vitest'
import type { ConfigDiagnostic } from '../src/config/diagnostics'
import { createRegistry, resolveRenderer, resolveRowActions } from '../src/runtime/registry'

type TestRow = { id: string; locked: boolean; available: boolean }
const row: TestRow = { id: 'A-1', locked: false, available: true }

describe('runtime registry', () => {
  it('rejects duplicate IDs within a kind and keeps the first implementation', () => {
    const diagnostics: ConfigDiagnostic[] = []
    const registry = createRegistry<TestRow>({ onDiagnostic: diagnostic => diagnostics.push(diagnostic) })
    const first = (value: unknown) => `first:${value}`

    expect(registry.register('renderer', 'status', first)).toBe(true)
    expect(registry.register('renderer', 'status', () => 'replacement')).toBe(false)
    expect(resolveRenderer(registry, 'status')('ready')).toBe('first:ready')
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'SchemaValidationError', path: 'registry.renderer.status' })])
  })

  it('keeps namespaces independent and reports a missing lookup without throwing', () => {
    const diagnostics: ConfigDiagnostic[] = []
    const registry = createRegistry<TestRow>({ onDiagnostic: diagnostic => diagnostics.push(diagnostic) })
    registry.register('rowAction', 'status', { id: 'status', label: 'Status', handler() {} })
    registry.register('renderer', 'status', value => `Status ${value}`)

    expect(registry.get('rowAction', 'status')?.label).toBe('Status')
    expect(resolveRenderer(registry, 'status')('open')).toBe('Status open')
    expect(registry.get('exporter', 'missing')).toBeUndefined()
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'UnknownRegistryId', path: 'registry.exporter.missing' })])
  })

  it('falls back to plain text for unknown renderers and preserves false and zero', () => {
    const diagnostics: ConfigDiagnostic[] = []
    const registry = createRegistry({ onDiagnostic: diagnostic => diagnostics.push(diagnostic) })
    const render = resolveRenderer(registry, 'unavailable')

    expect([render(null), render(undefined), render(false), render(0), render('<b>safe text</b>')])
      .toEqual(['—', '—', 'false', '0', '<b>safe text</b>'])
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'UnknownRegistryId', path: 'registry.renderer.unavailable' })])
  })

  it('uses plain text without a missing-ID diagnostic when no renderer is requested', () => {
    const diagnostics: ConfigDiagnostic[] = []
    const registry = createRegistry({ onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

    expect(resolveRenderer(registry)('value')).toBe('value')
    expect(diagnostics).toEqual([])
  })

  it('intersects allowed, registered and visible actions without allowing configured escalation', () => {
    const diagnostics: ConfigDiagnostic[] = []
    const registry = createRegistry<TestRow>({ onDiagnostic: diagnostic => diagnostics.push(diagnostic) })
    registry.register('rowAction', 'edit', { id: 'edit', label: 'Edit', handler() {} })
    registry.register('rowAction', 'delete', { id: 'delete', label: 'Delete', handler() {} })
    registry.register('rowAction', 'hidden', { id: 'hidden', label: 'Hidden', visible: false, handler() {} })
    registry.register('rowAction', 'configured-hidden', { id: 'configured-hidden', label: 'Hidden by config', handler() {} })

    const actions = resolveRowActions(registry, ['edit', 'missing', 'hidden', 'configured-hidden', 'edit'], [
      { id: 'delete', visible: true },
      { id: 'missing', visible: true },
      { id: 'hidden', visible: true },
      { id: 'configured-hidden', visible: false }
    ])

    expect(actions.map(action => action.id)).toEqual(['edit'])
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'UnknownRegistryId', path: 'registry.rowAction.missing' })])
  })

  it('keeps row predicates for deferred rendering and filters with the supplied row', () => {
    const registry = createRegistry<TestRow>()
    const visible = (item: TestRow) => item.available
    const disabled = (item: TestRow) => item.locked
    registry.register('rowAction', 'edit', { id: 'edit', label: 'Edit', visible, disabled, handler() {} })

    const deferred=resolveRowActions(registry, ['edit'])[0]!
    expect(typeof deferred.visible).toBe('function')
    expect(typeof deferred.disabled).toBe('function')
    if(typeof deferred.visible==='function') {
      expect(deferred.visible(row)).toBe(true)
      expect(deferred.visible({...row,available:false})).toBe(false)
    }
    if(typeof deferred.disabled==='function') {
      expect(deferred.disabled({...row,locked:true})).toBe(true)
      expect(deferred.disabled({...row,locked:false})).toBe(false)
    }
    expect(resolveRowActions(registry, ['edit'], undefined, row).map(action => action.id)).toEqual(['edit'])
    expect(resolveRowActions(registry, ['edit'], [{ id: 'edit', visible: true }], { ...row, available: false })).toEqual([])
  })

  it('applies presentation overrides in order while keeping executable behavior in code', async () => {
    const executed: string[] = []
    const registry = createRegistry<TestRow>()
    const registered = { id: 'edit', label: 'Edit', position: 'inline' as const, order: 20, handler: (item: TestRow) => { executed.push(item.id) } }
    registry.register('rowAction', 'edit', registered)
    registry.register('rowAction', 'view', { id: 'view', label: 'View', order: 10, handler() {} })
    const config = {
      id: 'edit', label: 'Change', position: 'more' as const, order: 0,
      get handler(): never { throw new Error('Configuration must not provide executable behavior') }
    }

    const actions = resolveRowActions(registry, ['view', 'edit'], [config])
    expect(actions.map(action => action.id)).toEqual(['edit', 'view'])
    expect(actions[0]).toMatchObject({ label: 'Change', position: 'more', order: 0 })
    await actions[0].handler?.(row)
    expect(executed).toEqual(['A-1'])
    expect(registered).toMatchObject({ label: 'Edit', position: 'inline', order: 20 })
  })

  it('blocks disabled execution even when a consumer invokes the resolved handler directly', async () => {
    const executed: string[] = []
    const registry = createRegistry<TestRow>()
    registry.register('rowAction', 'edit', {
      id: 'edit', label: 'Edit', disabled: item => item.locked,
      handler: async item => { executed.push(item.id) }
    })
    registry.register('rowAction', 'delete', {
      id: 'delete', label: 'Delete', disabled: true,
      handler: item => { executed.push(`delete:${item.id}`) }
    })
    const actions = resolveRowActions(registry, ['edit', 'delete'], undefined, row)

    expect(actions.map(action => action.id)).toEqual(['edit', 'delete'])
    await actions[0].handler?.({ ...row, locked: true })
    await actions[1].handler?.(row)
    expect(executed).toEqual([])
    await actions[0].handler?.(row)
    expect(executed).toEqual(['A-1'])
  })

  it('rechecks visibility at execution time after row state changes', async () => {
    const executed: string[] = []
    const registry = createRegistry<TestRow>()
    registry.register('rowAction', 'edit', {
      id: 'edit', label: 'Edit', visible: item => item.available,
      handler: item => { executed.push(item.id) }
    })
    const [action] = resolveRowActions(registry, ['edit'], undefined, row)

    expect(action).toBeDefined()
    await action.handler?.({ ...row, available: false })
    expect(executed).toEqual([])
    await action.handler?.(row)
    expect(executed).toEqual(['A-1'])
  })
})
