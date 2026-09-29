import {performance} from 'node:perf_hooks'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'

// Measures query work in the actual built runtime; excludes table DOM rendering.
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost'})
for(const key of ['window','document','Element','HTMLElement','SVGElement'])globalThis[key]=dom.window[key]
const {createApp,defineComponent,h}=await import('vue')
const {useTableRuntime}=await import('../dist/runtime.js')
let reads=0,table
const data=Array.from({length:10000},(_,id)=>({id,get name(){reads++;return `record ${id}`}}))
const app=createApp(defineComponent({setup(){table=useTableRuntime({columns:[{id:'name',field:'name',title:'Name'}],data,pagination:{pageSize:50}});return()=>h('div')}}))
app.mount('#app')
try{
  await table.reload()
  reads=0
  const queryStart=performance.now()
  await table.setQuery({keyword:'record'})
  const queryMs=performance.now()-queryStart,queryReads=reads
  reads=0
  const pagingStart=performance.now()
  for(let page=2;page<=101;page++)await table.goPage(page)
  const pagingMs=performance.now()-pagingStart
  assert.equal(table.total.value,10000)
  assert.equal(table.rows.value.length,50)
  assert.equal(reads,0,'Paging must reuse the filtered order')
  console.log('RUNTIME BENCHMARK OK:',JSON.stringify({rows:data.length,queryMs:Number(queryMs.toFixed(2)),queryReads,pages:100,pagingMs:Number(pagingMs.toFixed(2)),pagingFieldReads:reads,environment:'Node + JSDOM; excludes UI rendering'}))
}finally{app.unmount();dom.window.close()}
