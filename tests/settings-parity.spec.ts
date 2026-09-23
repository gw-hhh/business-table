import {afterEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ColumnSettings from '../src/components/ColumnSettings.vue'
import ColumnSettingsDrawer from '../src/components/ColumnSettingsDrawer.vue'
import type {ColumnSettingsContext} from '../src/components/settingsTypes'
import {defaultPresentation} from '../src/features/presentation/model'
import {allColumnCapabilities,fullSettingsPolicy} from './fixtures/settings'

const wrappers:VueWrapper[]=[]
function setup(overrides:Partial<ColumnSettingsContext>={}){
  const handler=vi.fn(),commit=vi.fn(async(_value:unknown)=>{})
  const context:ColumnSettingsContext={openMode:'drawer',settingsPolicy:fullSettingsPolicy(),
    columns:[{id:'name',field:'name',title:'名称',width:180,sortable:true,configurable:{...allColumnCapabilities}},{id:'amount',field:'amount',title:'金额',type:'number',width:180,sortable:true,configurable:{...allColumnCapabilities},numberRule:{enabled:true,minimumFractionDigits:2,maximumFractionDigits:2}}],
    previewRows:[{id:'A',name:'项目甲',amount:12345.6}],sorts:[],setSorts:async()=>{},patch:async()=>{},commit,close:vi.fn(),presentation:defaultPresentation(),
    actions:[{id:'view',label:'查看',handler},{id:'delete',label:'删除',handler,danger:true}],tools:{page:[{id:'add',label:'新增',handler}],table:[]},...overrides}
  const wrapper=mount(ColumnSettings,{props:{context},attachTo:document.body,global:{stubs:{teleport:true}}}) as VueWrapper
  wrappers.push(wrapper);return {wrapper,context,handler,commit}
}
const button=(wrapper:VueWrapper,label:string)=>wrapper.findAll('button').find(item=>item.text().trim()===label)!
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount());document.body.innerHTML='';localStorage.clear()})
describe('settings parity interactions',()=>{
  it('defaults to the selected object, uses all columns for appearance, and only offers relevant sample selection',async()=>{
    const {wrapper}=setup();await flushPromises()
    const preview=()=>wrapper.get('[data-testid="settings-preview"]')
    expect(preview().get('header strong').text()).toBe('名称 · 预览')
    expect(preview().findAll('th').map(cell=>cell.text())).toEqual(['名称 ↕'])
    await button(wrapper,'表格外观').trigger('click')
    expect(preview().get('header strong').text()).toBe('表格预览')
    expect(preview().findAll('th')).toHaveLength(2)
    expect(preview().find('[aria-label="预览样例"]').exists()).toBe(false)
  })
  it('keeps action and tool previews interactive without invoking business handlers',async()=>{
    const {wrapper,handler}=setup();await button(wrapper,'操作按钮').trigger('click');await flushPromises()
    const preview=()=>wrapper.get('[data-testid="settings-preview"]')
    expect(preview().get('header strong').text()).toBe('操作按钮预览')
    await preview().get('button[aria-label="查看"]').trigger('click');expect(handler).not.toHaveBeenCalled()
    await button(wrapper,'工具栏').trigger('click');await flushPromises()
    await preview().get('button[aria-label="新增"]').trigger('click');expect(handler).not.toHaveBeenCalled()
  })
  it('supports roving keyboard navigation across the visible page tabs',async()=>{
    const {wrapper}=setup()
    const first=wrapper.get('[role="tab"][aria-label="列设置"]')
    await first.trigger('keydown',{key:'End'})
    expect(wrapper.get('[role="tab"][aria-label="工具栏"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.findAll('[role="tab"][tabindex="0"]')).toHaveLength(1)
    await wrapper.get('[role="tab"][aria-label="工具栏"]').trigger('keydown',{key:'Home'})
    expect(first.attributes('aria-selected')).toBe('true')
  })
  it('remembers each column section when changing the selected column',async()=>{
    const {wrapper}=setup();await button(wrapper,'映射').trigger('click')
    await wrapper.get('button[aria-label="编辑列 金额"]').trigger('click');await button(wrapper,'数字').trigger('click')
    await wrapper.get('button[aria-label="编辑列 名称"]').trigger('click')
    expect(wrapper.get('.bt-settings-sections .is-active').text()).toBe('映射')
    await wrapper.get('button[aria-label="编辑列 金额"]').trigger('click')
    expect(wrapper.get('.bt-settings-sections .is-active').text()).toBe('数字')
  })
  it('shows the trial result initially and updates display/export as the original value changes',async()=>{
    const {wrapper,commit}=setup();await wrapper.get('button[aria-label="编辑列 金额"]').trigger('click')
    expect(wrapper.get('.bt-trial-result').text()).toContain('12,345.60')
    await wrapper.get('input[aria-label="试算原始值"]').setValue('0.125')
    expect(wrapper.get('.bt-trial-result').text()).toContain('0.13')
    expect(wrapper.get('.bt-trial-result').text()).toContain('Excel 导出值：0.125')
    expect(commit).not.toHaveBeenCalled()
  })
  it('preserves boolean manual filter option values when editing them',async()=>{
    const {wrapper,commit}=setup({columns:[{id:'name',field:'name',title:'名称',configurable:{...allColumnCapabilities},filter:{enabled:true,type:'boolean',source:'manual',search:true,counts:true,operators:['eq'],options:[{value:true,label:'是'}]}}]})
    await wrapper.get('input[aria-label="选项原值 1"]').setValue('false')
    await button(wrapper,'应用').trigger('click');await flushPromises()
    expect(commit.mock.calls[0]?.[0]).toMatchObject({columns:{name:{filter:{options:[{value:false,label:'是'}]}}}})
  })
  it('clears a rejected manual option draft when that option is removed',async()=>{
    const {wrapper}=setup({columns:[{id:'name',field:'name',title:'名称',configurable:{...allColumnCapabilities},filter:{enabled:true,type:'number',source:'manual',search:true,counts:true,operators:['eq'],options:[{value:1,label:'一'}]}}]})
    await wrapper.get('input[aria-label="选项原值 1"]').setValue('invalid')
    expect(button(wrapper,'应用').attributes('disabled')).toBeDefined()
    await wrapper.get('button[aria-label="删除选项 1"]').trigger('click')
    expect(button(wrapper,'应用').attributes('disabled')).toBeUndefined()
  })
  it('offers fixed/maximum fraction modes and ten-thousand units in the existing typed number rule',async()=>{
    const {wrapper,commit}=setup();await wrapper.get('button[aria-label="编辑列 金额"]').trigger('click')
    await button(wrapper,'最多').trigger('click')
    expect(wrapper.get('input[aria-label="最少小数位"]').element).toHaveProperty('value','0')
    await button(wrapper,'万元两位').trigger('click');await button(wrapper,'应用').trigger('click');await flushPromises()
    expect(commit.mock.calls[0]?.[0]).toMatchObject({columns:{amount:{numberRule:{minimumFractionDigits:2,maximumFractionDigits:2,scale:10000,suffix:'万元'}}}})
  })
  it('supports sort drag priority in the draft and rejects drag on readonly sorts',async()=>{
    const policy=fullSettingsPolicy()
    const {wrapper,context}=setup({sorts:[{field:'name',order:'asc'},{field:'amount',order:'desc'}],settingsPolicy:policy})
    await wrapper.get('button[aria-label="排序规则"]').trigger('click')
    await wrapper.get('button[aria-label="拖动排序规则 1"]').trigger('dragstart')
    await wrapper.findAll('.bt-settings-sort-rule')[1]!.trigger('drop')
    expect(wrapper.getComponent(ColumnSettingsDrawer).emitted('sorts')?.at(-1)).toEqual([[{field:'amount',order:'desc'},{field:'name',order:'asc'}]])
    policy.pages.sorts.disabled=true;await wrapper.setProps({context:{...context,settingsPolicy:policy}})
    expect(wrapper.get('button[aria-label="拖动排序规则 1"]').attributes('draggable')).toBe('false')
  })
})
