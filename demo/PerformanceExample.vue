<script setup lang="ts">
import {computed,ref} from 'vue'
import {useTableRuntime} from '../src/runtime/useTableRuntime'
import BusinessTableGrid from '../src/components/BusinessTableGrid.vue'
import TablePagination from '../src/components/TablePagination.vue'
import type {TableRenderingOptions} from '../src/types'

const parameters=new URLSearchParams(location.search)
const count=ref(parameters.get('count')==='1000'?1000:10000)
const virtual=ref(parameters.get('virtual')!=='false'),paged=ref(parameters.get('paged')==='true'),fail=ref(false)
const failureSource={query:async()=>{throw new Error('性能示例：模拟读取失败')},readAll:async()=>{throw new Error('性能示例：模拟读取失败')}}
const records=computed(()=>Array.from({length:count.value},(_,i)=>({id:i+1,name:`设备 ${i+1}`,status:i%2===0?1:2,area:`区域 ${i%8+1}`,owner:`负责人 ${i%12+1}`,amount:1000+i,note:i%7===0?'多行说明：保留完整内容与自动行高，用于验证虚拟滚动时的测量与固定列对齐。'.repeat(3):'常规设备',updated:'2026-09-29'})))
const table=useTableRuntime({
  tableKey:'performance.example',rowKey:'id',selection:true,
  get data(){return records.value},
  get dataSource(){return fail.value?failureSource:undefined},
  get pagination(){return {enabled:paged.value,pageSize:100,pageSizeOptions:[100,500,1000]}},
  columns:[
    {id:'name',field:'name',title:'设备名称',width:150,fixed:'left',sortable:true},
    {id:'status',field:'status',title:'状态',width:100,valueMap:[{value:1,label:'启用'},{value:2,label:'停用'}]},
    {id:'area',field:'area',title:'区域',width:110},
    {id:'owner',field:'owner',title:'负责人',width:130},
    {id:'amount',field:'amount',title:'金额',width:130,type:'number'},
    {id:'note',field:'note',title:'说明',width:250,content:{wrap:'wrap'}},
    {id:'updated',field:'updated',title:'更新日期',width:130},
  ],
})
const rendering=computed<TableRenderingOptions>(()=>({height:520,virtualRows:{enabled:virtual.value,threshold:100,overscan:5}}))
async function unmatched(){await table.setQuery({keyword:'不存在的设备'})}
async function recover(){fail.value=false;await table.clearQuery()}
async function failure(){await unmatched();fail.value=true}
</script>
<template>
  <main class="performance-demo">
    <h1>表格渲染性能示例</h1>
    <p>切换相同数据的渲染方式；多行内容、固定列和选择状态保持不变。无分页将查询结果全部交给渲染层，虚拟滚动仅限制 DOM。</p>
    <div class="performance-controls">
      <label>数据量 <select v-model.number="count" aria-label="数据量"><option :value="1000">1,000 行</option><option :value="10000">10,000 行</option></select></label>
      <label><input v-model="virtual" type="checkbox">启用虚拟滚动</label>
      <label><input v-model="paged" type="checkbox">启用分页</label>
      <button @click="unmatched">查询无匹配</button><button @click="table.clearQuery()">清除查询</button><button @click="failure">模拟失败</button>
    </div>
    <p role="status" data-performance-state>{{count}} 行数据 · 当前结果 {{table.total.value}} 行 · {{virtual?'虚拟滚动':'完整渲染'}} · {{paged?'分页':'无分页'}}</p>
    <BusinessTableGrid :runtime="table" title="性能示例" :rendering="rendering">
      <template #empty="state"><div class="performance-empty" :data-empty-reason="state.reason"><p>{{state.reason==='error'?'示例读取失败':state.reason==='no-results'?'没有符合当前条件的数据':'暂无数据'}}</p><button v-if="state.reason==='no-results'" @click="state.clearQuery()">清除查询条件</button><button v-if="state.reason==='error'" @click="recover">重试读取</button></div></template>
    </BusinessTableGrid>
    <TablePagination :runtime="table"/>
  </main>
</template>
<style>.performance-demo{max-width:1180px;margin:24px auto;padding:0 16px;font:14px/1.6 system-ui;color:#334155}.performance-demo h1{font-size:22px}.performance-controls{display:flex;align-items:center;flex-wrap:wrap;gap:16px}.performance-controls button,.performance-controls select,.performance-empty button{font:inherit;min-height:32px;border:1px solid #d9e1ee;border-radius:5px;background:white;padding:4px 10px}.performance-empty{padding:32px;text-align:center}.performance-demo>p{color:#64748b}</style>
