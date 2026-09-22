import { describe, expect, it, vi } from 'vitest'
import { createViewsRuntime, readViews } from '../src/features/views/runtime'

describe('shared view runtime', () => {
  it('keeps layout for the system all view and clears query state', async () => {
    const apply = vi.fn(async (_value:unknown) => {})
    const runtime = createViewsRuntime({ tableKey: 'a', initial: [{id:'all',name:'全部',isSystem:true},{id:'mine',name:'我的',filters:[{field:'status',operator:'eq',value:1}]}], apply })
    await runtime.apply('all')
    expect(apply.mock.calls[0][0]).toMatchObject({id:'all',filters:[],sorts:[]})
    expect(apply.mock.calls[0][0]).not.toHaveProperty('columns')
  })
  it('excludes page and selection from saved state, but retains pageSize', async () => {
    const store = createViewsRuntime({tableKey:'a',initial:[],apply:async()=>{}})
    await store.saveAs('布局', {page:8,pageSize:50,selectedRows:[{id:1}],columns:{id:{width:180}}} as never)
    expect(store.views.value[0]).toMatchObject({pageSize:50,columns:{id:{width:180}}})
    expect(store.views.value[0]).not.toHaveProperty('page')
    expect(store.views.value[0]).not.toHaveProperty('selectedRows')
  })
  it('does not publish a failed save and keeps the existing default', async () => {
    const initial=[{id:'all',name:'全部',isDefault:true,isSystem:true},{id:'x',name:'甲'}]
    const runtime=createViewsRuntime({tableKey:'a',initial,apply:async()=>{},save:async()=>{throw Error('offline')}})
    await expect(runtime.setDefault('x')).rejects.toThrow('offline')
    expect(runtime.views.value[0].isDefault).toBe(true)
    expect(runtime.views.value[1].isDefault).not.toBe(true)
  })
  it('rejects duplicate names and immutable system rename/delete', async () => {
    const runtime=createViewsRuntime({tableKey:'a',initial:[{id:'all',name:'全部',isSystem:true},{id:'x',name:'甲'}],apply:async()=>{}})
    await expect(runtime.rename('all','乙')).rejects.toThrow()
    await expect(runtime.remove('all')).rejects.toThrow()
    await expect(runtime.saveAs('甲',{})).rejects.toThrow()
  })
  it('bounds and sanitizes stored data and repairs multiple defaults', () => {
    const result=readViews([{id:'a',name:'A',isDefault:true,page:8},{id:'b',name:'B',isDefault:true}], 'a')
    expect(result.filter(view=>view.isDefault)).toHaveLength(1)
    expect(result[0]).not.toHaveProperty('page')
    expect(()=>readViews('{broken','a')).toThrow()
  })
})
