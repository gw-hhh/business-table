import {afterEach,describe,expect,it,vi} from 'vitest'
import {defineComponent,h,reactive} from 'vue'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {useTableRuntime,type TableRuntimeInput} from '../src/runtime/useTableRuntime'
import {sumColumn} from '../src/features/summary/aggregate'
import type {ColumnConfig,RowData} from '../src/types'
import {createPreferenceDelta,parsePreference} from '../src/config/schema'
import {readViews} from '../src/features/views/runtime'
import {defaultPresentation,resolvePresentation} from '../src/features/presentation/model'
import AppearanceSettings from '../src/features/settings/AppearanceSettings.vue'

const columns:ColumnConfig[]=[{id:'money',field:'amount',title:'金额',type:'currency'},{id:'name',field:'name',title:'名称'}]
const wrappers:VueWrapper[]=[]
afterEach(()=>wrappers.splice(0).forEach(wrapper=>wrapper.unmount()))
function create(extra:Partial<TableRuntimeInput<RowData>>={}){
  const input=reactive<{-readonly [K in keyof TableRuntimeInput<RowData>]:TableRuntimeInput<RowData>[K]}>({columns,data:[{id:1,amount:'0.1'},{id:2,amount:'0.2'},{id:3,amount:2}],selection:true,pagination:{pageSize:1,pageSizeOptions:[1,10]},presentation:{appearance:{summaryEnabled:true,summaryColumn:'money'}},...extra})
  let runtime!:ReturnType<typeof useTableRuntime<RowData>>
  const wrapper=mount(defineComponent({setup(){runtime=useTableRuntime(input);return()=>h('div')}}));wrappers.push(wrapper)
  return {runtime,input,wrapper}
}
describe('numeric footer summary',()=>{
  it('sums decimal raw values exactly and ignores mappings and cell templates',()=>{
    expect(sumColumn([{amount:'0.1'},{amount:'0.2'}],columns[0]!)).toEqual({value:'0.3',text:'¥0.30'})
    expect(()=>sumColumn([{amount:'bad'}],columns[0]!)).toThrow()
    expect(()=>sumColumn([{amount:'1e100'},{amount:'1e-100'}],columns[0]!)).toThrow('数值精度')
    expect(sumColumn([],columns[0]!).value).toBe('0')
  })
  it('uses all matching rows and cross-page selection, preserving numeric formats',async()=>{
    const {runtime}=create();await flushPromises()
    expect(runtime.summary.value).toMatchObject({status:'ready',text:'¥2.30',scope:'query'})
    runtime.selectRow({id:1,amount:'0.1'},true);runtime.selectRow({id:3,amount:2},true);await flushPromises()
    expect(runtime.summary.value).toMatchObject({status:'ready',text:'¥2.10',scope:'selected'})
    runtime.clearSelection();await runtime.setQuery({filters:[{field:'amount',operator:'gt',value:1}]});await flushPromises()
    expect(runtime.summary.value).toMatchObject({status:'ready',text:'¥2.00',scope:'query'})
  })
  it('does not fetch when disabled and reports missing remote capability or invalid column',async()=>{
    const readAll=vi.fn(async()=>[])
    const {runtime,input}=create({presentation:undefined,dataSource:{query:async()=>({rows:[],total:0}),readAll}});await flushPromises()
    expect(runtime.summary.value.status).toBe('disabled');expect(readAll).not.toHaveBeenCalled()
    input.presentation={appearance:{summaryEnabled:true,summaryColumn:'name'}};await flushPromises()
    expect(runtime.summary.value.status).toBe('error');expect(readAll).not.toHaveBeenCalled()
    input.dataSource={query:async()=>({rows:[],total:0})};input.presentation={appearance:{summaryEnabled:true,summaryColumn:'money'}};await flushPromises()
    expect(runtime.summary.value.status).toBe('error')
  })
  it('waits for saved settings before fetching an initially enabled summary',async()=>{
    const readAll=vi.fn(async()=>[])
    const {runtime}=create({tableKey:'saved',persistence:{load:async()=>({schemaVersion:1,tableKey:'saved',columns:{},presentation:{appearance:{summaryEnabled:false}}}),save:async()=>{}},dataSource:{query:async()=>({rows:[],total:0}),readAll}})
    await flushPromises();expect(runtime.summary.value.status).toBe('disabled');expect(readAll).not.toHaveBeenCalled()
  })
  it('aborts superseded queries, ignores late results, and cancels on disable and unmount',async()=>{
    const requests:{resolve:(rows:RowData[])=>void;signal?:AbortSignal}[]=[]
    const {runtime,input,wrapper}=create({dataSource:{query:async()=>({rows:[{amount:999}],total:2}),readAll:request=>new Promise(resolve=>requests.push({resolve,signal:request.signal}))}})
    await flushPromises();const first=requests.at(-1)!
    await runtime.setQuery({keyword:'new'});await flushPromises();const latest=requests.at(-1)!
    expect(first.signal?.aborted).toBe(true)
    latest.resolve([{amount:5},{amount:7}]);await flushPromises();expect(runtime.summary.value.text).toBe('¥12.00')
    first.resolve([{amount:1}]);await flushPromises();expect(runtime.summary.value.text).toBe('¥12.00')
    await runtime.reload();await flushPromises();const pending=requests.at(-1)!
    input.presentation={appearance:{summaryEnabled:false,summaryColumn:'money'}};await flushPromises()
    expect(pending.signal?.aborted).toBe(true);expect(runtime.summary.value.status).toBe('disabled')
    input.presentation={appearance:{summaryEnabled:true,summaryColumn:'money'}};await flushPromises()
    const last=requests.at(-1)!;wrapper.unmount();expect(last.signal?.aborted).toBe(true)
  })
  it('contains remote failures and refuses invalid numeric data instead of displaying zero',async()=>{
    const {runtime,input}=create({dataSource:{query:async()=>({rows:[],total:4}),readAll:async()=>{throw new Error('服务不可用')}}});await flushPromises()
    expect(runtime.summary.value).toMatchObject({status:'error',error:'服务不可用'})
    input.dataSource={query:async()=>({rows:[],total:1}),readAll:async()=>[{amount:'invalid'}]};await flushPromises()
    expect(runtime.summary.value.status).toBe('error');expect(runtime.summary.value.value).toBeUndefined()
  })
  it('persists stable column ids through preferences and views, and guards read-only settings',async()=>{
    const presentation={appearance:{summaryEnabled:true,summaryColumn:'money'}}
    const delta=createPreferenceDelta('sum',columns,{schemaVersion:1,tableKey:'sum',columns:{},presentation})
    expect(parsePreference(delta,'sum')?.presentation).toEqual(presentation)
    expect(readViews([{id:'s',name:'汇总',presentation}],'sum')[0]?.presentation).toEqual(presentation)
    const disabled={appearance:{summaryEnabled:false,summaryColumn:''}}
    expect(parsePreference({schemaVersion:1,tableKey:'sum',columns:{},presentation:disabled},'sum')?.presentation).toEqual(disabled)
    expect(readViews([{id:'off',name:'关闭',presentation:disabled}],'sum')[0]?.presentation).toEqual(disabled)
    const {runtime}=create({settingsDefinition:{pages:{appearance:{enabled:true,disabled:true}}}});await flushPromises()
    await runtime.setPresentation({appearance:{summaryEnabled:false}})
    expect(runtime.presentation.value.appearance.summaryEnabled).toBe(true)
    expect(defaultPresentation().appearance.summaryEnabled).toBe(false)
    expect(resolvePresentation({appearance:{summaryEnabled:'yes',summaryColumn:1}}).appearance).toMatchObject({summaryEnabled:false,summaryColumn:''})
  })
  it('offers only numeric columns in a collapsed settings group and keeps read-only input inert',async()=>{
    const wrapper=mount(AppearanceSettings,{props:{modelValue:defaultPresentation().appearance,columns}});wrappers.push(wrapper)
    await wrapper.get('[aria-label="展开底部汇总"]').trigger('click')
    expect(wrapper.get('[aria-label="汇总列"]').text()).toContain('金额')
    expect(wrapper.get('[aria-label="汇总列"]').text()).not.toContain('名称')
    await wrapper.get('[aria-label="启用底部汇总"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toMatchObject({summaryEnabled:true})
    await wrapper.setProps({disabled:true})
    await wrapper.get('[aria-label="启用底部汇总"]').trigger('change')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })
})
