import {allColumnCapabilities,fullSettingsPolicy} from './fixtures/settings'
import {afterEach, describe, expect, it} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {reactive} from 'vue'
import ColumnSettings from '../src/components/ColumnSettings.vue'
import {guardColumnPatch} from '../src/config/columns'
import {createPreferenceDelta, resolveConfiguration} from '../src/config/schema'
import type {ColumnConfig, SortConfig, UserColumnConfig} from '../src/types'

const wrappers: VueWrapper[]=[]
afterEach(()=>wrappers.splice(0).forEach(wrapper=>wrapper.unmount()))
function setup(openMode:'quick'|'drawer'='quick') {
  const applied: Record<string, UserColumnConfig>[]=[]
  const columns:ColumnConfig[]=[
    {id:'id',field:'id',title:'编号',fixed:'left',width:180,configurable:{visible:{enabled:true,disabled:true},fixed:{enabled:true,disabled:true},order:{enabled:true,disabled:true}}},
    {id:'name',field:'name',title:'项目',width:220,sortable:true,configurable:{...allColumnCapabilities}},
    {id:'customer',field:'customer',title:'客户',width:150,visible:false,configurable:{...allColumnCapabilities}},
  ]
  const context=reactive({settingsPolicy:fullSettingsPolicy(),columns,baseColumns:columns,openMode,previewRows:[{id:'A1',name:'计量改造',customer:'澄川水务'}],closeCount:0,
    close(){context.closeCount++},
    async patch(id:string,patch:UserColumnConfig){applied.push({[id]:patch})},
    async apply(patches:Record<string,UserColumnConfig>){applied.push(patches)},
  })
  const wrapper=mount(ColumnSettings,{props:{context},global:{stubs:{Teleport:true}}})
  wrappers.push(wrapper)
  return {wrapper,context,applied}
}
const button=(wrapper:VueWrapper,text:string)=>wrapper.findAll('button').find(item=>item.text()===text)!

describe('column settings draft',()=>{
  it('keeps quick visibility changes in a draft until confirm',async()=>{
    const {wrapper,context,applied}=setup()
    await wrapper.get('input[aria-label="显示客户"]').setValue(true)
    expect(applied).toEqual([])
    expect(context.columns[2]!.visible).toBe(false)
    await button(wrapper,'确认').trigger('click')
    await flushPromises()
    expect(applied).toEqual([{customer:{visible:true}}])
    expect(context.closeCount).toBe(1)
  })
  it('discards draft pin changes on cancel and never unlocks a fixed column',async()=>{
    const {wrapper,context,applied}=setup()
    expect(wrapper.get('button[title="左冻结 编号"]').attributes('disabled')).toBeDefined()
    await wrapper.get('button[title="右冻结 项目"]').trigger('click')
    expect(applied).toEqual([])
    await button(wrapper,'取消').trigger('click')
    expect(applied).toEqual([])
    expect(context.columns[1]!.fixed).toBeUndefined()
    expect(context.closeCount).toBe(1)
  })
  it('toggles all configurable columns while preserving locked visibility',async()=>{
    const {wrapper,applied}=setup()
    await wrapper.get('input[aria-label="显示全部列"]').setValue(true)
    await wrapper.get('input[aria-label="显示全部列"]').setValue(false)
    expect((wrapper.get('input[aria-label="显示编号"]').element as HTMLInputElement).checked).toBe(true)
    await button(wrapper,'确认').trigger('click')
    expect(applied).toEqual([{name:{visible:false}}])
  })
  it('reorders movable columns with the keyboard and keeps locked positions',async()=>{
    const {wrapper,applied}=setup()
    await wrapper.get('button[aria-label="拖动排序 客户"]').trigger('keydown',{key:'ArrowUp'})
    await button(wrapper,'确认').trigger('click')
    expect(applied[0]).toEqual({customer:{order:1},name:{order:2}})
  })
  it('opens the drawer with the same draft, previews edits, and applies once',async()=>{
    const {wrapper,applied}=setup()
    await wrapper.get('input[aria-label="显示客户"]').setValue(true)
    await button(wrapper,'更多设置').trigger('click')
    await wrapper.get('button[aria-label="编辑列 项目"]').trigger('click')
    await wrapper.get('input[aria-label="显示名称"]').setValue('项目名称')
    await wrapper.get('input[aria-label="允许排序"]').setValue(false)
    await wrapper.get('select[aria-label="表头文字字号"]').setValue('16')
    expect(wrapper.get('[data-testid="settings-preview"]').text()).toContain('项目名称')
    expect(wrapper.get('[data-testid="settings-preview"]').text()).toContain('计量改造')
    expect(applied).toEqual([])
    await button(wrapper,'应用').trigger('click')
    await flushPromises()
    expect(applied).toEqual([{name:{title:'项目名称',sortable:false,headerStyle:{fontSize:16}},customer:{visible:true}}])
  })
  it('restores defaults only in draft and escape cancels without saving',async()=>{
    const {wrapper,context,applied}=setup('drawer')
    await wrapper.get('button[aria-label="编辑列 项目"]').trigger('click')
    await wrapper.get('input[aria-label="显示名称"]').setValue('其他名称')
    await button(wrapper,'恢复此列').trigger('click')
    expect((wrapper.get('input[aria-label="显示名称"]').element as HTMLInputElement).value).toBe('项目')
    await wrapper.get('[role="dialog"]').trigger('keydown',{key:'Escape'})
    expect(applied).toEqual([])
    expect(context.closeCount).toBe(1)
  })
  it('asks before dismissing a dirty drawer while explicit cancel remains immediate',async()=>{
    const {wrapper,context,applied}=setup('drawer')
    await wrapper.get('input[aria-label="显示名称"]').setValue('尚未保存')
    await wrapper.get('button[aria-label="关闭表格设置"]').trigger('click')
    expect(context.closeCount).toBe(0)
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('尚未应用')
    await button(wrapper,'继续编辑').trigger('click')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    await wrapper.get('button[aria-label="关闭表格设置"]').trigger('click')
    await button(wrapper,'放弃修改').trigger('click')
    expect(context.closeCount).toBe(1)
    expect(applied).toEqual([])
  })
  it('shows a valid width for flexible columns whose minimum exceeds the default',()=>{
    const wrapper=mount(ColumnSettings,{props:{context:{settingsPolicy:fullSettingsPolicy(),columns:[{id:'name',field:'name',title:'名称',minWidth:264,configurable:{...allColumnCapabilities}}],openMode:'drawer',async patch(){},close(){}}},global:{stubs:{Teleport:true}}})
    wrappers.push(wrapper)
    expect((wrapper.get('input[aria-label="列宽（px）"]').element as HTMLInputElement).value).toBe('264')
    expect((wrapper.get('input[aria-label="名称列宽"]').element as HTMLInputElement).value).toBe('264')
  })
})

describe('serializable column text presentation',()=>{
  it('validates styles and requires explicit capabilities in configured definitions',()=>{
    const column={id:'name',field:'name',title:'名称',configurable:{sortable:true,headerStyle:true,cellStyle:false}}
    expect(guardColumnPatch(column,{sortable:false,headerStyle:{fontSize:16,color:'#2468e8'},cellStyle:{fontSize:18}}))
      .toEqual({sortable:false,headerStyle:{fontSize:16,color:'#2468e8'}})
    expect(guardColumnPatch(column,{headerStyle:{fontSize:400,color:'url(evil)',fontFamily:'invalid'}})).toEqual({})
  })
  it('keeps valid text style preferences after resolving and removes identical defaults',()=>{
    const definition={schemaVersion:3,tableKey:'styles',columns:[{id:'name',field:'name',title:'名称',sortable:true,headerStyle:{fontSize:14},configurable:{sortable:true,headerStyle:true}}]}
    const result=resolveConfiguration({definition,preference:{kind:'business-table-preference',schemaVersion:3,tableKey:'styles',columns:{name:{sortable:false,headerStyle:{fontSize:16,color:'#2468e8'}}}}})
    expect(result.columns[0]).toMatchObject({sortable:false,headerStyle:{fontSize:16,color:'#2468e8'}})
    expect(createPreferenceDelta('styles',result.baseColumns,{schemaVersion:1,tableKey:'styles',columns:{name:{headerStyle:{fontSize:14}}}}).columns).toEqual({})
  })
})

describe('settings sorting draft',()=>{
  function sorting(){
    const columns:ColumnConfig[]=[{id:'id',field:'id',title:'编号',sortable:true,configurable:{...allColumnCapabilities}},{id:'name',field:'name',title:'名称',sortable:true,configurable:{...allColumnCapabilities}}]
    const saves:SortConfig[][]=[]
    const context=reactive({settingsPolicy:fullSettingsPolicy(),columns,openMode:'drawer' as const,sorts:[{field:'id',order:'desc'}] as SortConfig[],previewRows:[{id:'B2',name:'Beta'},{id:'A1',name:'Alpha'}],closeCount:0,
      close(){context.closeCount++},async patch(){},async setSorts(next:SortConfig[]){saves.push(next)},
    })
    const wrapper=mount(ColumnSettings,{props:{context},global:{stubs:{Teleport:true}}})
    wrappers.push(wrapper)
    return {wrapper,context,saves}
  }
  it('previews draft sorting and commits once only after apply',async()=>{
    const {wrapper,context,saves}=sorting()
    await wrapper.get('button[aria-label="排序规则"]').trigger('click')
    expect(wrapper.get('select[aria-label="排序字段 1"]').element).toHaveProperty('value','id')
    await wrapper.get('select[aria-label="排序方式 1"]').setValue('asc')
    expect(wrapper.get('[data-testid="settings-preview"] tbody').text()).toContain('Alpha')
    expect(saves).toEqual([])
    expect(context.sorts).toEqual([{field:'id',order:'desc'}])
    await button(wrapper,'应用').trigger('click')
    await flushPromises()
    expect(saves).toEqual([[{field:'id',order:'asc'}]])
  })
  it('discards added or removed sort rules on cancel',async()=>{
    const {wrapper,context,saves}=sorting()
    await wrapper.get('button[aria-label="排序规则"]').trigger('click')
    await button(wrapper,'添加排序规则').trigger('click')
    expect(wrapper.findAll('select[aria-label^="排序字段"]').length).toBe(2)
    await wrapper.get('button[aria-label="删除排序规则 1"]').trigger('click')
    expect(wrapper.get('select[aria-label="排序字段 1"]').element).toHaveProperty('value','name')
    await button(wrapper,'取消').trigger('click')
    expect(context.sorts).toEqual([{field:'id',order:'desc'}])
    expect(context.closeCount).toBe(1)
    expect(saves).toEqual([])
  })
})
