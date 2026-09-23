import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ColumnSettings from '../src/components/ColumnSettings.vue'
import { defaultPresentation, presentActions } from '../src/features/presentation/model'
import type { Action } from '../src/types'
import type { ColumnSettingsContext } from '../src/components/settingsTypes'
import {allColumnCapabilities,fullSettingsPolicy} from './fixtures/settings'
import {resolveSettingsPolicy} from '../src/features/settings/policy'
import ColumnSettingsDrawer from '../src/components/ColumnSettingsDrawer.vue'
import ColumnRuleEditor from '../src/features/settings/ColumnRuleEditor.vue'

const wrappers: VueWrapper[] = []
function setup(reject = false, override:Partial<ColumnSettingsContext> = {}) {
  const commit = vi.fn(async (_value: unknown) => { if(reject)throw Error('保存失败') })
  const context: ColumnSettingsContext = {
    settingsPolicy:fullSettingsPolicy(),openMode:'drawer',tableKey:'settings-full',columns:[{id:'name',field:'name',title:'名称',sortable:true,width:180,configurable:{...allColumnCapabilities}},{id:'amount',field:'amount',title:'金额',type:'number',sortable:true,width:180,configurable:{...allColumnCapabilities}}],
    presentation:defaultPresentation(),actions:[{id:'view',label:'查看',handler:()=>{}},{id:'delete',label:'删除',danger:true,handler:()=>{}}],
    tools:{page:[{id:'add',label:'新增',handler:()=>{}}],table:[{id:'settings',label:'表格设置',immutable:true,handler:()=>{}}]},
    previewRows:[{name:'甲',amount:12}],sorts:[],setSorts:async()=>{},patch:async()=>{},commit,close:vi.fn(),
    ...override,
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
  it('omits the action page when local actions and recursive children are all hidden',async()=>{
    const {wrapper}=setup(false,{actions:[{id:'hidden',label:'隐藏操作',visible:false,handler:()=>{}},{id:'empty',label:'空菜单',children:[{id:'nested',label:'嵌套菜单',children:[{id:'hidden-child',label:'隐藏子项',visible:false,handler:()=>{}}]}]}]})
    await flushPromises()
    expect(wrapper.find('button[aria-label="操作按钮"]').exists()).toBe(false)
  })
  it('filters local action declarations while retaining row predicates and user-hidden entries for recovery',async()=>{
    const rowVisible=()=>false
    const actions:Action[]=[
      {id:'hidden',label:'本地隐藏',visible:false,handler:()=>{}},
      {id:'hidden',label:'重复隐藏',handler:()=>{}},
      {id:'recover',label:'可恢复操作',handler:()=>{}},
      {id:'recover',label:'重复操作',handler:()=>{}},
      {id:'dynamic',label:'按行显示',visible:rowVisible,handler:()=>{}},
      {id:'group',label:'导出',children:[
        {id:'hidden-child',label:'本地隐藏子项',visible:false,handler:()=>{}},
        {id:'recover-child',label:'可恢复子项',handler:()=>{}},
        {id:'recover-child',label:'重复子项',handler:()=>{}},
        {id:'dynamic-child',label:'按行显示子项',visible:rowVisible,handler:()=>{}},
        {id:'empty-child',label:'空子菜单',children:[]},
      ]},
      {id:'legacy',label:'事件动作'},
    ]
    const presentation=defaultPresentation();presentation.rowActions.items={recover:{position:'hidden'},'recover-child':{position:'hidden'}}
    const {wrapper,commit}=setup(false,{actions,presentation})
    await button(wrapper,'操作按钮').trigger('click')
    expect(wrapper.findAll('[data-action-setting]').map(node=>node.attributes('data-action-setting'))).toEqual(['recover','dynamic','group','legacy'])
    expect(wrapper.findAll('input[aria-label^="显示子菜单"]').map(node=>node.attributes('aria-label'))).toEqual(['显示子菜单 可恢复子项','显示子菜单 按行显示子项'])
    expect((wrapper.get('select[aria-label="可恢复操作显示位置"]').element as HTMLSelectElement).value).toBe('hidden')
    expect((wrapper.get('input[aria-label="显示子菜单 可恢复子项"]').element as HTMLInputElement).checked).toBe(false)
    await wrapper.get('select[aria-label="可恢复操作显示位置"]').setValue('inline')
    await wrapper.get('input[aria-label="显示子菜单 可恢复子项"]').setValue(true)
    await button(wrapper,'应用').trigger('click');await flushPromises()
    expect(commit.mock.calls[0][0]).toMatchObject({presentation:{rowActions:{items:{recover:{position:'inline'},'recover-child':{position:'more'}}}}})
    const presented=presentActions(actions,presentation.rowActions)
    expect(presented.find(action=>action.id==='dynamic')?.visible).toBe(rowVisible)
    expect(presented.find(action=>action.id==='group')?.children?.[0].visible).toBe(rowVisible)
  })
  it.each([
    {pages:{columns:{enabled:true,disabled:true}},columnSections:{basic:true}},
    {pages:{columns:true},columnSections:{basic:true}},
  ])('keeps restore column visible but locked when its page or all fields are readonly',async definition=>{
    const {wrapper}=setup(false,{settingsPolicy:resolveSettingsPolicy(definition),columns:[{id:'name',field:'name',title:'名称',configurable:{rename:{enabled:true,disabled:true}}}]})
    await flushPromises()
    const restore=button(wrapper,'恢复此列')
    expect(restore.element.matches(':disabled')).toBe(true)
    await restore.trigger('click')
    expect(wrapper.getComponent(ColumnSettingsDrawer).emitted('reset')).toBeUndefined()
  })
  it('omits the toolbar page when local declarations have no usable tools',async()=>{
    const {wrapper}=setup(false,{tools:{page:[{id:'missing',label:'未实现'}],table:[{id:'hidden',label:'不显示',visible:false,handler:()=>{}}]}})
    await flushPromises()
    expect(wrapper.find('button[aria-label="工具栏"]').exists()).toBe(false)
  })
  it('hides settings pages when no settings modules are declared',async()=>{
    const {wrapper}=setup(false,{settingsPolicy:undefined});await flushPromises()
    expect(wrapper.find('[aria-label="表格设置分类"] button').exists()).toBe(false)
    expect(wrapper.find('[data-column-section="mapping"]').exists()).toBe(false)
  })
  it('hides action and toolbar pages without registered items',async()=>{
    const {wrapper,context}=setup();context.actions=[];context.tools={page:[],table:[]}
    await wrapper.setProps({context:{...context}});await flushPromises()
    expect(wrapper.find('button[aria-label="操作按钮"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="工具栏"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('当前区域没有注册工具')
  })
  it('hides undeclared column modules and individual capabilities',async()=>{
    const {wrapper}=setup(false,{
      settingsPolicy:resolveSettingsPolicy({pages:{columns:true},columnSections:{basic:true,mapping:true,template:true}}),
      columns:[{id:'name',field:'name',title:'名称',configurable:{rename:true,mapping:false}}],
    });await flushPromises()
    expect(wrapper.find('[aria-label="显示名称"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="列宽（px）"]').exists()).toBe(false)
    expect(wrapper.find('[data-column-section="content"]').exists()).toBe(false)
    expect(wrapper.find('[data-column-section="mapping"]').exists()).toBe(false)
    expect(wrapper.find('[data-column-section="template"]').exists()).toBe(false)
    expect(wrapper.find('[data-column-section="trial"]').exists()).toBe(false)
  })
  it('keeps disabled pages accessible and preserves readonly values on restore and reset',async()=>{
    const policy=fullSettingsPolicy();policy.pages.appearance.disabled=true;policy.pages.sorts.disabled=true
    const presentation=defaultPresentation();presentation.appearance.fontSize=18
    const {wrapper,commit}=setup(false,{settingsPolicy:policy,presentation,sorts:[{field:'name',order:'desc'}]})
    await button(wrapper,'表格外观').trigger('click')
    expect(button(wrapper,'表格外观').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[aria-label="内容字号"]').element.matches(':disabled')).toBe(true)
    expect(wrapper.text()).toContain('只读')
    await wrapper.getComponent(ColumnSettingsDrawer).vm.$emit('restore',{presentation:{appearance:{fontSize:30}},sorts:[],columns:{name:{title:'新名称'}}})
    await button(wrapper,'恢复全部').trigger('click')
    await button(wrapper,'列设置').trigger('click')
    await wrapper.get('[aria-label="显示名称"]').setValue('新名称')
    await button(wrapper,'应用').trigger('click');await flushPromises()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0][0]).toMatchObject({presentation:{appearance:{fontSize:18}},sorts:[{field:'name',order:'desc'}],columns:{name:{title:'新名称'}}})
  })
  it('shows configured readonly column sections and rejects nested edits',async()=>{
    const policy=fullSettingsPolicy();policy.columnSections.mapping.disabled=true
    const {wrapper,commit}=setup(false,{settingsPolicy:policy,columns:[{id:'name',field:'name',title:'名称',configurable:{rename:true,mapping:true},mapping:{enabled:true,type:'text',presentation:'tag',empty:'—',unknown:'未匹配',items:[{value:'a',label:'甲'}]}}]})
    expect(wrapper.get('[data-column-section="mapping"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[aria-label="映射文案 1"]').element.matches(':disabled')).toBe(true)
    await wrapper.get('[aria-label="映射文案 1"]').setValue('乙')
    wrapper.getComponent(ColumnRuleEditor).vm.$emit('patch',{mapping:{enabled:false}})
    await wrapper.get('[aria-label="显示名称"]').setValue('新名称')
    await button(wrapper,'应用').trigger('click');await flushPromises()
    expect(commit.mock.calls[0][0]).toMatchObject({columns:{name:{title:'新名称'}}})
    expect((commit.mock.calls[0][0] as {columns:Record<string,unknown>}).columns.name).toEqual({title:'新名称'})
  })
  it('falls back from hidden tabs and omits empty toolbar groups',async()=>{
    const {wrapper}=setup(false,{initialTab:'actions',actions:[],tools:{page:[],table:[{id:'refresh',label:'刷新',handler:()=>{}}]}})
    expect(wrapper.get('button[aria-label="列设置"]').attributes('aria-selected')).toBe('true')
    await button(wrapper,'工具栏').trigger('click')
    expect(wrapper.text()).toContain('表格工具栏')
    expect(wrapper.text()).not.toContain('页面工具栏')
    expect(wrapper.text()).not.toContain('当前区域没有注册工具')
  })
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
