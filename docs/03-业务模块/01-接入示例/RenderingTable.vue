<script setup lang="ts">
import {useTableRuntime,type TableRenderingOptions} from '@company/business-table/runtime'
import {BusinessTableGrid,TablePagination} from '@company/business-table/components'
const table=useTableRuntime({
  tableKey:'rendering.example',rowKey:'id',
  data:Array.from({length:10000},(_,index)=>({id:index+1,name:`设备 ${index+1}`})),
  columns:[{id:'name',field:'name',title:'设备名称',width:240}],
  pagination:{enabled:false},
})
const rendering:TableRenderingOptions={maxHeight:520,virtualRows:{threshold:100,overscan:5}}
</script>
<template>
  <BusinessTableGrid :runtime="table" :rendering="rendering" title="设备列表">
    <template #empty="state">
      <div class="rendering-empty">
        <p>{{state.reason==='error'?'加载失败':state.reason==='no-results'?'没有符合条件的数据':state.reason==='loading'?'加载中…':'暂无数据'}}</p>
        <button v-if="state.reason==='error'" @click="state.reload()">重试</button>
        <button v-if="state.reason==='no-results'" @click="state.clearQuery()">清除查询</button>
      </div>
    </template>
  </BusinessTableGrid>
  <TablePagination :runtime="table"/>
</template>
<style scoped>.rendering-empty{padding:24px;text-align:center}</style>
