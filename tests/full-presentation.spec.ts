import { describe, expect, it } from 'vitest'
import { defaultPresentation, resolvePresentation, presentActions, presentationDelta, presentTools } from '../src/features/presentation/model'
import type { Action } from '../src/types'

describe('presentation configuration is data and cannot change capabilities', () => {
  it('normalizes safe appearance while discarding invalid values independently', () => {
    const value = resolvePresentation({ appearance: { density: 'compact', fontSize: 999, color: 'url(javascript:evil)', stripe: true, pageSize: 25 } })
    expect(value.appearance.density).toBe('compact')
    expect(value.appearance.fontSize).toBe(14)
    expect(value.appearance.color).toBe('#334155')
    expect(value.appearance.stripe).toBe(true)
    expect(value.appearance.pageSize).toBe(25)
  })
  it('keeps defaults immutable and saves only differences', () => {
    const original = JSON.stringify(defaultPresentation())
    const value = resolvePresentation({ appearance: { density: 'compact' } })
    expect(presentationDelta(value)).toEqual({ appearance: { density: 'compact' } })
    expect(JSON.stringify(defaultPresentation())).toBe(original)
  })
  it('ignores unregistered actions and protects destructive names and intent', () => {
    const actions: Action[] = [{ id: 'view', label: '查看' }, { id: 'delete', label: '删除', danger: true }]
    const config = resolvePresentation({ rowActions: { items: { unknown: { label: 'Injected' }, delete: { label: '安全操作', danger: false }, view: { label: '详情', position: 'more' } } } })
    const result = presentActions(actions, config.rowActions)
    expect(result.map(item => item.id)).toEqual(['view', 'delete'])
    expect(result[0].label).toBe('详情')
    expect(result[0].position).toBe('more')
    expect(result[1]).toMatchObject({ label: '删除', danger: true })
  })
  it('hides a parent with no allowed visible children and cannot enable a hidden registered action', () => {
    const actions: Action[] = [{ id: 'no', label: 'No', visible: false }, { id: 'export', label: '导出', children: [{ id: 'csv', label: 'CSV' }] }]
    const p = resolvePresentation({ rowActions: { items: { no: { position: 'inline' }, csv: { position: 'hidden' } } } })
    expect(presentActions(actions, p.rowActions)).toEqual([])
  })
  it('preserves immutable toolbar entries and applies only registered ids', () => {
    const tools = [{ id: 'settings', label: '表格设置', immutable: true }, { id: 'reload', label: '刷新' }]
    const p = resolvePresentation({ toolbar: { table: { settings: { position: 'hidden', fixed: false }, reload: { label: '刷新列表', position: 'more' } } } })
    const result = presentTools(tools, p.toolbar.table)
    expect(result[0]).toMatchObject({ id: 'settings', position: 'direct', fixed: true })
    expect(result[1]).toMatchObject({ id: 'reload', label: '刷新列表', position: 'more' })
  })
})
