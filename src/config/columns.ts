import { z } from 'zod'
import {ruleFieldSchemas} from '../features/columns/schema'
import {columnFontFamilies} from './font-families'
import type { UserColumnConfig } from '../types'
import type { DiagnosticReporter } from './diagnostics'
import type { ColumnCapabilities, ConfigurableColumn } from './types'

export const columnTextStyleSchema = z.object({
  fontFamily: z.enum(columnFontFamilies).optional(),
  fontSize: z.number().int().min(10).max(32).optional(),
  fontWeight: z.enum(['normal','500','600','bold']).optional(),
  color: z.string().regex(/^#[\da-fA-F]{6}$/).optional(),
  align: z.enum(['left','center','right']).optional(),
}).strict()
export const fieldSchemas = {
  ...ruleFieldSchemas,
  title: z.string(),
  visible: z.boolean(),
  order: z.number().int().nonnegative(),
  width: z.number().positive(),
  fixed: z.union([z.literal(false), z.literal('left'), z.literal('right')]),
  align: z.enum(['left', 'center', 'right']),
  sortable: z.boolean(),
  headerStyle: columnTextStyleSchema,
  cellStyle: columnTextStyleSchema,
}
const capabilityKeys: Record<keyof UserColumnConfig, keyof ColumnCapabilities> = {
  title: 'rename', visible: 'visible', order: 'order', width: 'width', fixed: 'fixed', align: 'align',
  sortable:'sortable', headerStyle:'headerStyle', cellStyle:'cellStyle',
  content:'content',mapping:'mapping',numberRule:'format',template:'template',filter:'filter',filterable:'filter',emptyText:'content',numberFormat:'format',valueMap:'mapping',
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Read only own properties: column IDs such as __proto__ remain ordinary IDs. */
export function own(object: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined
}

/** Validate serializable fields independently, without applying a column's permissions. */
export function parseColumnPatch(patch: unknown, report?: DiagnosticReporter, path = 'columns'): UserColumnConfig {
  const result: UserColumnConfig = {}
  if (!isRecord(patch)) {
    report?.({ code: 'SchemaValidationError', path, message: '列配置必须是对象。' })
    return result
  }
  for (const key of Object.keys(patch)) {
    const value = patch[key]
    if (value === undefined) continue
    if (!Object.hasOwn(fieldSchemas, key)) {
      report?.({ code: 'SchemaValidationError', path: `${path}.${key}`, message: '不支持此列配置字段。' })
      continue
    }
    const field = key as keyof UserColumnConfig
    const parsed = fieldSchemas[field].safeParse(value)
    if (!parsed.success) {
      report?.({ code: 'SchemaValidationError', path: `${path}.${key}`, message: '列配置字段无效，已保留原值。' })
      continue
    }
    Object.defineProperty(result, key, { value: parsed.data, enumerable: true, configurable: true, writable: true })
  }
  return result
}

export function isColumnCapabilityEnabled(column: ConfigurableColumn, key: keyof ColumnCapabilities): boolean {
  // The flat API predates capabilities. A Definition always receives an explicit object.
  if (column.configurable === undefined) return true
  const capability = column.configurable[key]
  return capability === true || (isRecord(capability) && capability.enabled === true)
}

export function getColumnWidthBounds(column: ConfigurableColumn): { min: number; max: number } {
  const capability = column.configurable?.width
  const constraint = typeof capability === 'object' && capability !== null ? capability : undefined
  const positive = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
  const min = Math.max(positive(constraint?.min, 80), positive(column.minWidth, 0))
  return { min, max: positive(constraint?.max, 500) }
}

export function guardColumnPatch(column: ConfigurableColumn, patch: unknown, report?: DiagnosticReporter): UserColumnConfig {
  const parsed = parseColumnPatch(patch, report, `columns.${column.id}`)
  const result: UserColumnConfig = {}
  for (const key of Object.keys(parsed) as (keyof UserColumnConfig)[]) {
    const value = parsed[key]
    let allowed = isColumnCapabilityEnabled(column, capabilityKeys[key])
    if (allowed && key === 'width') {
      const { min, max } = getColumnWidthBounds(column)
      allowed = (value as number) >= min && (value as number) <= max
    }
    if (allowed && key === 'fixed') {
      const constraint = column.configurable?.fixed
      if (typeof constraint === 'object' && constraint?.allowedValues) allowed = constraint.allowedValues.includes(value as false | 'left' | 'right')
    }
    if (!allowed) {
      report?.({ code: 'CapabilityViolation', path: `columns.${column.id}.${key}`, message: '此修改超出了该列允许的配置范围。' })
      continue
    }
    Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true })
  }
  return result
}

/** Sort movable columns into movable slots, keeping every locked column in its slot. */
export function applyColumnPatches<T extends ConfigurableColumn>(columns: T[], patches: unknown, report?: DiagnosticReporter): T[] {
  if (patches === undefined || patches === null) return columns.map(column => ({ ...column }))
  if (!isRecord(patches)) {
    report?.({ code: 'SchemaValidationError', path: 'columns', message: '列配置必须是按列 ID 索引的对象。' })
    return columns.map(column => ({ ...column }))
  }
  const ids = new Set(columns.map(column => column.id))
  for (const id of Object.keys(patches)) {
    if (!ids.has(id)) report?.({ code: 'SchemaValidationError', path: `columns.${id}`, message: '列不存在或无权访问，已忽略配置。' })
  }
  const entries = columns.map((column, index) => {
    const patch = own(patches, column.id)
    const { order, ...fields } = patch === undefined ? {} : guardColumnPatch(column, patch, report)
    return { column: { ...column, ...fields }, index, order: order ?? index }
  })
  const movable = entries.filter(entry => isColumnCapabilityEnabled(entry.column, 'order'))
    .sort((a, b) => a.order - b.order || a.index - b.index)
  let next = 0
  return entries.map(entry => isColumnCapabilityEnabled(entry.column, 'order') ? movable[next++]!.column : entry.column)
}
