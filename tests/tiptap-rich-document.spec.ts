import {afterEach, describe, expect, it, vi} from 'vitest'
import {Editor} from '@tiptap/core'
import {richDocumentToTiptap, tiptapCharacterCount, tiptapToRichDocument, tiptapTextOffset} from '../src/features/rich-text/tiptap-document'
import {richEditorExtensions} from '../src/features/rich-text/tiptap-extensions'
import {readRichDocument, richText, type RichReadOptions, type RichDocument} from '../src/features/rich-text/document'
import {renderRichDocument} from '../src/features/rich-text/render'

const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()))
function createEditor(value: unknown = '', options: RichReadOptions = {}, onLimit = vi.fn()) {
  const editor = new Editor({
    content: richDocumentToTiptap(value, options),
    extensions: richEditorExtensions({readOptions: () => options, fields: () => [{id: 'name', title: '名称'}], onLimit}),
    injectCSS: false,
  })
  editors.push(editor)
  return editor
}

describe('RichDocument and Tiptap boundary', () => {
  it('roundtrips every supported inline style, link, list and alignment into the old renderer', () => {
    const source: RichDocument = {ops: [
      {insert: '样式', attributes: {bold: true, italic: true, underline: true, strike: true, color: '#123456', background: '#abcdef', font: 'yahei', size: '24px', link: 'https://example.com/a'}},
      {insert: '\n', attributes: {list: 'ordered', align: 'center'}},
      {insert: '下一段'}, {insert: '\n', attributes: {align: 'right'}},
    ]}
    const result = tiptapToRichDocument(richDocumentToTiptap(source))
    expect(result).toEqual(source)
    expect(renderRichDocument(result)[0]?.type).toBe('ol')
    expect(renderRichDocument(result)[1]?.props?.style).toEqual({textAlign: 'right'})
  })

  it('reads old documents without retaining unsupported values or unknown field IDs', () => {
    const source = {ops: [{insert: '安全', attributes: {color: 'url(x)', font: 'evil', link: 'javascript:alert(1)', bold: true}}, {insert: {field: 'name'}}, {insert: {field: 'secret'}}]}
    const options = {template: true, fields: ['name']}
    const editor = createEditor(source, options)
    const result = tiptapToRichDocument(editor.getJSON(), options)
    expect(richText(result, id => id)).toBe('安全name')
    expect(result.ops[0]?.attributes).toEqual({bold: true})
    expect(editor.getHTML()).not.toContain('javascript:')
    expect(editor.getHTML()).toContain('contenteditable="false"')
  })

  it('formats selected text through ProseMirror transactions and undoes/redoes the actual change', () => {
    const editor = createEditor('甲乙丙')
    editor.commands.setTextSelection({from: 2, to: 3})
    editor.commands.toggleBold()
    expect(tiptapToRichDocument(editor.getJSON()).ops.find(operation => operation.insert === '乙')?.attributes?.bold).toBe(true)
    editor.commands.undo()
    expect(tiptapToRichDocument(editor.getJSON()).ops.some(operation => operation.attributes?.bold)).toBe(false)
    editor.commands.redo()
    expect(editor.getHTML()).toContain('<strong>乙</strong>')
  })

  it('applies collapsed-cursor marks to text input instead of rewriting DOM', () => {
    const editor = createEditor('')
    editor.commands.toggleItalic()
    editor.view.dispatch(editor.state.tr.insertText('新文字'))
    expect(tiptapToRichDocument(editor.getJSON()).ops).toContainEqual({insert: '新文字', attributes: {italic: true}})
  })

  it('creates real list nodes, preserves paragraph alignment and clears formatting', () => {
    const editor = createEditor('一\n二')
    editor.commands.selectAll()
    editor.chain().toggleBulletList().setTextAlign('center').run()
    expect(editor.getHTML()).toContain('<ul>')
    const result = tiptapToRichDocument(editor.getJSON())
    expect(result.ops.filter(operation => operation.attributes?.list === 'bullet')).toHaveLength(2)
    editor.chain().unsetAllMarks().clearNodes().unsetTextAlign().run()
    expect(richText(tiptapToRichDocument(editor.getJSON()))).toBe('一\n二')
    expect(editor.getHTML()).not.toContain('<ul>')
  })

  it('counts fields as one character and clips Unicode text without splitting surrogate pairs', () => {
    const onLimit = vi.fn(), options = {template: true, fields: ['name'], maxChars: 3}
    const editor = createEditor({ops: [{insert: {field: 'name'}}, {insert: '\n'}]}, options, onLimit)
    editor.commands.setTextSelection(2)
    editor.commands.insertContent('😊甲乙')
    expect(richText(tiptapToRichDocument(editor.getJSON(), options), () => '■')).toBe('■😊甲')
    expect(tiptapCharacterCount(editor.getJSON())).toBe(3)
    expect(onLimit).toHaveBeenCalledWith(3)
    editor.commands.undo()
    expect(richText(tiptapToRichDocument(editor.getJSON(), options), () => '■')).toBe('■')
    editor.commands.redo()
    expect(tiptapCharacterCount(editor.getJSON())).toBe(3)
  })

  it('deletes a field atomically and restores its stable ID on undo', () => {
    const options = {template: true, fields: ['name']}
    const editor = createEditor({ops: [{insert: '前'}, {insert: {field: 'name'}}, {insert: '后\n'}]}, options)
    editor.commands.setNodeSelection(2)
    editor.commands.deleteSelection()
    expect(richText(tiptapToRichDocument(editor.getJSON(), options))).toBe('前后')
    editor.commands.undo()
    expect(tiptapToRichDocument(editor.getJSON(), options).ops).toContainEqual({insert: {field: 'name'}})
    expect(tiptapTextOffset(editor.state.doc, 3)).toBe(2)
  })

  it('excludes unsupported editor nodes and template links from the schema', () => {
    const editor = createEditor('', {template: true})
    expect(editor.schema.nodes.image).toBeUndefined()
    expect(editor.schema.nodes.heading).toBeUndefined()
    expect(editor.schema.marks.link).toBeUndefined()
    expect(richText(tiptapToRichDocument(editor.getJSON()))).toBe('')
  })

  it('cannot create nested lists that the persisted protocol cannot represent', () => {
    const editor = createEditor('一\n二')
    editor.commands.selectAll()
    editor.commands.toggleBulletList()
    editor.commands.setTextSelection(8)
    expect(editor.commands.sinkListItem('listItem')).toBe(false)
    expect(editor.getJSON().content?.[0]?.content).toHaveLength(2)
  })
})
