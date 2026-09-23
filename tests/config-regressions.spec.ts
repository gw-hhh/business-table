import {afterEach,it,expect,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {reactive,nextTick} from 'vue'
import Configured from '../src/ConfiguredBusinessTable.vue'
import FeatureHost from '../src/components/FeatureHost.vue'
import {createRegistry} from '../src/runtime/registry'
import {resolveConfiguration} from '../src/config/schema'
import {displayValue} from '../src/core'
import type {TableDefinition} from '../src/config/types'
import type {ColumnConfig,UserColumnConfig,Query} from '../src/types'
import {fullSettingsDefinition} from './fixtures/settings'
const definition=():TableDefinition=>({schemaVersion:3,tableKey:'regression',columns:[{id:'id',field:'id',title:'编号',width:100,configurable:{width:true}}],pagination:{pageSize:20,pageSizeOptions:[20,50,100]}})
const stubs={'vxe-table':{props:['data'],template:'<div><slot/></div>'},'vxe-column':{props:['field','width'],template:'<div :data-width="width"><slot :row="{id:1}"/></div>'}}
const wrappers:VueWrapper[]=[],errors:unknown[]=[]
function mountTable(props:Record<string,unknown>={}){
  const w=mount(Configured,{props:{definition:definition(),data:[{id:1}],...props},global:{stubs,config:{errorHandler:error=>errors.push(error)}}}) as VueWrapper
  wrappers.push(w);return w
}
type SettingsContext={columns:ColumnConfig[];patch:(id:string,patch:UserColumnConfig)=>Promise<void>}
type Exposed={activateFeature:(name:string)=>Promise<SettingsContext>}
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());errors.splice(0);vi.unstubAllGlobals()})

it('applies asynchronous page-size preference and remote defaults to the UI and next query exactly once',async()=>{
  const query=vi.fn(async(_query:Query)=>({rows:[{id:1}],total:100}))
  const w=mountTable({dataSource:{query}})
  await flushPromises()
  await w.setProps({preference:{kind:'business-table-preference',schemaVersion:3,tableKey:'regression',columns:{},pagination:{pageSize:50}}})
  await flushPromises()
  expect(w.get<HTMLSelectElement>('select').element.value).toBe('50')
  expect(query).toHaveBeenCalledTimes(2)
  expect(query.mock.calls.at(-1)?.[0]).toMatchObject({page:1,pageSize:50})
  await w.setProps({preference:null,remoteOverride:{pagination:{pageSize:100}}});await flushPromises()
  expect(w.get<HTMLSelectElement>('select').element.value).toBe('100')
  expect(query).toHaveBeenCalledTimes(3)
  await w.setProps({remoteOverride:undefined});await flushPromises()
  expect(w.get<HTMLSelectElement>('select').element.value).toBe('20')
  expect(query).toHaveBeenCalledTimes(4)
})

it('revokes a row action when an activated remote allowlist is narrowed in place',async()=>{
  const registry=createRegistry(),edit=vi.fn()
  registry.register('rowAction','edit',{id:'edit',label:'编辑',handler:edit})
  const remote=reactive({features:{rowActions:{details:{allowedItems:['edit']}}}})
  const d=definition();d.features={rowActions:{enabled:true,details:{allowedItems:['edit']}}}
  const w=mountTable({definition:d,remoteOverride:remote,registry})
  await vi.waitFor(()=>expect(w.text()).toContain('编辑'))
  remote.features.rowActions.details.allowedItems.splice(0)
  await nextTick();await flushPromises()
  expect(w.text()).not.toContain('编辑')
  expect(edit).not.toHaveBeenCalled()
})

it('revokes retained headless context mutations when feature is disabled or unmounted',async()=>{
  const d=definition();d.settings=fullSettingsDefinition();d.features={columnSettings:{enabled:true,mode:'headless'}}
  const w=mountTable({definition:d})
  const context=await (w.vm as unknown as Exposed).activateFeature('columnSettings')
  await w.setProps({definition:{...d,features:{columnSettings:false}}})
  await context.patch('id',{width:200})
  expect(w.emitted('preferenceChange')).toBeUndefined()
  await w.setProps({definition:d})
  const current=await (w.vm as unknown as Exposed).activateFeature('columnSettings')
  w.unmount();wrappers.splice(wrappers.indexOf(w),1)
  await current.patch('id',{width:220})
  expect(w.emitted('preferenceChange')).toBeUndefined()
})

it('observes the new sentinel after changing load strategy to on-visible',async()=>{
  const observe=vi.fn(),createContext=vi.fn(()=>({}))
  let intersect!:(entries:{isIntersecting:boolean}[])=>void
  vi.stubGlobal('IntersectionObserver',class{constructor(callback:typeof intersect){intersect=callback}observe=observe;disconnect(){}})
  const w=mount(FeatureHost,{props:{local:{enabled:true,loadStrategy:'on-interaction'},createContext,loader:async()=>({default:{template:'<span>Loaded</span>'}})}})
  wrappers.push(w)
  await w.setProps({local:{enabled:true,loadStrategy:'on-visible'}});await nextTick()
  expect(observe).toHaveBeenCalledTimes(1)
  expect(createContext).not.toHaveBeenCalled()
  intersect([{isIntersecting:true}]);await flushPromises()
  expect(createContext).toHaveBeenCalledTimes(1)
  expect(w.text()).toContain('Loaded')
})

it.each(['currency','percent'] as const)('formats a valid minimum-only %s precision without throwing',style=>{
  const d=definition()
  Object.assign(d.columns[0]!,{type:style,numberFormat:{style,minimumFractionDigits:3}})
  const result=resolveConfiguration({definition:d})
  expect(result.diagnostics).toEqual([])
  expect(()=>displayValue(1,result.columns[0]!)).not.toThrow()
  expect(displayValue(1,result.columns[0]!)).toContain('.000')
})

it('falls back to cell text with diagnostics if a registered renderer throws',async()=>{
  const registry=createRegistry()
  registry.register('renderer','broken',()=>{throw Error('renderer failed')})
  const d=definition();d.columns[0]!.renderer='broken'
  const w=mountTable({definition:d,registry})
  await flushPromises()
  expect(errors).toEqual([])
  expect(w.text()).toContain('1')
  expect(w.emitted('diagnostic')?.length).toBeGreaterThan(0)
})

it('isolates failing action predicates while retaining healthy and disabled actions',async()=>{
  const registry=createRegistry(),handler=vi.fn()
  registry.register('rowAction','bad',{id:'bad',label:'隐藏错误',visible:()=>{throw Error('visible failed')},handler})
  registry.register('rowAction','disabled',{id:'disabled',label:'禁用错误',disabled:()=>{throw Error('disabled failed')},handler})
  registry.register('rowAction','good',{id:'good',label:'正常动作',handler})
  const d=definition();d.features={rowActions:{enabled:true,details:{allowedItems:['bad','disabled','good']}}}
  const w=mountTable({definition:d,registry})
  await vi.waitFor(()=>expect(w.text()).toContain('正常动作'))
  expect(errors).toEqual([])
  expect(w.text()).not.toContain('隐藏错误')
  const disabled=w.findAll('button').find(button=>button.text()==='禁用错误')!
  expect(disabled.attributes('disabled')).toBeDefined()
  expect(w.emitted('diagnostic')?.length).toBeGreaterThan(0)
  await w.findAll('button').find(button=>button.text()==='正常动作')!.trigger('click')
  expect(handler).toHaveBeenCalledTimes(1)
})

it('disables forbidden fixed sides while allowing the permitted side and unpin',async()=>{
  const d=definition()
  d.columns[0]!.configurable={fixed:{enabled:true,allowedValues:['left',false]}}
  d.settings=fullSettingsDefinition()
  d.features={columnSettings:true}
  const w=mountTable({definition:d})
  await w.get('[data-testid="column-settings"]').trigger('click')
  await vi.waitFor(()=>expect(w.find('[data-testid="column-panel"]').exists()).toBe(true))
  expect(w.get('[title="右冻结 编号"]').attributes('disabled')).toBeDefined()
  expect(w.get('[title="左冻结 编号"]').attributes('disabled')).toBeUndefined()
  await w.get('[title="左冻结 编号"]').trigger('click')
  expect(w.get('[title="左冻结 编号"]').attributes('disabled')).toBeUndefined()
})

it('discards stale feature details if permissions change while its module is loading',async()=>{
  let finish!:(value:{default:{template:string}})=>void
  const module=new Promise<{default:{template:string}}>(resolve=>{finish=resolve})
  const remote=reactive({details:{allowedItems:['edit']}})
  const w=mount(FeatureHost,{props:{local:{enabled:true,loadStrategy:'on-interaction',details:{allowedItems:['edit']}},remote,
    createContext:(details:{allowedItems?:string[]})=>({allowed:details.allowedItems}),loader:()=>module}})
  wrappers.push(w)
  const api=w.vm as unknown as {activate:()=>Promise<unknown>;getContext:()=>{allowed:string[]}}
  const first=api.activate()
  remote.details.allowedItems=[]
  await nextTick()
  finish({default:{template:'<span>Loaded</span>'}})
  await first;await flushPromises()
  expect(api.getContext().allowed).toEqual([])
})

it('preserves built-in value-map styling when no registered renderer is requested',async()=>{
  const d=definition()
  d.columns[0]!.valueMap=[{value:1,label:'已确认',color:'#067647',background:'#ecfdf3'}]
  const w=mountTable({definition:d})
  await flushPromises()
  expect(w.find('.bt-tag').exists()).toBe(true)
  expect(w.get('.bt-tag').text()).toBe('已确认')
  expect(w.get<HTMLElement>('.bt-tag').element.style.color).toBe('rgb(6, 118, 71)')
})
