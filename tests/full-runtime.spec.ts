import {afterEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'
import {defaultPresentation} from '../src/features/presentation/model'
import type {Query} from '../src/types'
const wrappers:VueWrapper[]=[]
function setup(overrides:Record<string,unknown>={}){
  const wrapper=mount(BusinessTable,{props:{tableKey:'full-runtime',columns:[{id:'name',field:'name',title:'名称',sortable:true},{id:'amount',field:'amount',title:'金额',type:'number',sortable:true}],data:[{id:'1',name:'甲',amount:10},{id:'2',name:'甲',amount:30},{id:'3',name:'乙',amount:40}],...overrides},global:{stubs:{'vxe-table':{props:['data'],template:'<div><span v-for="row in data" :key="row.id" class="row">{{row.id}}</span><slot/></div>'},'vxe-column':{template:'<div><slot name="header"/></div>'}}}}) as VueWrapper
  wrappers.push(wrapper);return wrapper
}
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount())})
describe('table runtime state contracts',()=>{
  it('commits columns, appearance and sorting through one durable settings transaction',async()=>{
    const save=vi.fn(async()=>{}),wrapper=setup({persistence:{load:async()=>null,save}});await flushPromises()
    expect(typeof (wrapper.vm as any).applySettings).toBe('function')
    await (wrapper.vm as any).applySettings({columns:{name:{title:'新名称'}},sorts:[{field:'amount',order:'desc'}],presentation:{...defaultPresentation(),appearance:{...defaultPresentation().appearance,fontSize:18}}})
    expect(save).toHaveBeenCalledTimes(1)
    expect((wrapper.vm as any).getState().presentation.appearance.fontSize).toBe(18)
    expect((wrapper.vm as any).getState().query.sorts).toEqual([{field:'amount',order:'desc'}])
  })
  it('keeps top search and column conditions independent when a column filter is cleared',async()=>{
    const wrapper=setup();await flushPromises();const api=wrapper.vm as any
    expect(typeof api.setColumnFilters).toBe('function')
    await api.setQuery({filters:[{field:'name',operator:'eq',value:'甲'}]})
    await api.setColumnFilters([{field:'amount',operator:'gte',value:20}])
    expect(api.getState().rows.map((row:any)=>row.id)).toEqual(['2'])
    await api.setColumnFilters([])
    expect(api.getState().rows.map((row:any)=>row.id)).toEqual(['1','2'])
    expect(api.getState().query.filters).toEqual([{field:'name',operator:'eq',value:'甲'}])
  })
  it('applies AND/OR groups locally without replacing search conditions',async()=>{
    const wrapper=setup();await flushPromises();const api=wrapper.vm as any
    await api.setQuery({filters:[{field:'name',operator:'eq',value:'甲'}],filterGroup:{logic:'or',rules:[{field:'amount',operator:'eq',value:30},{field:'name',operator:'eq',value:'乙'}]}})
    expect(api.getState().rows.map((row:any)=>row.id)).toEqual(['2'])
  })
  it('restores a view page size and resets page without overwriting durable personal preferences',async()=>{
    const save=vi.fn(async()=>{}),wrapper=setup({pagination:{pageSize:10,pageSizeOptions:[10,25]},persistence:{load:async()=>null,save}});await flushPromises()
    await (wrapper.vm as any).applyView({id:'view',name:'自定义',pageSize:25,presentation:{appearance:{fontSize:18}},filters:[],sorts:[]})
    expect((wrapper.vm as any).getState()).toMatchObject({page:1,pageSize:25,presentation:{appearance:{fontSize:18}}})
    expect(save).not.toHaveBeenCalled()
  })
  it('does not let providers mutate nested query groups',async()=>{
    const wrapper=setup({dataSource:{query:async(query:Query)=>{if(query.filterGroup)query.filterGroup.rules.splice(0);return {rows:[],total:0}}}});await flushPromises()
    await (wrapper.vm as any).setQuery({filterGroup:{logic:'and',rules:[{field:'name',operator:'eq',value:'甲'}]}})
    expect((wrapper.vm as any).getState().query.filterGroup.rules).toHaveLength(1)
  })
  it('cycles a sortable header through ascending, descending and unsorted',async()=>{
    const wrapper=setup();await flushPromises()
    const button=wrapper.findAll('.bt__sort').find(item=>item.text().trim().startsWith('名称'))!
    for(let i=0;i<3;i++){await button.trigger('click');await flushPromises()}
    expect((wrapper.vm as any).getState().query.sorts).toEqual([])
  })
})
