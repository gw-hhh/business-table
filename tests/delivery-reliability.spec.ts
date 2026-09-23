import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'
import { displayValue } from '../src/core'
import {allColumnCapabilities,fullSettingsDefinition} from './fixtures/settings'

const Grid = defineComponent({props:['data'], template:'<div><slot /></div>'})
const Column = defineComponent({template:'<div><slot name="header" /></div>'})
const wrappers: VueWrapper[]=[]
async function setup(extra:Record<string,unknown>={}){
  const wrapper=mount(BusinessTable,{
    attachTo:document.body,
    props:{tableKey:'audit',rowKey:'id',columns:[{id:'id',field:'id',title:'编号',width:180,sortable:true},{id:'name',field:'name',title:'名称',width:200}],data:[{id:'1',name:'甲'},{id:'2',name:'乙'}],...extra},
    global:{stubs:{'vxe-table':Grid,'vxe-column':Column}},
  }) as VueWrapper
  wrappers.push(wrapper);await flushPromises();return wrapper
}
afterEach(()=>{for(const wrapper of wrappers.splice(0))wrapper.unmount();document.body.innerHTML=''})

it('AUDIT-01: rejected persistence must leave the real settings session open for retry',async()=>{
  const save=vi.fn(async()=>{throw new Error('写入失败')})
  const wrapper=await setup({settingsDefinition:fullSettingsDefinition(),columns:[{id:'id',field:'id',title:'编号',width:180,sortable:true,configurable:{...allColumnCapabilities}},{id:'name',field:'name',title:'名称',width:200,configurable:{...allColumnCapabilities}}],features:{columnSettings:true},persistence:{load:async()=>null,save}})
  await wrapper.get('[data-testid="column-settings"]').trigger('click')
  await vi.waitFor(()=>expect(wrapper.find('[data-testid="column-panel"]').exists()).toBe(true))
  await wrapper.get('input[aria-label="显示名称"]').setValue(false)
  const apply=wrapper.findAll('button').find(b=>b.text()==='确认')!
  await apply.trigger('click');await flushPromises()
  expect(save).toHaveBeenCalledTimes(1)
  console.log('SAVE_RESULT',JSON.stringify({panelOpen:wrapper.find('[data-testid="column-panel"]').exists(),diagnostics:wrapper.emitted('diagnostic'),configEvents:wrapper.emitted('configChange')}))
  expect(wrapper.find('[data-testid="column-panel"]').exists()).toBe(true)
})

it('AUDIT-02: external query changes must update the built-in search draft',async()=>{
  const wrapper=await setup({features:{search:true}})
  await vi.waitFor(()=>expect(wrapper.find('input.bt__search').exists()).toBe(true))
  const input=wrapper.get('input.bt__search')
  await input.setValue('甲')
  await wrapper.findAll('button').find(b=>b.text()==='查询')!.trigger('click');await flushPromises()
  await (wrapper.vm as any).setQuery({keyword:'乙'});await flushPromises()
  console.log('SEARCH_RESULT',JSON.stringify({query:(wrapper.vm as any).getState().query.keyword,input:(input.element as HTMLInputElement).value}))
  expect((input.element as HTMLInputElement).value).toBe('乙')
})

it('AUDIT-03: flat API must not accept zero pageSize as an initial runtime value',async()=>{
  const wrapper=await setup({pagination:{pageSize:0,pageSizeOptions:[10,20]}})
  const state=(wrapper.vm as any).getState()
  console.log('PAGE_RESULT',JSON.stringify({pageSize:state.pageSize,total:state.total,rows:state.rows.length}))
  expect(state.pageSize).toBeGreaterThan(0)
})

it('AUDIT-04: restored pageSize must stay inside the page-size allowlist',async()=>{
  const wrapper=await setup({pagination:{pageSize:20,pageSizeOptions:[10,20]},persistence:{load:async()=>({schemaVersion:1,tableKey:'audit',columns:{},pageSize:37}),save:async()=>{}}})
  expect([10,20]).toContain((wrapper.vm as any).getState().pageSize)
})

it('AUDIT-05: currency formatting with only minimumFractionDigits=3 must not throw',()=>{
  expect(()=>displayValue(12.345,{id:'amount',field:'amount',title:'金额',type:'currency',numberFormat:{style:'currency',minimumFractionDigits:3}})).not.toThrow()
})

it('AUDIT-06: unavailable optional preferences must not block core data for 60 seconds',async()=>{
  vi.useFakeTimers()
  let finish!: (value:null)=>void
  const hanging=new Promise<null>(resolve=>{finish=resolve})
  const query=vi.fn(async()=>({rows:[{id:'1',name:'甲'}],total:1}))
  try{
    await setup({dataSource:{query},persistence:{load:()=>hanging,save:async()=>{}}})
    await vi.advanceTimersByTimeAsync(60000)
    console.log('PREFERENCE_WAIT_RESULT',JSON.stringify({elapsedMs:60000,dataQueries:query.mock.calls.length}))
    expect(query).toHaveBeenCalled()
  }finally{
    finish(null);await flushPromises();vi.useRealTimers()
  }
})
