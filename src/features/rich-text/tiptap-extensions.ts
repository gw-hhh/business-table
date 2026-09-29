import {Extension, Node, type Extensions} from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {TextStyle} from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import {Plugin, TextSelection} from '@tiptap/pm/state'
import {watchEffect} from 'vue'
import {fontFamilyCss} from '../../config/font-families'
import {readRichAttributes, safeLink, type RichReadOptions} from './document'
import {richDocumentToTiptap, tiptapCharacterCount, tiptapToRichDocument} from './tiptap-document'

export interface RichEditorExtensionOptions {
  readOptions: () => RichReadOptions
  fields: () => readonly {id: string; title: string}[]
  onLimit: (maximum: number) => void
}

const SupportedTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      color: {default: null, renderHTML: attributes => {
        const value = readRichAttributes(attributes).color
        return value ? {style: `color:${value}`} : {}
      }},
      background: {default: null, renderHTML: attributes => {
        const value = readRichAttributes(attributes).background
        return value ? {style: `background-color:${value}`} : {}
      }},
      font: {default: null, renderHTML: attributes => {
        const value = readRichAttributes(attributes).font
        return value ? {'data-bt-font': value, style: `font-family:${fontFamilyCss(value)}`} : {}
      }},
      size: {default: null, renderHTML: attributes => {
        const value = readRichAttributes(attributes).size
        return value ? {style: `font-size:${value}`} : {}
      }},
    }
  },
})

export function richEditorExtensions(options: RichEditorExtensionOptions): Extensions {
  const FlatListItem = Node.create({
    name: 'listItem', content: 'paragraph+', defining: true,
    parseHTML: () => [{tag: 'li'}],
    renderHTML: () => ['li', 0],
    addCommands: () => ({sinkListItem: () => () => false}),
    addKeyboardShortcuts() {
      return {Enter: () => this.editor.commands.splitListItem(this.name)}
    },
  })
  const TemplateField = Node.create({
    name: 'templateField', group: 'inline', inline: true, atom: true, selectable: true, draggable: false,
    addAttributes: () => ({id: {default: '', parseHTML: element => element.getAttribute('data-bt-field')}}),
    parseHTML: () => [{tag: 'span[data-bt-field]'}],
    renderHTML({node}) {
      const id = String(node.attrs.id)
      return ['span', {'data-bt-field': id, class: 'bt-editor-field', contenteditable: 'false'}, options.fields().find(field => field.id === id)?.title ?? id]
    },
    addNodeView() {
      return ({node}) => {
        const dom = document.createElement('span')
        dom.className = 'bt-editor-field'
        dom.setAttribute('contenteditable', 'false')
        dom.setAttribute('data-bt-field', String(node.attrs.id))
        const stop = watchEffect(() => {dom.textContent = options.fields().find(field => field.id === node.attrs.id)?.title ?? String(node.attrs.id)})
        return {dom, ignoreMutation: () => true, destroy: stop}
      }
    },
  })
  const BoundDocument = Extension.create({
    name: 'boundedRichDocument',
    addProseMirrorPlugins() {
      const editor = this.editor
      return [new Plugin({
        appendTransaction(transactions, _oldState, state) {
          if (!transactions.some(transaction => transaction.docChanged || transaction.getMeta('rich-composition-end'))) return null
          if (editor.view.composing) return null
          const readOptions = options.readOptions()
          const maximum = Math.min(10000, Math.max(1, readOptions.maxChars ?? 3000))
          if (tiptapCharacterCount(state.doc.toJSON()) <= maximum) return null
          const normalized = tiptapToRichDocument(state.doc.toJSON(), {...readOptions, maxChars: maximum})
          const content = state.schema.nodeFromJSON(richDocumentToTiptap(normalized, {...readOptions, maxChars: maximum})).content
          const transaction = state.tr.replaceWith(0, state.doc.content.size, content)
          transaction.setSelection(TextSelection.near(transaction.doc.resolve(Math.min(state.selection.from, transaction.doc.content.size))))
          options.onLimit(maximum)
          return transaction
        },
      })]
    },
  })
  return [
    StarterKit.configure({
      blockquote: false, code: false, codeBlock: false, heading: false, horizontalRule: false, trailingNode: false,
      listItem: false,
      link: options.readOptions().template ? false : {openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: value => !!safeLink(value)},
    }),
    FlatListItem,
    SupportedTextStyle,
    TextAlign.configure({types: ['paragraph'], alignments: ['left', 'center', 'right']}),
    ...(options.readOptions().template ? [TemplateField] : []),
    BoundDocument,
  ]
}
