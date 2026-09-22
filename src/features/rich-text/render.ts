import { h, type VNode, type VNodeChild } from 'vue'
import { fontFamilyCss } from '../../config/font-families'
import { readRichDocument, safeLink, type RichAttributes, type RichDocument } from './document'

function inline(text: string, attributes: RichAttributes = {}, interactive = false): VNodeChild {
  let result: VNodeChild = text
  if (attributes.bold) result = h('strong', result)
  if (attributes.italic) result = h('em', result)
  const style = {
    color: attributes.color, backgroundColor: attributes.background,
    fontFamily: attributes.font ? fontFamilyCss(attributes.font) : undefined,
    fontSize: attributes.size,
    textDecoration: [attributes.underline ? 'underline' : '', attributes.strike ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
  }
  result = h('span', { style }, [result])
  const href = safeLink(attributes.link)
  return href && interactive ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, [result]) : result
}
/** Create VNodes from a bounded insert-only document. Never mount input HTML. */
export function renderRichDocument(document: RichDocument, resolve: (id: string) => string = id => `〔${id}〕`, interactive = false): VNode[] {
  const result: VNode[] = []
  let line: VNodeChild[] = []
  let list: { kind: string; items: VNode[] } | null = null
  const flushList = () => { if (list) result.push(h(list.kind, { class: 'bt-rich-list' }, list.items)); list = null }
  const flushLine = (attributes: RichAttributes = {}) => {
    const children = line.length ? line : [h('br')]
    if (attributes.list) {
      const kind = attributes.list === 'ordered' ? 'ol' : 'ul'
      if (list?.kind !== kind) { flushList(); list = { kind, items: [] } }
      list!.items.push(h('li', { style: { textAlign: attributes.align } }, children))
    } else { flushList(); result.push(h('p', { style: { textAlign: attributes.align } }, children)) }
    line = []
  }
  for (const operation of document.ops) {
    if (typeof operation.insert !== 'string') { line.push(inline(resolve(operation.insert.field), operation.attributes)); continue }
    const parts = operation.insert.split('\n')
    parts.forEach((part, index) => {
      if (part) line.push(inline(part, operation.attributes, interactive))
      if (index < parts.length - 1) flushLine(operation.attributes)
    })
  }
  if (line.length) flushLine()
  flushList()
  return result
}
export function normalizeDocument(input: unknown, fields?: string[]): RichDocument {
  return readRichDocument(input, { fields, template: !!fields })
}
