import { describe, expect, it, vi } from 'vitest'
import { createViewsRuntime, createViewChangeTracker, readViews, viewQueryEquals } from '../src/features/views/runtime'
import {ref} from 'vue'

describe('shared view runtime', () => {
  it('tracks layout, page size and collapse changes independently from query values',()=>{
    const state=ref<import('../src/features/views/runtime').ViewSnapshot>({pageSize:10,searchCollapsed:true,presentation:{appearance:{density:'default'}}})
    const changes=createViewChangeTracker(()=>state.value)
    changes.accept();state.value.pageSize=25;expect(changes.modified.value).toBe(true)
    changes.accept();state.value.searchCollapsed=false;expect(changes.modified.value).toBe(true)
    changes.accept();state.value.presentation={appearance:{density:'compact'}};expect(changes.modified.value).toBe(true)
    changes.accept();expect(changes.modified.value).toBe(false)
  })
  it('does not reactivate a deleted pending target or let a slow save steal a later activation',async()=>{
    let finishApply!:()=>void,finishSave!:()=>void
    const runtime=createViewsRuntime({tableKey:'race',initial:[{id:'all',name:'全部',isSystem:true},{id:'x',name:'目标'}],apply:view=>view.id==='x'?new Promise<void>(resolve=>{finishApply=resolve}):Promise.resolve()})
    const pending=runtime.apply('x');await runtime.remove('x');finishApply();await pending
    expect(runtime.activeId.value).toBe('all');expect(runtime.current.value?.id).toBe('all')
    const slow=createViewsRuntime({tableKey:'race',initial:[{id:'all',name:'全部'},{id:'x',name:'目标'}],apply:async()=>{},save:()=>new Promise<void>(resolve=>{finishSave=resolve})})
    const saving=slow.saveAs('新建',{});await vi.waitFor(()=>expect(finishSave).toBeTypeOf('function'))
    await slow.apply('x');finishSave();await saving
    expect(slow.activeId.value).toBe('x')
  })
  it('ignores an obsolete apply completion and captures save input before the persistence queue',async()=>{
    let resolveFirst!:()=>void
    const runtime=createViewsRuntime({tableKey:'race',initial:[{id:'a',name:'甲'},{id:'b',name:'乙'}],apply:view=>view.id==='a'?new Promise<void>(resolve=>{resolveFirst=resolve}):Promise.resolve()})
    const first=runtime.apply('a');await runtime.apply('b');resolveFirst();await first
    expect(runtime.activeId.value).toBe('b')
    const snapshot={keyword:'已确认的条件'}
    const save=runtime.saveAs('保存',snapshot);snapshot.keyword='随后输入的条件'
    const id=await save
    expect(runtime.views.value.find(view=>view.id===id)?.keyword).toBe('已确认的条件')
  })
  it('keeps system views anchored and rejects equivalent names across width and case', async () => {
    const runtime=createViewsRuntime({tableKey:'a',initial:[{id:'all',name:'全部',isSystem:true},{id:'a',name:'ABC'},{id:'b',name:'乙'}],apply:async()=>{}})
    await runtime.move('all',1);await runtime.move('a',-1)
    expect(runtime.views.value.map(view=>view.id)).toEqual(['all','a','b'])
    await expect(runtime.saveAs('ａｂｃ',{})).rejects.toThrow()
    await expect(runtime.rename('b','x'.repeat(31))).rejects.toThrow()
    await runtime.move('b',-1)
    expect(runtime.views.value.map(view=>view.id)).toEqual(['all','b','a'])
  })
  it('replaces a view snapshot and resets a deleted default to the system view',async()=>{
    const runtime=createViewsRuntime({tableKey:'a',initial:[{id:'all',name:'全部',isSystem:true},{id:'a',name:'甲',isDefault:true,filterGroup:{logic:'and',rules:[{field:'name',operator:'eq',value:'旧条件'}]}}],apply:async()=>{}})
    await runtime.update('a',{keyword:'新查询'})
    expect(runtime.views.value[1]).not.toHaveProperty('filterGroup')
    await runtime.remove('a')
    expect(runtime.views.value[0].isDefault).toBe(true)
    expect(runtime.activeId.value).toBe('all')
  })
  it('compares independent search, column and combined query layers with stable field order', () => {
    const left = { filters: [{field:'name',operator:'eq' as const,value:'甲'}], columnFilters:[{field:'amount',operator:'gt' as const,value:10}], filterGroup: {logic:'or' as const,rules:[{field:'name',operator:'contains' as const,value:'甲'}]} }
    expect(typeof viewQueryEquals).toBe('function')
    expect(viewQueryEquals(left, JSON.parse(JSON.stringify(left)))).toBe(true)
    expect(viewQueryEquals(left, {...left,columnFilters:[]})).toBe(false)
    expect(viewQueryEquals(left, {...left,filterGroup:undefined})).toBe(false)
    expect(viewQueryEquals({}, {filters:[],columnFilters:[],sorts:[],keyword:'',filterGroup:{logic:'and',rules:[]}})).toBe(true)
  })
  it('keeps layout for the system all view and clears query state', async () => {
    const apply = vi.fn(async (_value:unknown) => {})
    const runtime = createViewsRuntime({ tableKey: 'a', initial: [{id:'all',name:'全部',isSystem:true},{id:'mine',name:'我的',filters:[{field:'status',operator:'eq',value:1}]}], apply })
    await runtime.apply('all')
    expect(apply.mock.calls[0][0]).toMatchObject({id:'all',isSystem:true,filters:[],sorts:[]})
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
