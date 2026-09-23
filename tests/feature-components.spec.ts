import {describe,it,expect,vi,afterEach} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {h} from 'vue'
import BusinessTable from '../src/BusinessTable.vue'
import {allColumnCapabilities,fullSettingsDefinition} from './fixtures/settings'
const wrappers:VueWrapper[]=[]
afterEach(()=>wrappers.splice(0).forEach(w=>w.unmount()))
const columns=[{id:'id',field:'id',title:'编号',width:180,fixed:'left' as const},{id:'name',field:'name',title:'名称'}]
function table(extra:Record<string,unknown>={}){
  // A host render avoids VTU's own deep prop scan invoking accessor-based test fixtures.
  const host=mount({render:()=>h(BusinessTable,{columns,data:[{id:'A',name:'Alpha'}],...extra})},{global:{stubs:{
    'vxe-table':{props:['data'],template:'<div><span v-for="r in data">{{r.id}}</span><slot/></div>'},
    'vxe-column':{props:['title','field','fixed','width'],template:'<div :data-column="field" :data-fixed="fixed" :data-width="width"><slot name="header"/><slot :row="{id:\'A\',name:\'Alpha\'}"/></div>'},
  }}}) as VueWrapper
  wrappers.push(host);return host.findComponent(BusinessTable) as VueWrapper
}
describe('feature integration',()=>{
  it('minimal columns and data creates only the core table and pagination',async()=>{
    const w=table();await flushPromises()
    expect(w.text()).toContain('A')
    expect(w.find('.bt__bar').exists()).toBe(false)
    expect(w.find('.bt__search').exists()).toBe(false)
    expect(w.find('[data-testid="column-settings"]').exists()).toBe(false)
    expect(w.text()).not.toContain('操作')
  })
  it('reads column settings details only on first interaction and reuses its context',async()=>{
    const details=vi.fn(()=>({label:'字段'}))
    const w=table({settingsDefinition:fullSettingsDefinition(),columns:columns.map(column=>({...column,configurable:{...allColumnCapabilities}})),features:{columnSettings:{enabled:true,get details(){return details()}}}})
    expect(details).not.toHaveBeenCalled()
    await w.get('[data-testid="column-settings"]').trigger('click')
    await vi.waitFor(()=>expect(w.find('[data-testid="column-panel"]').exists()).toBe(true))
    expect(details).toHaveBeenCalledTimes(1)
    await w.get('[data-testid="column-settings"]').trigger('click')
    expect(w.find('[data-testid="column-panel"]').exists()).toBe(false)
    await w.get('[data-testid="column-settings"]').trigger('click')
    expect(details).toHaveBeenCalledTimes(1)
  })
  it('opens only the configured appearance page without an empty quick-column entry',async()=>{
    const w=table({settingsDefinition:{pages:{appearance:true}},features:{columnSettings:true}})
    await flushPromises()
    expect(w.find('[data-testid="column-settings"]').exists()).toBe(false)
    await w.get('[data-testid="table-settings"]').trigger('click')
    await vi.waitFor(()=>expect(document.querySelector('[data-testid="settings-drawer"]')).not.toBeNull())
    expect(document.querySelector('button[aria-label="列设置"]')).toBeNull()
    expect(document.querySelector('button[aria-label="表格外观"]')).not.toBeNull()
  })
  it('remote OFF does not read details or render settings and cannot enable search',async()=>{
    const w=table({features:{columnSettings:{enabled:true,get details():never{throw Error('must not read')}},search:false},remoteFeatures:{columnSettings:{enabled:false},search:{enabled:true}}})
    await flushPromises()
    expect(w.find('[data-testid="column-settings"]').exists()).toBe(false)
    expect(w.find('.bt__search').exists()).toBe(false)
  })
  it('headless settings expose guarded state without rendering the default controls',async()=>{
    const w=table({settingsDefinition:fullSettingsDefinition(),features:{columnSettings:{enabled:true,mode:'headless'}},columns:[{...columns[0],configurable:{width:{enabled:true,min:100,max:300}}}]})
    const api=w.vm as unknown as {activateFeature:(name:string)=>Promise<any>;getFeatureContext:(name:string)=>any}
    expect(w.find('[data-testid="column-settings"]').exists()).toBe(false)
    const context=await api.activateFeature('columnSettings')
    expect(context.columns[0].fixed).toBe('left')
    await context.patch('id',{fixed:false,visible:false,width:240})
    expect(context.columns[0]).toMatchObject({fixed:'left',visible:true,width:240})
    expect(w.find('[data-testid="column-panel"]').exists()).toBe(false)
  })
  it('view column layouts are separate and clearing restores personal configuration',async()=>{
    const w=table({tableKey:'views',features:{views:true},config:{schemaVersion:1,tableKey:'views',columns:{name:{title:'个人名称'}}},views:[
      {id:'a',name:'A视图',columns:{name:{title:'视图A'}}},
      {id:'b',name:'B视图'},
    ]})
    await vi.waitFor(()=>expect(w.find('select[aria-label="视图"]').exists()).toBe(true))
    await w.get('select[aria-label="视图"]').setValue('a')
    expect(w.text()).toContain('视图A')
    await w.get('select[aria-label="视图"]').setValue('b')
    expect(w.text()).toContain('个人名称')
    await w.get('select[aria-label="视图"]').setValue('a')
    await w.get('select[aria-label="视图"]').setValue('')
    expect(w.text()).toContain('个人名称')
    expect(w.emitted('configChange')).toBeUndefined()
  })
  it('preference failure is diagnosed while data still loads',async()=>{
    const w=table({tableKey:'broken',persistence:{load:async()=>{throw Error('storage denied')},save:async()=>{throw Error('quota')}}})
    await flushPromises()
    expect(w.text()).toContain('A')
    expect(w.emitted('diagnostic')?.[0]?.[0]).toMatchObject({code:'RemoteConfigError'})
  })
  it('disabled row actions remain visible and cannot execute',async()=>{
    const handler=vi.fn(),w=table({actions:[{id:'delete',label:'删除',disabled:true,handler}]})
    await vi.waitFor(()=>expect(w.find('.bt__actions button').exists()).toBe(true))
    expect(w.get('.bt__actions button').attributes('disabled')).toBeDefined()
    await w.get('.bt__actions button').trigger('click')
    expect(handler).not.toHaveBeenCalled()
  })
})
