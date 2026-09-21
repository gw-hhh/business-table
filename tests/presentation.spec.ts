import {afterEach, describe, expect, it} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'

const wrappers: VueWrapper[] = []
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))
const data = [{id:'A',name:'Alpha',status:'draft'},{id:'B',name:'Beta',status:'sent'}]
function create(extra: Record<string, unknown> = {}) {
  const wrapper = mount(BusinessTable, {
    props: {columns:[{id:'id',field:'id',title:'编号'},{id:'name',field:'name',title:'名称'}], data, ...extra},
    global: {stubs:{
      'vxe-table': {props:['data'], template:'<div><slot /></div>'},
      'vxe-column': {props:['field'], template:'<div :data-field="field"><slot name="header"/><slot :row="{id:\'A\',name:\'Alpha\',status:\'draft\'}"/></div>'},
    }},
  }) as VueWrapper
  wrappers.push(wrapper)
  return wrapper
}

describe('presentation controls keep public state independent of VXE', () => {
  it('an external search commits one isolated query and returns matching rows', async () => {
    const wrapper=create()
    await flushPromises()
    const api=wrapper.vm as any
    expect(typeof api.setQuery).toBe('function')
    const filters=[{field:'status',operator:'eq',value:'draft'}]
    await api.setQuery({keyword:'Alpha',filters})
    filters[0]!.value='sent'
    expect(api.getState()).toMatchObject({total:1,page:1,rows:[data[0]],query:{keyword:'Alpha',filters:[{field:'status',operator:'eq',value:'draft'}]}})
    expect(wrapper.emitted('queryChange')).toHaveLength(2)
    const snapshot=api.getState()
    snapshot.query.filters[0].value='another'
    expect(api.getState().query.filters[0].value).toBe('draft')
  })

  it('selection is opt-in, emits rows and clears when the query changes', async () => {
    const wrapper=create({selection:true})
    await flushPromises()
    expect(wrapper.find('input[aria-label="选择 A"]').exists()).toBe(true)
    await wrapper.get('input[aria-label="选择 A"]').setValue(true)
    const api=wrapper.vm as any
    expect(api.getSelectedRows()).toEqual([data[0]])
    expect(wrapper.emitted('selectionChange')?.at(-1)).toEqual([[data[0]]])
    await api.setQuery({keyword:'Beta'})
    expect(api.getSelectedRows()).toEqual([])
  })

  it('a bulk settings commit saves once and enforces every column capability', async () => {
    const wrapper=create({features:{columnSettings:{enabled:true,mode:'headless'}},columns:[
      {id:'id',field:'id',title:'编号',fixed:'left',configurable:{width:{enabled:true,min:100,max:300}}},
      {id:'name',field:'name',title:'名称'},
    ]})
    await flushPromises()
    const context=await (wrapper.vm as any).activateFeature('columnSettings')
    expect(typeof context.apply).toBe('function')
    await context.apply({id:{width:220,fixed:false},name:{title:'新名称'}})
    expect(context.columns[0]).toMatchObject({width:220,fixed:'left'})
    expect(context.columns[1].title).toBe('新名称')
    expect(wrapper.emitted('configChange')).toHaveLength(1)
  })

  it('the quick entry opens quick settings after the full drawer was closed',async()=>{
    const wrapper=create({features:{columnSettings:true}})
    const api=wrapper.vm as any
    await api.openColumnSettings('drawer');await flushPromises()
    const context=api.getFeatureContext('columnSettings')
    context.close();await flushPromises()
    await wrapper.get('[data-testid="column-settings"]').trigger('click');await flushPromises()
    expect(wrapper.find('[data-testid="column-panel"]').exists()).toBe(true)
  })
  it('external views keep hidden columns in snapshots and restore personal preferences on leaving',async()=>{
    const wrapper=create({tableKey:'views',config:{schemaVersion:1,tableKey:'views',columns:{name:{title:'个人名称',visible:false}}}})
    await flushPromises()
    const api=wrapper.vm as any
    expect(typeof api.applyView).toBe('function')
    await api.applyView({id:'special',name:'特别视图',columns:{name:{visible:true,title:'视图名称'}}},'Alpha')
    expect(api.getState().columns.find((column:any)=>column.id==='name')).toMatchObject({visible:true,title:'视图名称'})
    expect(api.getState().total).toBe(1)
    await api.applyView({id:'all',name:'全部'},'')
    expect(api.getState().columns.find((column:any)=>column.id==='name')).toMatchObject({visible:false,title:'个人名称'})
    expect(wrapper.emitted('configChange')).toBeUndefined()
  })
  it('refreshing selected records gives batch actions current row values',async()=>{
    const wrapper=create({selection:true})
    await flushPromises()
    await wrapper.get('input[aria-label="选择 A"]').setValue(true)
    await wrapper.setProps({data:[{...data[0],name:'Updated'},data[1]]})
    await flushPromises()
    expect((wrapper.vm as any).getSelectedRows()).toEqual([{...data[0],name:'Updated'}])
    expect(wrapper.emitted('selectionChange')?.at(-1)).toEqual([[{...data[0],name:'Updated'}]])
  })
  it('editing an applied view starts from its visible state and overrides only edited fields',async()=>{
    const wrapper=create({features:{columnSettings:{enabled:true,mode:'headless'}}})
    await flushPromises()
    const api=wrapper.vm as any
    const view={id:'custom',name:'自定义',columns:{name:{title:'视图名称',width:260}}}
    await api.applyView(view)
    const context=await api.activateFeature('columnSettings')
    expect(context.columns.find((column:any)=>column.id==='name').title).toBe('视图名称')
    await context.apply({name:{title:'更新名称'}})
    expect(api.getState().columns.find((column:any)=>column.id==='name')).toMatchObject({title:'更新名称',width:260})
    expect(view.columns.name).toEqual({title:'视图名称',width:260})
    await api.applyView()
    expect(api.getState().columns.find((column:any)=>column.id==='name').title).toBe('更新名称')
  })
})
