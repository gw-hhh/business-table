<script setup lang="ts">
import {useTableRuntime} from '@company/business-table/runtime'
import {BusinessTableGrid,SearchRegion,SearchToggle,TablePagination,QuerySummary,TableTools} from '@company/business-table/components'
const props=withDefaults(defineProps<{instanceKey?:string}>(),{instanceKey:'assets.composed'})
const rows=Array.from({length:31},(_,index)=>({id:index+1,name:`设备 ${index+1}`,status:index%2===0?1:2}))
const table=useTableRuntime({
  get tableKey(){return props.instanceKey},rowKey:'id',data:rows,
  columns:[{id:'name',field:'name',title:'设备名称',sortable:true},{id:'status',field:'status',title:'状态',valueMap:[{value:1,label:'启用'},{value:2,label:'停用'}]}],
  pagination:{pageSize:10,pageSizeOptions:[10,20,50],variant:'full',showJumper:true},
  searchDefinition:{items:[{id:'name',label:'设备',kind:'text',field:'name',operator:'contains'}]},
  searchPanel:{defaultVisible:true},
})
const search=table.searchContext()
const tools=[{id:'refresh',label:'刷新',icon:'refresh',handler:()=>table.reload()}]
</script>
<template>
  <article class="composed-example" :data-composed-table="instanceKey">
    <header><h2>设备列表</h2><SearchToggle :panel="table.searchPanel"/><TableTools :tools="tools"/></header>
    <SearchRegion :panel="table.searchPanel" :context="search">
      <form class="composed-search" @submit.prevent="search.submit()">
        <label>设备名称 <input aria-label="设备名称" :value="search.getValue('name')??''" @input="search.setValue('name',($event.target as HTMLInputElement).value)"></label>
        <button type="submit">查询</button><button type="button" @click="search.reset()">重置</button>
      </form>
    </SearchRegion>
    <QuerySummary :context="search"/>
    <BusinessTableGrid :runtime="table" title="设备列表"/>
    <TablePagination :runtime="table"/>
  </article>
</template>
<style scoped>
.composed-example{background:#fff;border:1px solid #dde5ef;border-radius:8px;padding:16px;min-width:0}.composed-example>header{display:flex;align-items:center;gap:12px}.composed-example h2{font-size:16px;margin-right:auto}.composed-search{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 0}.composed-example input,.composed-example button{font:inherit;min-height:32px;border:1px solid #d9e2ef;border-radius:4px;background:white;padding:4px 8px}.composed-search input{max-width:180px}.composed-example:deep(.bt-search-toggle){display:flex;align-items:center;gap:5px}.composed-example:deep(.bt__footer){gap:8px;flex-wrap:wrap}
</style>
