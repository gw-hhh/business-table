import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ColumnSettings from '../src/components/ColumnSettings.vue'
import { defaultPresentation } from '../src/features/presentation/model'
import type { ColumnSettingsContext } from '../src/components/settingsTypes'

const wrappers: VueWrapper[] = []
function setup(reject = false) {
  const commit = vi.fn(async (_value: unknown) => { if(reject)throw Error('保存失败') })
  const context: ColumnSettingsContext = {
    openMode:'drawer',tableKey:'settings-full',columns:[{id:'name',field:'name',title:'名称',sortable:true,width:180},{id:'amount',field:'amount',title:'金额',type:'number',sortable:true,width:180}],
    presentation:defaultPresentation(),actions:[{id:'view',label:'查看',handler:()=>{}},{id:'delete',label:'删除',danger:true,handler:()=>{}}],
    tools:{page:[{id:'add',label:'新增'}],table:[{id:'settings',label:'表格设置',immutable:true}]},
    previewRows:[{name:'甲',amount:12}],sorts:[],setSorts:async()=>{},patch:async()=>{},commit,close:vi.fn(),
  }
  const wrapper=mount(ColumnSettings,{props:{context},global:{stubs:{teleport:true}}}) as VueWrapper
  wrappers.push(wrapper)
  return {wrapper,context,commit}
}
function button(wrapper: VueWrapper, name: string) {
  const target=wrapper.findAll('button').find(item=>item.text().trim()===name)
  if(!target)throw Error('找不到按钮 '+name)
  return target
}
afterEach(()=>{for(const wrapper of wrappers.splice(0))wrapper.unmount()})
describe('all settings pages share one draft transaction',()=>{
  it('provides real actions, appearance and toolbar pages',async()=>{
    const {wrapper}=setup();await flushPromises()
    for(const name of ['操作按钮','表格外观','工具栏'])expect(button(wrapper,name).attributes('disabled')).toBeUndefined()
    await button(wrapper,'操作按钮').trigger('click')
    expect(wrapper.find('[aria-label="行内最多显示"]').exists()).toBe(true)
    await button(wrapper,'工具栏').trigger('click')
    expect(wrapper.text()).toContain('页面工具栏')
    expect(wrapper.text()).toContain('表格工具栏')
  })
  it('keeps appearance edits isolated and commits one combined snapshot',async()=>{
    const {wrapper,context,commit}=setup();await flushPromises()
    await button(wrapper,'表格外观').trigger('click')
    await wrapper.get('[aria-label="内容字号"]').setValue('18')
    expect(context.presentation?.appearance.fontSize).toBe(14)
    expect(commit).not.toHaveBeenCalled()
    await button(wrapper,'应用').trigger('click');await flushPromises()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0][0]).toMatchObject({presentation:{appearance:{fontSize:18}}})
    expect(context.close).toHaveBeenCalledTimes(1)
  })
  it('does not close or lose a valid draft after persistence failure',async()=>{
    const {wrapper,context,commit}=setup(true);await flushPromises()
    await button(wrapper,'操作按钮').trigger('click')
    await wrapper.get('[aria-label="行内最多显示"]').setValue('0')
    await button(wrapper,'应用').trigger('click');await flushPromises()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(context.close).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('保存失败')
    expect((wrapper.get('[aria-label="行内最多显示"]').element as HTMLSelectElement).value).toBe('0')
  })
  it('exposes column rules rather than disabled navigation placeholders',async()=>{
    const {wrapper}=setup();await flushPromises()
    for(const name of ['筛选','映射','模板','试算'])expect(button(wrapper,name).attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('内容显示')
    expect(wrapper.text()).toContain('启用值映射')
    expect(wrapper.text()).toContain('规则试算')
  })
})
