import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ExportDialog from '../src/features/export/ExportDialog.vue'
import { createTemplateBook } from '../src/features/export/template'
import type { ExportField } from '../src/features/export/model'
const fields:ExportField[]=[{id:'id',label:'编号',column:{id:'id',field:'id',title:'自定义编号'}},{id:'status',label:'状态',column:{id:'status',field:'status',title:'状态',visible:false}}]
afterEach(()=>{document.body.innerHTML='';vi.restoreAllMocks()})
describe('export configuration dialogs',()=>{
  it('previews the selected order and keeps failed preset writes out of the published list',async()=>{
    const save=vi.fn(async()=>{throw Error('保存失败')})
    const wrapper=mount(ExportDialog,{props:{fields,groups:[{id:'all',label:'全部',rows:[{id:'0001',status:'草稿'}]}],savePresets:save},attachTo:document.body})
    const root=()=>document.querySelector<HTMLElement>('.bt-export-dialog')!
    const buttons=()=>Array.from(root().querySelectorAll('button'))
    const click=async(text:string)=>{buttons().find(button=>button.textContent===text)!.click();await flushPromises()}
    root().querySelector<HTMLButtonElement>('[aria-label="上移导出字段状态"]')!.click();await flushPromises()
    await click('预览')
    expect(Array.from(document.querySelectorAll('.bt-export-preview th')).map(node=>node.textContent)).toEqual(['状态','编号'])
    document.querySelector<HTMLButtonElement>('[aria-label="关闭导出预览"]')!.click();await flushPromises()
    const name=root().querySelector<HTMLInputElement>('[aria-label="导出方案名称"]')!;name.value='测试方案';name.dispatchEvent(new Event('input',{bubbles:true}))
    await click('保存方案')
    expect(save).toHaveBeenCalledOnce();expect(root().textContent).toContain('保存失败')
    expect(root().querySelector<HTMLSelectElement>('[aria-label="已保存的导出方案"]')!.options.length).toBe(1)
    wrapper.unmount()
  })
  it('creates blank formatted input rows and isolates examples from the entry sheet',()=>{
    const book=createTemplateBook({fields:[{...fields[0],hint:'必填。'},{...fields[1],hint:'选择状态。',choices:['草稿','评审中']}],examples:[{id:'0001',status:'草稿'}],notes:[['模板版本','v1']]},true)
    expect(book.sheets.map(sheet=>sheet.name)).toEqual(['数据填写','填写说明','示例'])
    expect(book.sheets[0].rows).toHaveLength(101)
    expect(book.sheets[0].rows.slice(1).every(row=>row.every(cell=>cell.value===null))).toBe(true)
    expect(book.sheets[0].validations).toEqual([{column:1,from:2,to:10001,choices:['草稿','评审中']}])
    expect(book.sheets[2].rows[1][0].value).toBe('0001')
  })
})
