import {afterEach,beforeAll,describe,expect,it} from 'vitest'
import {defineComponent,nextTick,reactive,type PropType} from 'vue'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import BusinessTable from '../src/BusinessTable.vue'
import type {DataSource,FilterConfig,Query,QueryResult,SortConfig,ViewConfig} from '../src/types'

type Row={id:string;status?:string}
// These tests isolate Provider sequencing. Lazy module timing is covered separately.
beforeAll(async()=>{await Promise.all([import('../src/components/TableSearch.vue'),import('../src/components/ViewSwitcher.vue'),import('../src/components/TableToolbar.vue')])})

const VxeTableStub=defineComponent({
  name:'VxeTableStub',
  props:{
    data:{type:Array as PropType<Row[]>,default:()=>[]},
    loading:{type:Boolean,default:false},
  },
  template:`<div data-testid="vxe-table" :data-loading="loading?'true':'false'">
    <span v-for="row in data" :key="row.id" data-testid="rendered-row">{{row.id}}</span>
    <slot />
    <slot v-if="data.length===0" name="empty" />
  </div>`,
})

const VxeColumnStub=defineComponent({
  name:'VxeColumnStub',
  template:'<div><slot name="header" /></div>',
})

const wrappers:VueWrapper[]=[]
const pendingCleanups=new Set<()=>void>()

function deferred<T>(fallback:T){
  let settled=false
  let resolvePromise!:(value:T)=>void
  let rejectPromise!:(reason?:unknown)=>void
  const promise=new Promise<T>((resolve,reject)=>{
    resolvePromise=resolve
    rejectPromise=reject
  })
  const cleanup=()=>{
    if(settled)return
    settled=true
    pendingCleanups.delete(cleanup)
    resolvePromise(fallback)
  }
  pendingCleanups.add(cleanup)
  return{
    promise,
    resolve(value:T){
      if(settled)return
      settled=true
      pendingCleanups.delete(cleanup)
      resolvePromise(value)
    },
    reject(reason:unknown){
      if(settled)return
      settled=true
      pendingCleanups.delete(cleanup)
      rejectPromise(reason)
    },
  }
}

function mountTable(overrides:Record<string,unknown>={}){
  const wrapper=mount(BusinessTable,{
    props:{
      tableKey:'query-tests',
      rowKey:'id',
      features:{search:true,toolbar:true,views:true},
      columns:[{id:'id',field:'id',title:'编号',sortable:true},{id:'status',field:'status',title:'状态'}],
      ...overrides,
    },
    global:{stubs:{'vxe-table':VxeTableStub,'vxe-column':VxeColumnStub}},
  }) as VueWrapper
  wrappers.push(wrapper)
  return wrapper
}

function rowsOf(wrapper:VueWrapper){
  return(wrapper.findComponent(VxeTableStub).props('data') as Row[]).map(row=>row.id)
}

function loadingOf(wrapper:VueWrapper){
  return wrapper.findComponent(VxeTableStub).props('loading') as boolean
}

function button(wrapper:VueWrapper,label:string){
  const found=wrapper.findAll('button').find(node=>node.text().trim()===label)
  if(!found)throw new Error(`找不到按钮：${label}`)
  return found
}

async function click(wrapper:VueWrapper,label:string){
  await button(wrapper,label).trigger('click')
  await nextTick()
  await flushPromises()
}

afterEach(async()=>{
  for(const wrapper of wrappers.splice(0))wrapper.unmount()
  for(const cleanup of [...pendingCleanups])cleanup()
  await flushPromises()
})

describe('BusinessTable query lifecycle',()=>{
  it('嵌套响应式筛选值可独立快照并保留日期和循环引用',async()=>{
    const selected=reactive({code:'draft'})
    const values=reactive(['draft'])
    const value:Record<string,unknown>={selected,values,date:new Date('2026-01-01T00:00:00Z')}
    value.self=value
    const calls:Query[]=[]
    const events:Query[]=[]
    const wrapper=mountTable({
      views:[{id:'nested',name:'嵌套筛选',filters:[{field:'status',operator:'eq',value}]}],
      onQueryChange:(query:Query)=>events.push(query),
      dataSource:{query:async(query:Query)=>{calls.push(query);return{rows:[],total:0}}},
    })
    await flushPromises()
    await wrapper.get('select[aria-label="视图"]').setValue('nested')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(calls).toHaveLength(2)
    const snapshot=calls[1]!.filters[0]!.value as typeof value
    expect(snapshot.date).toBeInstanceOf(Date)
    expect(snapshot.self).toBe(snapshot)
    ;(snapshot.selected as {code:string}).code='changed'
    ;(snapshot.values as string[]).push('changed')
    expect(selected.code).toBe('draft')
    expect(values).toEqual(['draft'])
    expect(events[1]!.filters[0]!.value).toMatchObject({selected:{code:'draft'},values:['draft']})
  })

  it('新查询会中止旧 Provider signal',async()=>{
    const calls:Query[]=[]
    const first=deferred<QueryResult<Row>>({rows:[],total:0})
    const second=deferred<QueryResult<Row>>({rows:[],total:0})
    const dataSource:DataSource<Row>={query(query){
      calls.push(query)
      return calls.length===1?first.promise:second.promise
    }}
    const wrapper=mountTable({dataSource})
    await flushPromises()

    await button(wrapper,'刷新').trigger('click')
    await nextTick()

    const oldSignal=calls[0]?.signal
    second.resolve({rows:[{id:'B'}],total:1})
    first.resolve({rows:[{id:'A'}],total:1})
    await flushPromises()

    expect(oldSignal).toBeInstanceOf(AbortSignal)
    expect(oldSignal?.aborted).toBe(true)
  })

  it('B 请求先成功后 A 请求成功也不会覆盖 B 的行和总数',async()=>{
    const first=deferred<QueryResult<Row>>({rows:[],total:0})
    const second=deferred<QueryResult<Row>>({rows:[],total:0})
    let call=0
    const wrapper=mountTable({dataSource:{query:()=>++call===1?first.promise:second.promise}})
    await flushPromises()
    await button(wrapper,'刷新').trigger('click')

    second.resolve({rows:[{id:'B'}],total:1})
    await flushPromises()
    expect(rowsOf(wrapper)).toEqual(['B'])
    first.resolve({rows:[{id:'A'}],total:9})
    await flushPromises()

    expect(rowsOf(wrapper)).toEqual(['B'])
    expect(wrapper.text()).toContain('共 1 条')
  })

  it('已过期请求拒绝不会显示错误',async()=>{
    const first=deferred<QueryResult<Row>>({rows:[],total:0})
    const second=deferred<QueryResult<Row>>({rows:[],total:0})
    let call=0
    const wrapper=mountTable({dataSource:{query:()=>++call===1?first.promise:second.promise}})
    await flushPromises()
    await button(wrapper,'刷新').trigger('click')
    second.resolve({rows:[{id:'current'}],total:1})
    await flushPromises()
    first.reject(new Error('旧请求失败'))
    await flushPromises()

    expect(rowsOf(wrapper)).toEqual(['current'])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('旧请求 finally 不会在当前请求完成前关闭 loading',async()=>{
    const first=deferred<QueryResult<Row>>({rows:[],total:0})
    const second=deferred<QueryResult<Row>>({rows:[],total:0})
    let call=0
    const wrapper=mountTable({dataSource:{query:()=>++call===1?first.promise:second.promise}})
    await flushPromises()
    await button(wrapper,'刷新').trigger('click')
    first.resolve({rows:[{id:'old'}],total:1})
    await flushPromises()
    const loadingWhileCurrentPending=loadingOf(wrapper)
    second.resolve({rows:[{id:'current'}],total:1})
    await flushPromises()

    expect(rowsOf(wrapper)).toEqual(['current'])
    expect(loadingWhileCurrentPending).toBe(true)
    expect(loadingOf(wrapper)).toBe(false)
  })

  it('当前请求失败保留已显示行，旧成功不能覆盖，并可刷新恢复',async()=>{
    const old=deferred<QueryResult<Row>>({rows:[],total:0})
    const current=deferred<QueryResult<Row>>({rows:[],total:0})
    let call=0
    const dataSource:DataSource<Row>={query(){
      call++
      if(call===1)return Promise.resolve({rows:[{id:'baseline'}],total:1})
      if(call===2)return old.promise
      if(call===3)return current.promise
      return Promise.resolve({rows:[{id:'recovered'}],total:1})
    }}
    const wrapper=mountTable({dataSource})
    await flushPromises()
    await button(wrapper,'刷新').trigger('click')
    await button(wrapper,'刷新').trigger('click')
    current.reject(new Error('当前请求失败'))
    await flushPromises()
    expect(rowsOf(wrapper)).toEqual(['baseline'])
    expect(wrapper.get('[role="alert"]').text()).toContain('当前请求失败')

    old.resolve({rows:[{id:'stale'}],total:1})
    await flushPromises()
    const rowsAfterStaleSuccess=rowsOf(wrapper)
    await click(wrapper,'刷新')

    expect(rowsAfterStaleSuccess).toEqual(['baseline'])
    expect(rowsOf(wrapper)).toEqual(['recovered'])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('组件卸载会中止当前 Provider 请求',async()=>{
    const request=deferred<QueryResult<Row>>({rows:[],total:0})
    let signal:AbortSignal|undefined
    const wrapper=mountTable({dataSource:{query:(query:Query)=>{
      signal=query.signal
      return request.promise
    }}})
    await flushPromises()
    wrappers.splice(wrappers.indexOf(wrapper),1)
    wrapper.unmount()

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal?.aborted).toBe(true)
  })

  it('运行时替换 dataSource 会立即查询新 Provider 且旧结果不能回写',async()=>{
    const old=deferred<QueryResult<Row>>({rows:[],total:0})
    let newCalls=0
    const wrapper=mountTable({dataSource:{query:()=>old.promise}})
    await flushPromises()
    const replacement:DataSource<Row>={query:async()=>{
      newCalls++
      return{rows:[{id:'new-source'}],total:1}
    }}

    await wrapper.setProps({dataSource:replacement})
    await flushPromises()
    old.resolve({rows:[{id:'old-source'}],total:1})
    await flushPromises()

    expect(newCalls).toBe(1)
    expect(rowsOf(wrapper)).toEqual(['new-source'])
  })

  it('Remote 切换为 Local 后旧远程结果不能回写',async()=>{
    const remote=deferred<QueryResult<Row>>({rows:[],total:0})
    const wrapper=mountTable({dataSource:{query:()=>remote.promise}})
    await flushPromises()

    await wrapper.setProps({dataSource:undefined,data:[{id:'local'}]})
    await flushPromises()
    expect(rowsOf(wrapper)).toEqual(['local'])
    remote.resolve({rows:[{id:'remote'}],total:1})
    await flushPromises()

    expect(rowsOf(wrapper)).toEqual(['local'])
  })

  it('queryChange 消费者不能污染 Provider 参数或输入 View 的 filters sorts 和 value 数组',async()=>{
    const inputFilters:FilterConfig[]=[{field:'status',operator:'in',value:['draft']}]
    const inputSorts:SortConfig[]=[{field:'id',order:'asc'}]
    const views:ViewConfig[]=[{id:'drafts',name:'草稿',filters:inputFilters,sorts:inputSorts}]
    const providerSeen:Array<Omit<Query,'signal'>>=[]
    const wrapper=mountTable({
      views,
      dataSource:{query:async(query:Query)=>{
        providerSeen.push({
          page:query.page,
          pageSize:query.pageSize,
          keyword:query.keyword,
          viewId:query.viewId,
          sorts:query.sorts.map(sort=>({...sort})),
          filters:query.filters.map(filter=>({...filter,value:Array.isArray(filter.value)?[...filter.value]:filter.value})),
        })
        return{rows:[],total:0}
      }},
      onQueryChange:(query:Query)=>{
        query.page=99
        if(query.sorts[0])query.sorts[0].order='desc'
        if(Array.isArray(query.filters[0]?.value))query.filters[0].value.push('contract')
      },
    })
    await flushPromises()

    await wrapper.get('select[aria-label="视图"]').setValue('drafts')
    await flushPromises()

    expect(providerSeen.at(-1)).toMatchObject({
      page:1,
      viewId:'drafts',
      sorts:[{field:'id',order:'asc'}],
      filters:[{field:'status',operator:'in',value:['draft']}],
    })
    expect(inputSorts).toEqual([{field:'id',order:'asc'}])
    expect(inputFilters).toEqual([{field:'status',operator:'in',value:['draft']}])
  })
})

describe('BusinessTable pagination correction',()=>{
  const localRows=(count:number)=>Array.from({length:count},(_,index)=>({id:`L${index+1}`}))

  it('Remote 自动纠正页码时保留原查询，不提交搜索框草稿',async()=>{
    const request=deferred<QueryResult<Row>>({rows:[],total:0})
    const calls:Query[]=[]
    const wrapper=mountTable({pagination:{page:3,pageSize:2,pageSizeOptions:[2]},dataSource:{query:(query:Query)=>{
      calls.push(query)
      return calls.length===1?request.promise:Promise.resolve({rows:[{id:'valid-page'}],total:2})
    }}})
    await flushPromises()
    await wrapper.get('input[placeholder="搜索当前数据"]').setValue('draft-not-submitted')
    request.resolve({rows:[],total:2})
    await flushPromises()

    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatchObject({page:1,keyword:''})
    expect(rowsOf(wrapper)).toEqual(['valid-page'])
  })

  it('Local 末页数据减少后回到最后有效页',async()=>{
    const wrapper=mountTable({data:localRows(5),pagination:{pageSize:2,pageSizeOptions:[2,3]}})
    await flushPromises()
    await click(wrapper,'下一页')
    await click(wrapper,'下一页')
    expect(wrapper.text()).toContain('第 3 / 3 页')

    await wrapper.setProps({data:localRows(3)})
    await flushPromises()

    expect(rowsOf(wrapper)).toEqual(['L3'])
    expect(wrapper.text()).toContain('第 2 / 2 页')
  })

  it('Local 数据变为空集后回到第 1 页',async()=>{
    const wrapper=mountTable({data:localRows(3),pagination:{pageSize:2,pageSizeOptions:[2,3]}})
    await flushPromises()
    await click(wrapper,'下一页')
    expect(wrapper.text()).toContain('第 2 / 2 页')

    await wrapper.setProps({data:[]})
    await flushPromises()

    expect(rowsOf(wrapper)).toEqual([])
    expect(wrapper.text()).toContain('第 1 / 1 页')
  })

  it('pageSize 变更会回到第 1 页并展示新首页',async()=>{
    const wrapper=mountTable({data:localRows(5),pagination:{pageSize:2,pageSizeOptions:[2,3]}})
    await flushPromises()
    await click(wrapper,'下一页')
    expect(rowsOf(wrapper)).toEqual(['L3','L4'])

    await wrapper.get('select[aria-label="每页条数"]').setValue('3')
    await flushPromises()

    expect(rowsOf(wrapper)).toEqual(['L1','L2','L3'])
    expect(wrapper.text()).toContain('第 1 / 2 页')
  })

  it('Remote total 缩小时补查最后有效页且只提交有效页结果',async()=>{
    const pages:number[]=[]
    let shrunk=false
    const dataSource:DataSource<Row>={query:async query=>{
      pages.push(query.page)
      if(query.page===3){
        shrunk=true
        return{rows:[],total:2}
      }
      if(shrunk)return{rows:[{id:'valid-after-shrink'}],total:2}
      return query.page===1
        ?{rows:[{id:'R1'},{id:'R2'}],total:5}
        :{rows:[{id:'R3'},{id:'R4'}],total:5}
    }}
    const wrapper=mountTable({dataSource,pagination:{pageSize:2,pageSizeOptions:[2]}})
    await flushPromises()
    await click(wrapper,'下一页')
    await click(wrapper,'下一页')

    expect(pages).toEqual([1,2,3,1])
    expect(rowsOf(wrapper)).toEqual(['valid-after-shrink'])
    expect(wrapper.text()).toContain('第 1 / 1 页')
  })
})

describe('BusinessTable page reset query count',()=>{
  function immediateSource(calls:Query[]):DataSource<Row>{
    return{query:async query=>{
      calls.push({
        ...query,
        sorts:query.sorts.map(sort=>({...sort})),
        filters:query.filters.map(filter=>({...filter})),
      })
      return{rows:[{id:`page-${query.page}`}],total:4}
    }}
  }

  async function onSecondPage(extra:Record<string,unknown>={}){
    const calls:Query[]=[]
    const wrapper=mountTable({dataSource:immediateSource(calls),pagination:{pageSize:2,pageSizeOptions:[2]},...extra})
    await flushPromises()
    await click(wrapper,'下一页')
    expect(wrapper.text()).toContain('第 2 / 2 页')
    calls.splice(0)
    return{wrapper,calls}
  }

  it('第 2 页搜索回首页只发送一次新 query',async()=>{
    const{wrapper,calls}=await onSecondPage()
    const search=wrapper.get('input[placeholder="搜索当前数据"]')
    await search.setValue('needle')
    await search.trigger('keyup',{key:'Enter'})
    await flushPromises()

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({page:1,keyword:'needle'})
  })

  it('第 2 页排序回首页只发送一次新 query',async()=>{
    const{wrapper,calls}=await onSecondPage()
    const sortButton=wrapper.findAll('button').find(node=>node.text().includes('编号'))
    if(!sortButton)throw new Error('找不到编号排序按钮')
    await sortButton.trigger('click')
    await flushPromises()

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({page:1,sorts:[{field:'id',order:'asc'}]})
  })

  it('第 2 页切换 View 回首页只发送一次新 query',async()=>{
    const views:ViewConfig[]=[{id:'drafts',name:'草稿',filters:[{field:'status',operator:'eq',value:'draft'}]}]
    const{wrapper,calls}=await onSecondPage({views})
    await wrapper.get('select[aria-label="视图"]').setValue('drafts')
    await flushPromises()

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({page:1,viewId:'drafts',filters:[{field:'status',operator:'eq',value:'draft'}]})
  })
})
