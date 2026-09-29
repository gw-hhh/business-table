import {afterEach,expect,it,vi} from 'vitest'
import {defineComponent,reactive} from 'vue'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {useTableRuntime,type TableRuntimeInput,type TableRuntime} from '../src/runtime/useTableRuntime'

const wrappers:VueWrapper[]=[]
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount());vi.restoreAllMocks()})
async function create(input:TableRuntimeInput<{id:number}>){
  let table!:TableRuntime<{id:number}>
  wrappers.push(mount(defineComponent({setup(){table=useTableRuntime(input);return()=>null}})))
  await flushPromises();return table
}
const columns=[{id:'id',field:'id',title:'编号'}]
const data=Array.from({length:31},(_,id)=>({id}))

it('disabling pagination returns every local match while hiding the bar only retains a page',async()=>{
  const full=await create({columns,data,pagination:{enabled:false}})
  expect(full.rows.value).toHaveLength(31)
  expect(full.page.value).toBe(1)
  const paged=await create({columns,data,pagination:{visible:false,pageSize:10}})
  expect(paged.rows.value).toHaveLength(10)
})
it('unpaged remote data uses the bounded full-result protocol, never an inflated page query',async()=>{
  const query=vi.fn(async()=>({rows:data.slice(0,10),total:31}))
  const readAll=vi.fn(async()=>data)
  const table=await create({columns,dataSource:{query,readAll},pagination:{enabled:false,unpagedLimit:100}})
  expect(table.rows.value).toHaveLength(31)
  expect(table.total.value).toBe(31)
  expect(query).not.toHaveBeenCalled()
  expect(readAll.mock.calls).toHaveLength(1)
})
it('reports an unpaged remote source without readAll instead of showing an incomplete page',async()=>{
  const table=await create({columns,dataSource:{query:async()=>({rows:[],total:0})},pagination:{enabled:false}})
  expect(table.error.value).toContain('完整结果接口')
})
it('reacts to externally changed page without resetting identical pagination objects',async()=>{
  const input=reactive({columns,data,pagination:{page:1,pageSize:10}})
  const table=await create(input)
  input.pagination.page=3;await flushPromises()
  expect(table.rows.value[0]?.id).toBe(20)
  table.goPage(2);await flushPromises()
  input.pagination={page:3,pageSize:10};await flushPromises()
  expect(table.page.value).toBe(2)
})
it('reuses the local filtered order when paging and invalidates it on reload and data changes',async()=>{
  let reads=0
  const records=Array.from({length:31},(_,id)=>({id,get name(){reads++;return `item ${id}`}}))
  let table!:ReturnType<typeof useTableRuntime<(typeof records)[number]>>
  const input=reactive({columns:[{id:'name',field:'name',title:'名称'}],data:records,pagination:{pageSize:10}})
  wrappers.push(mount(defineComponent({setup(){table=useTableRuntime(input);return()=>null}})))
  await flushPromises();await table.setQuery({keyword:'item'})
  reads=0;table.goPage(2);await flushPromises()
  expect(reads).toBe(0)
  await table.reload();expect(reads).toBeGreaterThan(0)
  input.data=[{id:99,name:'item changed'}];await flushPromises()
  expect(table.rows.value.map(row=>row.id)).toEqual([99])
})
