import type {JSONContent} from '@tiptap/core'
import type {Node as ProseMirrorNode} from '@tiptap/pm/model'
import {readRichAttributes, readRichDocument, richText, type RichAttributes, type RichDocument, type RichOperation, type RichReadOptions} from './document'

/** The persisted format stays insert-only. Tiptap JSON is an editor implementation detail. */
export function richDocumentToTiptap(value: unknown, options: RichReadOptions = {}): JSONContent {
  const document = readRichDocument(value, options)
  const content: JSONContent[] = []
  let inline: JSONContent[] = []
  function finish(attributes: RichAttributes = {}) {
    const paragraph: JSONContent = {type: 'paragraph', ...(attributes.align ? {attrs: {textAlign: attributes.align}} : {}), content: inline}
    if (attributes.list) {
      const type = attributes.list === 'ordered' ? 'orderedList' : 'bulletList'
      let list = content.at(-1)
      if (list?.type !== type) {list = {type, content: []}; content.push(list)}
      list.content!.push({type: 'listItem', content: [paragraph]})
    } else content.push(paragraph)
    inline = []
  }
  for (const operation of document.ops) {
    const attributes = readRichAttributes(operation.attributes, options.template)
    const marks: NonNullable<JSONContent['marks']> = []
    for (const type of ['bold', 'italic', 'underline', 'strike'] as const) if (attributes[type]) marks.push({type})
    const style = {color: attributes.color, background: attributes.background, font: attributes.font, size: attributes.size}
    const styleEntries = Object.entries(style).filter(([, value]) => value !== undefined)
    if (styleEntries.length) marks.push({type: 'textStyle', attrs: Object.fromEntries(styleEntries)})
    if (attributes.link) marks.push({type: 'link', attrs: {href: attributes.link}})
    const marked = marks.length ? {marks} : {}
    if (typeof operation.insert !== 'string') {
      inline.push({type: 'templateField', attrs: {id: operation.insert.field}, ...marked})
      continue
    }
    const parts = operation.insert.split('\n')
    parts.forEach((part, index) => {
      if (part) inline.push({type: 'text', text: part, ...marked})
      if (index < parts.length - 1) finish(attributes)
    })
  }
  if (inline.length || !content.length) finish()
  return {type: 'doc', content}
}

export function tiptapMarkAttributes(marks: JSONContent['marks'], template = false): RichAttributes {
  const attributes: Record<string, unknown> = {}
  for (const mark of marks ?? []) {
    if (['bold', 'italic', 'underline', 'strike'].includes(mark.type)) attributes[mark.type] = true
    if (mark.type === 'textStyle') Object.assign(attributes, mark.attrs)
    if (mark.type === 'link') attributes.link = mark.attrs?.href
  }
  return readRichAttributes(attributes, template)
}

function collectOperations(json: JSONContent, template = false): RichOperation[] {
  const ops: RichOperation[] = []
  function append(insert: RichOperation['insert'], attributes: RichAttributes = {}) {
    if (!insert) return
    const safe = readRichAttributes(attributes, template), last = ops.at(-1)
    if (typeof insert === 'string' && typeof last?.insert === 'string' && JSON.stringify(last.attributes ?? {}) === JSON.stringify(safe)) last.insert += insert
    else ops.push({insert, ...(Object.keys(safe).length ? {attributes: safe} : {})})
  }
  function visit(node: JSONContent, list?: RichAttributes['list'], align?: RichAttributes['align']) {
    const block = readRichAttributes({align: node.attrs?.textAlign ?? align, list}, template)
    if (node.type === 'text') append(node.text ?? '', tiptapMarkAttributes(node.marks, template))
    else if (node.type === 'templateField' && typeof node.attrs?.id === 'string') append({field: node.attrs.id}, tiptapMarkAttributes(node.marks, template))
    else if (node.type === 'hardBreak') append('\n', block)
    else {
      const kind = node.type === 'bulletList' ? 'bullet' : node.type === 'orderedList' ? 'ordered' : list
      for (const child of node.content ?? []) visit(child, kind, block.align)
      if (node.type === 'paragraph') append('\n', block)
    }
  }
  visit(json)
  return ops
}

export function tiptapToRichDocument(json: JSONContent, options: RichReadOptions = {}): RichDocument {
  return readRichDocument({ops: collectOperations(json, options.template)}, options)
}

export function tiptapCharacterCount(json: JSONContent): number {
  return [...richText({ops: collectOperations(json)}, () => '\ufffc')].length
}

/** Exposed selection offsets retain the existing UTF-16 text/one-unit field convention. */
export function tiptapTextOffset(document: ProseMirrorNode, position: number): number {
  let offset = 0
  document.descendants((node, start) => {
    if (node.isText) offset += Math.max(0, Math.min(node.text?.length ?? 0, position - start))
    else if (node.type.name === 'templateField' || node.type.name === 'hardBreak') {if (position > start) offset++}
    else if (node.type.name === 'paragraph' && position > start + node.nodeSize - 1) offset++
  })
  return offset
}
