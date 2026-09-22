import { z } from 'zod'
import type { Action, RowData } from '../../types'
import { columnFontFamilies, type ColumnFontFamily } from '../../config/font-families'

export type DisplayMode = 'text' | 'icon-text' | 'icon'
export type ItemPosition = 'direct' | 'more' | 'hidden'
export interface ToolPreference { label?: string; order?: number; position?: ItemPosition; display?: DisplayMode; fixed?: boolean; separator?: boolean }
export interface ActionPreference { label?: string; order?: number; position?: 'inline' | 'more' | 'hidden'; display?: DisplayMode | 'inherit'; group?: 'normal' | 'export' | 'danger'; separator?: boolean }
export interface Appearance {
  fontFamily: ColumnFontFamily; fontSize: number; headerFontSize: number; color: string; headerColor: string
  density: 'compact' | 'default' | 'comfortable'; border: 'horizontal' | 'full' | 'none'
  stripe: boolean; index: boolean; hover: boolean; pageSize: number
}
export interface RowActionLayout { maxInline: number; display: DisplayMode; align: 'left' | 'center' | 'right'; gap: number; grouped: boolean; items: Record<string, ActionPreference> }
export interface ToolbarLayout { followView: boolean; gap: number; page: Record<string, ToolPreference>; table: Record<string, ToolPreference> }
export interface TablePresentation { appearance: Appearance; rowActions: RowActionLayout; toolbar: ToolbarLayout }
export interface PresentationDelta { appearance?: Partial<Appearance>; rowActions?: Partial<RowActionLayout>; toolbar?: Partial<ToolbarLayout> }
export interface ToolDefinition {
  id: string; label: string; icon?: string; order?: number; position?: ItemPosition; display?: DisplayMode
  fixed?: boolean; immutable?: boolean; separator?: boolean; disabled?: boolean; active?: boolean
  handler?: (event: Event) => void | Promise<void>
}
export interface PresentedAction<T extends RowData = RowData> extends Action<T> { display?: DisplayMode; group?: 'normal' | 'export' | 'danger' }

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const own = (value: Record<string, unknown>, key: string): unknown => Object.hasOwn(value, key) ? value[key] : undefined
const color = z.string().regex(/^#[\da-fA-F]{6}$/)
const display = z.enum(['text', 'icon-text', 'icon'])
const appearanceFields = {
  fontFamily: z.enum(columnFontFamilies), fontSize: z.number().int().min(10).max(32), headerFontSize: z.number().int().min(10).max(32), color, headerColor: color,
  density: z.enum(['compact', 'default', 'comfortable']), border: z.enum(['horizontal', 'full', 'none']), stripe: z.boolean(), index: z.boolean(), hover: z.boolean(), pageSize: z.number().int().positive().max(1000),
}
const actionFields = { label: z.string().trim().min(1).max(80), order: z.number().int().min(0).max(500), position: z.enum(['inline', 'more', 'hidden']), display: z.enum(['text', 'icon-text', 'icon', 'inherit']), group: z.enum(['normal', 'export', 'danger']), separator: z.boolean() }
const toolFields = { label: z.string().trim().min(1).max(80), order: z.number().int().min(0).max(500), position: z.enum(['direct', 'more', 'hidden']), display, fixed: z.boolean(), separator: z.boolean() }
function fields<T extends object>(input: unknown, schemas: Record<string, z.ZodType>, base: T): T {
  const record = object(input), result = { ...base }
  for (const [key, schema] of Object.entries(schemas)) {
    const raw = own(record, key)
    if (raw === undefined) continue
    const parsed = schema.safeParse(raw)
    if (parsed.success) Object.defineProperty(result, key, { value: parsed.data, enumerable: true, writable: true, configurable: true })
  }
  return result
}
function itemMap<T extends object>(input: unknown, schema: Record<string, z.ZodType>, base: Record<string, T> = {}): Record<string, T> {
  const result: Record<string, T> = Object.create(null)
  for (const [id, item] of Object.entries(base)) result[id] = { ...item }
  for (const [id, item] of Object.entries(object(input)).slice(0, 200)) {
    if (!id || id.length > 160) continue
    result[id] = fields(item, schema, result[id] ?? {} as T)
  }
  return result
}
export function defaultPresentation(): TablePresentation {
  return {
    appearance: { fontFamily: 'system', fontSize: 14, headerFontSize: 14, color: '#334155', headerColor: '#334155', density: 'default', border: 'horizontal', stripe: false, index: false, hover: true, pageSize: 10 },
    rowActions: { maxInline: 2, display: 'text', align: 'left', gap: 12, grouped: true, items: {} },
    toolbar: { followView: false, gap: 4, page: {}, table: {} },
  }
}
/** All entry points use the same whitelist. Invalid fields do not discard valid siblings. */
export function resolvePresentation(input?: unknown, base = defaultPresentation()): TablePresentation {
  const record = object(input)
  const actions = object(own(record, 'rowActions')), tools = object(own(record, 'toolbar'))
  return {
    appearance: fields(own(record, 'appearance'), appearanceFields, base.appearance),
    rowActions: { ...fields(actions, { maxInline: z.number().int().min(0).max(4), display, align: z.enum(['left', 'center', 'right']), gap: z.number().int().min(0).max(32), grouped: z.boolean() }, base.rowActions), items: itemMap(own(actions, 'items'), actionFields, base.rowActions.items) },
    toolbar: { ...fields(tools, { followView: z.boolean(), gap: z.number().int().min(0).max(24) }, base.toolbar), page: itemMap(own(tools, 'page'), toolFields, base.toolbar.page), table: itemMap(own(tools, 'table'), toolFields, base.toolbar.table) },
  }
}
function difference(current: unknown, base: unknown): unknown {
  if (JSON.stringify(current) === JSON.stringify(base)) return undefined
  if (current === null || typeof current !== 'object' || Array.isArray(current)) return current
  const result: Record<string, unknown> = Object.create(null)
  for (const [key, value] of Object.entries(current)) {
    const diff = difference(value, own(object(base), key))
    if (diff !== undefined) result[key] = diff
  }
  return Object.keys(result).length ? result : undefined
}
export function presentationDelta(presentation: TablePresentation, base = defaultPresentation()): PresentationDelta {
  return difference(resolvePresentation(presentation), base) as PresentationDelta ?? {}
}
export function presentActions<T extends RowData>(registered: readonly Action<T>[], layout: RowActionLayout): PresentedAction<T>[] {
  const resolve = (items: readonly Action<T>[], depth: number): PresentedAction<T>[] => {
    if (depth > 4) return []
    const seen = new Set<string>(), result: PresentedAction<T>[] = []
    for (const item of items) {
      if (!item.id || seen.has(item.id)) continue
      seen.add(item.id)
      const preference = Object.hasOwn(layout.items, item.id) ? layout.items[item.id]! : {}
      if (item.visible === false || preference.position === 'hidden') continue
      const children = item.children ? resolve(item.children, depth + 1) : undefined
      if (children && !children.length) continue
      const next: PresentedAction<T> = {
        ...item, ...(children ? { children } : {}),
        label: item.danger ? item.label : preference.label ?? item.label,
        position: preference.position === 'inline' || preference.position === 'more' ? preference.position : item.position ?? 'inline',
        display: preference.display && preference.display !== 'inherit' ? preference.display : layout.display,
        order: preference.order ?? item.order ?? 0,
        group: item.danger ? 'danger' : preference.group ?? item.group ?? (children ? 'export' : 'normal'),
        separator: preference.separator ?? item.separator,
      }
      result.push(next)
    }
    return result.sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
  }
  return resolve(registered, 0)
}
export function presentTools(registered: readonly ToolDefinition[], preferences: Record<string, ToolPreference>): ToolDefinition[] {
  const seen = new Set<string>()
  return registered.flatMap(item => {
    if (!item.id || seen.has(item.id)) return []
    seen.add(item.id)
    const preference = Object.hasOwn(preferences, item.id) ? preferences[item.id]! : {}
    const position = item.immutable ? 'direct' : preference.position ?? item.position ?? 'direct'
    if (position === 'hidden') return []
    return [{ ...item, label: preference.label ?? item.label, order: preference.order ?? item.order ?? 0, display: preference.display ?? item.display ?? 'icon-text', position, fixed: item.immutable || (preference.fixed ?? item.fixed ?? false), separator: preference.separator ?? item.separator }]
  }).sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
}
