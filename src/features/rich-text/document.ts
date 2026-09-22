import type { ColumnFontFamily } from '../../config/font-families'
import { columnFontFamilies } from '../../config/font-families'

export interface RichAttributes {
  bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean
  color?: string; background?: string; font?: ColumnFontFamily
  size?: string; align?: 'left' | 'center' | 'right'; list?: 'ordered' | 'bullet'; link?: string
}
export interface RichOperation { insert: string | { field: string }; attributes?: RichAttributes }
export interface RichDocument { ops: RichOperation[] }
export interface RichReadOptions { maxChars?: number; fields?: readonly string[]; template?: boolean }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export const hexColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)

export function safeLink(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1000 || /[\u0000-\u0020\u007f]/.test(value)) return ''
  try {
    const parsed = new URL(value)
    return ['https:', 'http:', 'mailto:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : ''
  } catch { return '' }
}
export function readRichAttributes(value: unknown, template = false): RichAttributes {
  if (!object(value)) return {}
  const result: RichAttributes = {}
  for (const key of ['bold', 'italic', 'underline', 'strike'] as const) if (value[key] === true) result[key] = true
  for (const key of ['color', 'background'] as const) if (hexColor(value[key])) result[key] = (value[key] as string).toLowerCase()
  if (columnFontFamilies.includes(value.font as ColumnFontFamily)) result.font = value.font as ColumnFontFamily
  if (typeof value.size === 'string' && /^(10|11|12|13|14|15|16|18|20|22|24|28|32)px$/.test(value.size)) result.size = value.size
  if (['left', 'center', 'right'].includes(String(value.align))) result.align = value.align as RichAttributes['align']
  if (['ordered', 'bullet'].includes(String(value.list))) result.list = value.list as RichAttributes['list']
  const link = safeLink(value.link)
  if (link && !template) result.link = link
  return result
}

/** Accept insert-only data, never executable HTML, scripts, images or arbitrary CSS. */
export function readRichDocument(value: unknown, options: RichReadOptions = {}): RichDocument {
  const maximum = Math.min(10000, Math.max(1, options.maxChars ?? 3000))
  const source = object(value) && Array.isArray(value.ops) ? value.ops : typeof value === 'string' ? [{ insert: value }] : []
  const operations: RichOperation[] = []
  let remaining = maximum
  for (const raw of source.slice(0, 2000)) {
    if (!object(raw) || remaining <= 0) break
    let insert: RichOperation['insert']
    if (typeof raw.insert === 'string') {
      insert = [...raw.insert.replace(/\r\n?/g, '\n')].slice(0, remaining).join('')
      remaining -= [...insert].length
      if (!insert) continue
    } else if (object(raw.insert) && typeof raw.insert.field === 'string'
      && options.template !== false && options.fields?.includes(raw.insert.field)) {
      insert = { field: raw.insert.field }; remaining--
    } else continue
    const attributes = readRichAttributes(raw.attributes, options.template)
    operations.push(Object.keys(attributes).length ? { insert, attributes } : { insert })
  }
  if (!operations.length || typeof operations.at(-1)?.insert !== 'string' || !(operations.at(-1)!.insert as string).endsWith('\n')) operations.push({ insert: '\n' })
  return { ops: operations }
}
export function richText(document: RichDocument, resolve: (field: string) => string = field => `〔${field}〕`): string {
  return document.ops.map(operation => typeof operation.insert === 'string' ? operation.insert : resolve(operation.insert.field)).join('').replace(/\n$/, '')
}
