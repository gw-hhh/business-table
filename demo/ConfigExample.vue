<script setup lang="ts">
import {ref} from 'vue'
import {BusinessTable,ConfiguredBusinessTable,createRegistry,type ConfigDiagnostic,type TableDefinition,type PreferenceV3} from '../src'
type Item={id:string;name:string;status:string}
const mode=new URLSearchParams(location.search).get('mode')??'default'
const rows:Item[]=[{id:'A-001',name:'传感器',status:'已确认'},{id:'A-002',name:'转换器',status:'草稿'}]
const message=ref(''),diagnostics=ref<ConfigDiagnostic[]>([]),detailsReads=ref(0),delta=ref<PreferenceV3>()
let settingsReadCount=0
const table=ref<{activateFeature:(name:'columnSettings')=>Promise<unknown>}>()
const headlessContext=ref<{columns:{id:string;title:string;width?:number}[];patch:(id:string,patch:{width:number})=>Promise<void>}>()
const registry=createRegistry<Item>({onDiagnostic:diagnostic=>diagnostics.value.push(diagnostic)})
registry.register('rowAction','view',{id:'view',label:'查看',handler:row=>{message.value='查看 '+row.id}})
registry.register('rowAction','delete',{id:'delete',label:'删除',position:'more',disabled:row=>row.status==='已确认',handler:row=>{message.value='删除 '+row.id}})
const definition:TableDefinition={
  schemaVersion:3,tableKey:'configuration.example',title:'物料列表',
  columns:[
    {id:'id',field:'id',title:'编号',width:180,minWidth:100,fixed:'left',configurable:{width:{enabled:true,min:120,max:260}}},
    {id:'name',field:'name',title:'名称',width:220,configurable:{visible:true,rename:true,width:true,order:true,fixed:true,align:true}},
    {id:'status',field:'status',title:'状态',width:140,valueMap:[{value:'已确认',label:'已确认',color:'#067647',background:'#ecfdf3'},{value:'草稿',label:'草稿',color:'#475467',background:'#f2f4f7'}],configurable:{visible:true,width:true}},
  ],
  features:{
    search:true,toolbar:true,
    columnSettings:{enabled:true,mode:mode==='custom'?'custom':mode==='headless'?'headless':'default',get details(){detailsReads.value=++settingsReadCount;return {label:'列设置'}}},
    rowActions:{enabled:true,details:{allowedItems:['view','delete']}},
  },
}
const remoteOverride=mode==='off'?{features:{columnSettings:{enabled:false}}}:undefined
const preference=ref<unknown>(null)
function recordPreference(next:PreferenceV3){delta.value=next}
async function activateHeadless(){headlessContext.value=await table.value?.activateFeature('columnSettings') as typeof headlessContext.value}
</script>
<template>
  <main class="config-demo">
    <nav><a href="/">报价 Demo</a><a href="/?example=config">默认设置</a><a href="/?example=config&mode=core">最简表格</a><a href="/?example=config&mode=custom">自定义设置</a><a href="/?example=config&mode=headless">无默认界面</a><a href="/?example=config&mode=off">后台关闭设置</a></nav>
    <h1>配置与列权限示例</h1>
    <p>编号保持显示并冻结在左侧，允许调整宽度。其余列按各自的配置开放。</p>
    <BusinessTable v-if="mode==='core'" :columns="definition.columns" :data="rows"/>
    <ConfiguredBusinessTable v-else ref="table" :definition="definition" :registry="registry" :data="rows" :preference="preference" :remote-override="remoteOverride" @diagnostic="diagnostics.push($event)" @preference-change="recordPreference">
      <template #column-settings="{context}">
        <aside class="bt__panel" data-testid="custom-settings">
          <h3>自定义字段设置</h3>
          <p>复用表格的列权限和偏好修改入口。</p>
          <button @click="context.patch('id',{visible:false,fixed:false,width:240})">调整编号列宽</button>
          <button @click="context.close()">关闭</button>
        </aside>
      </template>
    </ConfiguredBusinessTable>
    <div class="demo-controls">
      <button @click="preference='{invalid-json'">模拟损坏的偏好</button>
      <button v-if="mode==='headless'" @click="activateHeadless">读取列设置状态</button>
      <button v-if="headlessContext" @click="headlessContext.patch('id',{width:240})">调整编号列宽</button>
      <span data-testid="details-count">设置详情读取次数：{{detailsReads}}</span>
      <span v-if="message" role="status">{{message}}</span>
    </div>
    <p v-if="diagnostics.length" data-testid="config-diagnostic">已忽略无效配置，表格继续可用。诊断记录：{{diagnostics.length}}</p>
    <pre v-if="delta" data-testid="preference-delta">{{JSON.stringify(delta,null,2)}}</pre>
  </main>
</template>
<style>
html,body,#app{margin:0;min-height:100%;background:#f3f5f8}
.config-demo{padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#344054}
.config-demo h1{font-size:22px;margin-bottom:8px}.config-demo nav,.demo-controls{display:flex;gap:16px;flex-wrap:wrap;align-items:center}
.config-demo nav a{color:#2468e8}.config-demo p{color:#667085}.demo-controls{margin-top:20px}.demo-controls button{padding:6px 12px}
.config-demo pre{background:white;padding:16px;border-radius:8px;overflow:auto;font-size:13px}
</style>
