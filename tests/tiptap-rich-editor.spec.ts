import {afterEach, beforeAll, describe, expect, it} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {nextTick} from 'vue'
import RichEditor from '../src/features/rich-text/RichEditor.vue'
import {readRichDocument, richText, type RichDocument} from '../src/features/rich-text/document'

const wrappers: VueWrapper[] = []
// jsdom has no layout; ProseMirror calls these native APIs when scrolling a DOM edit into view.
beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', {configurable: true, value: () => []})
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {configurable: true, value: () => new DOMRect()})
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })
function mountEditor(props: Partial<InstanceType<typeof RichEditor>['$props']> = {}) {
  const wrapper = mount(RichEditor, {props: {modelValue: readRichDocument('甲乙'), ...props}, attachTo: document.body})
  wrappers.push(wrapper)
  return wrapper
}

describe('Tiptap rich editor public integration', () => {
  it('mounts a ProseMirror textbox with the existing label and readonly contract', async () => {
    const wrapper = mountEditor({label: '备注内容'})
    await flushPromises()
    const surface = wrapper.get('[role="textbox"]')
    expect(surface.classes()).toContain('ProseMirror')
    expect(surface.attributes('aria-label')).toBe('备注内容')
    expect(surface.text()).toBe('甲乙')
    await wrapper.setProps({readonly: true})
    expect(surface.attributes('contenteditable')).toBe('false')
    expect(wrapper.find('[role="toolbar"]').exists()).toBe(false)
  })

  it('keeps atomic fields tied to stable IDs while titles change', async () => {
    const modelValue: RichDocument = {ops: [{insert: {field: 'name'}}, {insert: '\n'}]}
    const wrapper = mountEditor({modelValue, template: true, columns: [{id: 'name', field: 'name', title: '名称'}]})
    await flushPromises()
    expect(wrapper.get('.ProseMirror [data-bt-field="name"]').text()).toBe('名称')
    expect(wrapper.get('[data-bt-field="name"]').attributes('contenteditable')).toBe('false')
    await wrapper.setProps({columns: [{id: 'name', field: 'name', title: '项目名称'}]})
    expect(wrapper.get('[data-bt-field="name"]').text()).toBe('项目名称')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(richText(modelValue, id => id)).toBe('name')
  })

  it('preserves toolbar stored marks for subsequent typing and uses native undo history', async () => {
    const wrapper = mountEditor({modelValue: readRichDocument('')})
    await flushPromises()
    await wrapper.get('[aria-label="粗体"]').trigger('click')
    const surface = wrapper.get<HTMLElement>('[role="textbox"]')
    surface.element.innerHTML = '<p><strong>输入文字</strong></p>'
    await new Promise(resolve => setTimeout(resolve, 30))
    await nextTick()
    const update = wrapper.emitted<[RichDocument]>('update:modelValue')?.at(-1)?.[0]
    expect(update?.ops.some(operation => operation.attributes?.bold && operation.insert === '输入文字')).toBe(true)
    await wrapper.get('[aria-label="撤销编辑"]').trigger('click')
    expect(surface.text()).toBe('')
    await wrapper.get('[aria-label="重做编辑"]').trigger('click')
    expect(surface.text()).toBe('输入文字')
  })

  it('clears undo history when the host replaces the document', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    await wrapper.get('[aria-label="无序列表"]').trigger('click')
    expect(wrapper.get('[aria-label="撤销编辑"]').attributes('disabled')).toBeUndefined()
    await wrapper.setProps({modelValue: readRichDocument('另一个记录')})
    await flushPromises()
    expect(wrapper.get('[role="textbox"]').text()).toBe('另一个记录')
    expect(wrapper.get('[aria-label="撤销编辑"]').attributes('disabled')).toBeDefined()
  })

  it('defers publishing and clipping until a Chinese composition finishes', async () => {
    const wrapper = mountEditor({modelValue: readRichDocument(''), maxChars: 2})
    await flushPromises()
    const surface = wrapper.get<HTMLElement>('[role="textbox"]')
    await surface.trigger('compositionstart')
    surface.element.innerHTML = '<p>中文输入</p>'
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await surface.trigger('compositionend')
    await new Promise(resolve => setTimeout(resolve, 50))
    const update = wrapper.emitted<[RichDocument]>('update:modelValue')?.at(-1)?.[0]
    expect(update && richText(update)).toBe('中文')
    expect(surface.text()).toBe('中文')
    expect(wrapper.get('[role="alert"]').text()).toBe('最多 2 个字，超出部分未保留。')
  })

  it('sanitizes HTML in the real paste handler and respects the remaining document limit', async () => {
    const wrapper = mountEditor({modelValue: readRichDocument('原'), maxChars: 4})
    await flushPromises()
    const surface = wrapper.get<HTMLElement>('[role="textbox"]')
    const event = new Event('paste', {bubbles: true, cancelable: true})
    Object.defineProperty(event, 'clipboardData', {value: {getData: (type: string) => type === 'text/html' ? '<p><strong>甲😊乙丙</strong><script>bad()</script><img src=x><a href="javascript:bad()">坏</a></p>' : ''}})
    surface.element.dispatchEvent(event)
    await nextTick()
    const update = wrapper.emitted<[RichDocument]>('update:modelValue')?.at(-1)?.[0]
    expect(update && [...richText(update)]).toHaveLength(4)
    expect(surface.find('strong').exists()).toBe(true)
    expect(surface.find('script,img,a').exists()).toBe(false)
    expect(event.defaultPrevented).toBe(true)
  })

  it('retains supported inline styles when native DOM input updates an existing span', async () => {
    const wrapper = mountEditor({modelValue: {ops: [{insert: '样式', attributes: {color: '#123456', background: '#abcdef', font: 'yahei', size: '24px'}}, {insert: '\n'}]}})
    await flushPromises()
    const span = wrapper.get<HTMLElement>('.ProseMirror [data-bt-font]')
    span.element.textContent = '样式输入'
    await new Promise(resolve => setTimeout(resolve, 40))
    const update = wrapper.emitted<[RichDocument]>('update:modelValue')?.at(-1)?.[0]
    expect(update?.ops).toContainEqual({insert: '样式输入', attributes: {color: '#123456', background: '#abcdef', font: 'yahei', size: '24px'}})
  })
})
