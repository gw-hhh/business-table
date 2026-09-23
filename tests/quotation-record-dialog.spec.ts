import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import QuotationRecordDialog from '../demo/quotation/QuotationRecordDialog.vue'
import { createQuotationDraft, makeExampleQuotations } from '../demo/quotation/model'
const wrappers:VueWrapper[]=[]
afterEach(()=>wrappers.splice(0).forEach(wrapper=>wrapper.unmount()))
it('preserves the initial business context of a new quotation without sharing its draft',async()=>{
  const rows=makeExampleQuotations(),draft={...createQuotationDraft(undefined,rows),customer:'澄川水务'}
  const wrapper=mount(QuotationRecordDialog,{props:{mode:'new',row:draft,rows,save:async()=>{}},global:{stubs:{teleport:true}}});wrappers.push(wrapper)
  expect((wrapper.get('[aria-label="客户"]').element as HTMLInputElement).value).toBe('澄川水务')
  await wrapper.get('[aria-label="客户"]').setValue('新的客户')
  expect(draft.customer).toBe('澄川水务')
})
it('shows a detail drawer and switches into a distinct copy without overwriting its source',async()=>{
  const rows=makeExampleQuotations(),save=vi.fn(async()=>{})
  const wrapper=mount(QuotationRecordDialog,{props:{mode:'view',row:rows[0],rows,save},global:{stubs:{teleport:true}}});wrappers.push(wrapper)
  expect(wrapper.get('[role="dialog"]').classes()).toContain('bt-dialog--drawer')
  expect(wrapper.get('.q-record-hero').text()).toContain('63,860.00')
  await wrapper.findAll('button').find(button=>button.text()==='复制报价')!.trigger('click')
  expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('复制报价')
  expect((wrapper.get('input[aria-label="项目名称"]').element as HTMLInputElement).value).toContain('（副本）')
  expect(rows[0].name).toBe('二期计量系统改造 · 001')
})
it('confirms dirty dismissal and keeps the draft after a failed save',async()=>{
  const rows=makeExampleQuotations(),save=vi.fn(async()=>{throw Error('版本冲突，请刷新后重试。')})
  const wrapper=mount(QuotationRecordDialog,{props:{mode:'edit',row:rows[0],rows,save},global:{stubs:{teleport:true}}});wrappers.push(wrapper)
  await wrapper.get('input[aria-label="项目名称"]').setValue('修改未保存')
  await wrapper.get('form').trigger('submit');await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('版本冲突')
  expect(wrapper.emitted('close')).toBeUndefined()
  await wrapper.findAll('button').find(button=>button.text()==='取消')!.trigger('click')
  expect(wrapper.find('[aria-label="放弃修改？"]').exists()).toBe(true)
  await wrapper.findAll('button').find(button=>button.text()==='放弃修改')!.trigger('click')
  expect(wrapper.emitted('close')).toHaveLength(1)
})
