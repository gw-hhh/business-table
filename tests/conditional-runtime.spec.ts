import {afterEach,describe,expect,it,vi} from 'vitest'
import {defineComponent,h,reactive} from 'vue'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {createPreferenceDelta,parsePreference,resolveConfiguration} from '../src/config/schema'
import {readViews} from '../src/features/views/runtime'
import {useTableRuntime,type TableRuntimeInput} from '../src/runtime/useTableRuntime'
import type {ConditionalFormattingDefinition,ConditionalRule} from '../src/features/conditional-formatting/model'
import type {ConfigDiagnostic} from '../src/config/diagnostics'
import type {ColumnConfig,RowData,TableConfig} from '../src/types'

const wrappers:VueWrapper[]=[]
afterEach(()=>wrappers.splice(0).forEach(wrapper=>wrapper.unmount()))
const columns:ColumnConfig[]=[
  {id:'amount',field:'amount',title:'金额',type:'number',numberRule:{enabled:true,scale:1000}},
  {id:'name',field:'name',title:'名称',type:'text'},
]
const amountRule=(id='large',value=100):ConditionalRule=>({id,condition:{field:'amount',operator:'gte',value},enabled:true,label:'高金额',color:'#123456',background:'#abcdef'})
const nameRule=(id='name'):ConditionalRule=>({id,condition:{field:'name',operator:'contains',value:'甲'},enabled:true,label:'甲客户',color:'#654321',background:'#fedcba'})
function create(extra:Partial<TableRuntimeInput<RowData>>={}){
  const diagnostics:ConfigDiagnostic[]=[]
  const input=reactive({tableKey:'marks',columns,data:[{id:'a',amount:120,name:'甲'},{id:'b',amount:'120',name:'乙'}],conditionalFormattingEnabled:true,...extra})
  let runtime!:ReturnType<typeof useTableRuntime<RowData>>
  const wrapper=mount(defineComponent({setup(){runtime=useTableRuntime(input,{diagnostic:item=>diagnostics.push(item)});return()=>h('div')}}))
  wrappers.push(wrapper)
  return {input,runtime,diagnostics,wrapper}
}

describe('conditional formatting persists as a typed layout preference',()=>{
  it('migrates an optional rule field without changing the preference protocol and preserves explicit empty overrides',()=>{
    const old={schemaVersion:1,tableKey:'marks',columns:{},conditionalFormatting:[amountRule()]}
    expect(parsePreference(old,'marks')?.conditionalFormatting).toEqual([amountRule()])
    const delta=createPreferenceDelta('marks',columns,{schemaVersion:1,tableKey:'marks',columns:{},conditionalFormatting:[]})
    expect(delta).toMatchObject({kind:'business-table-preference',schemaVersion:3,conditionalFormatting:[]})
    expect(parsePreference(delta,'marks')?.conditionalFormatting).toEqual([])
  })

  it('rejects only an invalid mark preference and keeps unrelated saved settings',()=>{
    const diagnostics:ConfigDiagnostic[]=[]
    const preference={kind:'business-table-preference',schemaVersion:3,tableKey:'marks',columns:{name:{width:220}},conditionalFormatting:[amountRule(),amountRule()]}
    const parsed=parsePreference(preference,'marks',diagnostic=>diagnostics.push(diagnostic))
    expect(parsed?.columns.name).toEqual({width:220})
    expect(parsed?.conditionalFormatting).toBeUndefined()
    expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({path:'preference.conditionalFormatting'})]))
    const resolved=resolveConfiguration({definition:{schemaVersion:3,tableKey:'marks',columns},preference:{...preference,conditionalFormatting:[amountRule()]}})
    expect(resolved.preference?.conditionalFormatting).toEqual([amountRule()])
  })

  it('roundtrips mark rules in View snapshots and rejects a malformed complete View',()=>{
    const view=readViews([{id:'saved',name:'已保存',conditionalFormatting:[amountRule()]}],'marks')[0]
    expect(view?.conditionalFormatting).toEqual([amountRule()])
    expect(()=>readViews([{id:'broken',name:'错误',conditionalFormatting:[amountRule(),amountRule()]}],'marks')).toThrow()
  })
})

describe('conditional formatting runtime ownership',()=>{
  it('applies declared defaults before opening an editor, using raw typed row values',async()=>{
    const {runtime}=create({conditionalFormattingDefinition:{defaultRules:[amountRule()]}})
    await flushPromises()
    expect(runtime.conditionalRules.value).toEqual([amountRule()])
    expect(runtime.conditionalRule({amount:120})).toEqual(amountRule())
    expect(runtime.conditionalRule({amount:'120'})).toBeUndefined()
  })

  it('does not read a disabled Feature definition or render saved rules',async()=>{
    let reads=0
    const input={tableKey:'marks',columns,data:[{id:'a',amount:120}],conditionalFormattingEnabled:false,
      config:{schemaVersion:1 as const,tableKey:'marks',columns:{},conditionalFormatting:[amountRule()]},
      get conditionalFormattingDefinition():ConditionalFormattingDefinition{reads++;throw new Error('OFF definition was read')}}
    let runtime!:ReturnType<typeof useTableRuntime<RowData>>
    const wrapper=mount(defineComponent({setup(){runtime=useTableRuntime(input);return()=>h('div')}}))
    wrappers.push(wrapper)
    await flushPromises()
    expect(reads).toBe(0)
    expect(runtime.conditionalRules.value).toEqual([])
    expect(runtime.conditionalRule({amount:120})).toBeUndefined()
    await expect(runtime.setConditionalRules([amountRule()])).rejects.toThrow()
  })

  it('shows legal saved marks while read-only but rejects writes',async()=>{
    const {runtime}=create({conditionalFormattingDisabled:true,config:{schemaVersion:1,tableKey:'marks',columns:{},conditionalFormatting:[amountRule()]}})
    await flushPromises()
    expect(runtime.conditionalRule({amount:120})?.id).toBe('large')
    await expect(runtime.setConditionalRules([nameRule()])).rejects.toThrow()
    expect(runtime.conditionalRules.value).toEqual([amountRule()])
  })

  it('saves marks in one config write and keeps applied marks unchanged on failure',async()=>{
    const save=vi.fn().mockRejectedValueOnce(new Error('离线')).mockResolvedValue(undefined)
    const {runtime,diagnostics}=create({conditionalFormattingDefinition:{defaultRules:[amountRule()]},persistence:{load:async()=>null,save}})
    await flushPromises()
    await expect(runtime.setConditionalRules([nameRule()])).rejects.toThrow('离线')
    expect(runtime.conditionalRules.value).toEqual([amountRule()])
    expect(diagnostics.some(item=>item.code==='RemoteConfigError')).toBe(true)
    await runtime.setConditionalRules([nameRule()])
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]?.[1]).toMatchObject({schemaVersion:1,tableKey:'marks',conditionalFormatting:[nameRule()]})
    expect(runtime.conditionalRules.value).toEqual([nameRule()])
  })

  it('retains saved marks when an unrelated column setting is written',async()=>{
    const save=vi.fn(async(_key:string,_config:TableConfig)=>{})
    const {runtime}=create({persistence:{load:async()=>({schemaVersion:1,tableKey:'marks',columns:{},conditionalFormatting:[amountRule()]}),save}})
    await flushPromises()
    await runtime.patch('name',{width:220})
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[1].conditionalFormatting).toEqual([amountRule()])
    expect(runtime.conditionalRules.value).toEqual([amountRule()])
  })

  it('rechecks allowed columns and gate when a captured command executes',async()=>{
    const {runtime,input}=create({conditionalFormattingDefinition:{allowedColumns:['amount']}})
    await flushPromises()
    await expect(runtime.setConditionalRules([nameRule()])).rejects.toThrow()
    input.conditionalFormattingEnabled=false
    await expect(runtime.setConditionalRules([amountRule()])).rejects.toThrow()
    expect(runtime.config.value.conditionalFormatting).toBeUndefined()
  })

  it('rechecks the gate for a write waiting behind another save',async()=>{
    let finish!:()=>void
    const save=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve})).mockResolvedValue(undefined)
    const {runtime,input}=create({persistence:{load:async()=>null,save}})
    await flushPromises()
    const first=runtime.setConditionalRules([amountRule()])
    await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(1))
    const queued=runtime.setConditionalRules([nameRule()])
    input.conditionalFormattingEnabled=false
    finish()
    await first
    await expect(queued).rejects.toThrow()
    expect(save).toHaveBeenCalledTimes(1)
    input.conditionalFormattingEnabled=true
    expect(runtime.conditionalRules.value).toEqual([amountRule()])
  })

  it('uses View rules as a separate override, rejects forbidden restoration, and preserves layout for the system View',async()=>{
    const {runtime,diagnostics}=create({conditionalFormattingDefinition:{defaultRules:[amountRule()],allowedColumns:['amount']}})
    await flushPromises()
    await runtime.applyView({id:'custom',name:'自定义',conditionalFormatting:[]})
    expect(runtime.conditionalRules.value).toEqual([])
    await runtime.applyView({id:'forbidden',name:'非法',conditionalFormatting:[nameRule()]})
    expect(runtime.conditionalRules.value).toEqual([amountRule()])
    expect(diagnostics.some(item=>item.path.includes('conditionalFormatting'))).toBe(true)
    await runtime.applyView({id:'custom',name:'自定义',conditionalFormatting:[]})
    await runtime.applyView({id:'all',name:'全部',isSystem:true})
    expect(runtime.conditionalRules.value).toEqual([])
    expect(runtime.viewSnapshot().conditionalFormatting).toEqual([])
  })

  it('keeps a View override after failed personal save and replaces it after a successful save',async()=>{
    const save=vi.fn().mockRejectedValueOnce(new Error('保存失败')).mockResolvedValue(undefined)
    const {runtime}=create({conditionalFormattingDefinition:{defaultRules:[amountRule()]},persistence:{load:async()=>null,save}})
    await flushPromises()
    await runtime.applyView({id:'empty',name:'空标记',conditionalFormatting:[]})
    await expect(runtime.setConditionalRules([nameRule()])).rejects.toThrow('保存失败')
    expect(runtime.conditionalRules.value).toEqual([])
    await runtime.setConditionalRules([nameRule()])
    expect(runtime.conditionalRules.value).toEqual([nameRule()])
    expect(runtime.viewSnapshot().conditionalFormatting).toEqual([nameRule()])
  })

  it('does not clear a newer View override when an earlier personal save finishes',async()=>{
    let finish!:()=>void
    const save=vi.fn((_key:string,_config:TableConfig)=>new Promise<void>(resolve=>{finish=resolve}))
    const {runtime}=create({persistence:{load:async()=>null,save}})
    await flushPromises()
    const pending=runtime.setConditionalRules([amountRule()])
    await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(1))
    await runtime.applyView({id:'new-view',name:'新视图',conditionalFormatting:[nameRule()]})
    expect(runtime.conditionalRules.value).toEqual([nameRule()])
    finish()
    await pending
    expect(runtime.config.value.conditionalFormatting).toEqual([amountRule()])
    expect(runtime.conditionalRules.value).toEqual([nameRule()])
    expect(runtime.viewSnapshot().conditionalFormatting).toEqual([nameRule()])
  })

  it('ignores a late saved preference after tableKey changes',async()=>{
    let complete!: (value:TableConfig|null)=>void
    const load=vi.fn((key:string)=>key==='old'?new Promise<TableConfig|null>(resolve=>{complete=resolve}):Promise.resolve(null))
    const {runtime,input}=create({tableKey:'old',persistence:{load,save:async()=>{}},conditionalFormattingDefinition:{defaultRules:[amountRule()]}})
    await vi.waitFor(()=>expect(load).toHaveBeenCalledWith('old',expect.anything()))
    input.tableKey='new'
    await flushPromises()
    complete({schemaVersion:1,tableKey:'old',columns:{},conditionalFormatting:[nameRule()]})
    await flushPromises()
    expect(runtime.config.value.tableKey).toBe('new')
    expect(runtime.conditionalRules.value).toEqual([amountRule()])
  })

  it('does not publish a save started for an obsolete tableKey',async()=>{
    let finish!:()=>void
    const save=vi.fn((_key:string,_config:TableConfig)=>new Promise<void>(resolve=>{finish=resolve}))
    const {runtime,input}=create({tableKey:'old',persistence:{load:async()=>null,save}})
    await flushPromises()
    const pending=runtime.setConditionalRules([amountRule()])
    await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(1))
    input.tableKey='new'
    await flushPromises()
    finish()
    await pending
    expect(runtime.config.value.tableKey).toBe('new')
    expect(runtime.config.value.conditionalFormatting).toBeUndefined()
    expect(save.mock.calls[0]?.[0]).toBe('old')
  })
})
