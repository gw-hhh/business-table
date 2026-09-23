import { afterEach, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DialogFrame from '../src/ui/DialogFrame.vue'

afterEach(() => { document.body.replaceChildren() })

it('puts initial focus on the requested editable field rather than the close button', async () => {
  const wrapper = mount(DialogFrame, {
    props: { title: '新增报价' }, attachTo: document.body,
    slots: { default: '<label>项目名称<input id="project-name" autofocus/></label>' },
  })
  await flushPromises()
  expect(document.activeElement).toBe(document.getElementById('project-name'))
  wrapper.unmount()
})

it('keeps focus inside the dialog and returns to the launching button on close', async () => {
  const trigger = document.createElement('button')
  document.body.append(trigger); trigger.focus()
  const wrapper = mount(DialogFrame, {
    props: { title: '报价详情' }, attachTo: document.body,
    slots: { default: '<fieldset disabled><input autofocus value="readonly"/></fieldset>', footer: '<button id="dialog-last">关闭</button>' },
  })
  await flushPromises()
  const panel = document.querySelector<HTMLElement>('[role="dialog"]')!
  const close = panel.querySelector<HTMLButtonElement>('button')!
  close.focus()
  close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(document.getElementById('dialog-last'))
  panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(wrapper.emitted('close')).toHaveLength(1)
  wrapper.unmount()
  expect(document.activeElement).toBe(trigger)
})
