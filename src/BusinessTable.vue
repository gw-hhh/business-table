<script setup lang="ts" generic="T extends RowData">
import{computed,onMounted,ref,watch}from'vue'
import type{Action,ColumnConfig,DataSource,FilterConfig,Pagination,Persistence,Query,RowData,SortConfig,TableConfig,ViewConfig}from'./types'
import{applyFilters,applySorts,displayValue,getValue,makeConfig,mapStyle,mergeColumns,patchColumn}from'./core'
const props=withDefaults(defineProps<{tableKey:string;rowKey:string;title?:string;data?:T[];dataSource?:DataSource<T>;columns:ColumnConfig<T>[];pagination?:Partial<Pagination>;config?:TableConfig|null;views?:ViewConfig[];actions?:Action<T>[];persistence?:Persistence|null;loading?:boolean}>(),{title:'数据列表',data:()=>[],views:()=>[],actions:()=>[],persistence:null,config:null})
const emit=defineEmits<{queryChange:[Query];configChange:[TableConfig];viewChange:[string|null]}>()
const rows=ref<T[]>([]),total=ref(0),page=ref(props.pagination?.page??1),pageSize=ref(props.pagination?.pageSize??20),keyword=ref(''),sorts=ref<SortConfig[]>([]),filters=ref<FilterConfig[]>([]),activeView=ref<string|null>(null),settingsOpen=ref(false),busy=ref(false),error=ref(''),moreRow=ref<string|null>(null)
const config=ref<TableConfig>(props.config??makeConfig(props.tableKey,props.columns))
const resolvedColumns=computed(()=>mergeColumns(props.columns,config.value).filter(c=>c.visible!==false))
const query=computed<Query>(()=>({page:page.value,pageSize:pageSize.value,sorts:sorts.value,filters:filters.value,keyword:keyword.value,viewId:activeView.value}))
const pages=computed(()=>Math.max(1,Math.ceil(total.value/pageSize.value)))
function rowId(row:T){return String(getValue(row,props.rowKey)??'')}
async function load(){busy.value=true;error.value='';try{emit('queryChange',query.value);if(props.dataSource){const r=await props.dataSource.query(query.value);rows.value=r.rows;total.value=r.total}else{let r=[...(props.data??[])];if(keyword.value){const k=keyword.value.toLowerCase();r=r.filter(x=>resolvedColumns.value.some(c=>String(getValue(x,c.field)??'').toLowerCase().includes(k)))}r=applyFilters(r,filters.value);r=applySorts(r,sorts.value);total.value=r.length;rows.value=r.slice((page.value-1)*pageSize.value,page.value*pageSize.value)}}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
async function saveConfig(next:TableConfig){config.value=next;emit('configChange',next);if(props.persistence)await props.persistence.save(props.tableKey,next)}
async function toggleVisible(id:string,visible:boolean){await saveConfig(patchColumn(config.value,id,{visible}))}
async function togglePin(id:string,side:'left'|'right'){const current=config.value.columns[id]?.fixed;await saveConfig(patchColumn(config.value,id,{fixed:current===side?false:side}))}
async function changeWidth(id:string,width:number){await saveConfig(patchColumn(config.value,id,{width}))}
function sort(column:ColumnConfig){if(!column.sortable)return;const old=sorts.value.find(s=>s.field===column.field);sorts.value=old?[{field:column.field,order:old.order==='asc'?'desc':'asc'}]:[{field:column.field,order:'asc'}];page.value=1;void load()}
function applyView(view:ViewConfig){activeView.value=view.id;filters.value=view.filters??[];sorts.value=view.sorts??[];if(view.columns)config.value={...config.value,columns:{...config.value.columns,...view.columns}};page.value=1;emit('viewChange',view.id);void load()}
function runAction(a:Action<T>,row:T){moreRow.value=null;void a.handler?.(row)}
const inlineActions=computed(()=>props.actions.filter(a=>(a.position??'inline')==='inline').sort((a,b)=>(a.order??0)-(b.order??0)))
const moreActions=computed(()=>props.actions.filter(a=>a.position==='more').sort((a,b)=>(a.order??0)-(b.order??0)))
watch(()=>props.data,()=>{if(!props.dataSource)void load()},{deep:true});watch([page,pageSize],()=>void load())
onMounted(async()=>{if(props.persistence){const stored=await props.persistence.load(props.tableKey);if(stored)config.value=stored}void load()})
</script>
<template>
<section class="bt" data-business-table>
  <div v-if="error" class="bt__error" role="alert">{{error}}</div>
  <header class="bt__bar">
    <div><span class="bt__title">{{title}}</span><span class="bt__status"> · {{total}} 条</span></div>
    <div class="bt__tools">
      <input v-model="keyword" class="bt__search" placeholder="搜索当前数据" @keyup.enter="page=1;load()">
      <button class="primary" @click="page=1;load()">查询</button>
      <div v-if="views.length">
        <select :value="activeView??''" aria-label="视图" @change="e=>{const v=views.find(x=>x.id===(e.target as HTMLSelectElement).value);if(v)applyView(v)}"><option value="">视图</option><option v-for="v in views" :key="v.id" :value="v.id">{{v.name}}</option></select>
      </div>
      <button data-testid="column-settings" @click="settingsOpen=!settingsOpen">列设置</button>
      <button @click="load()">刷新</button>
    </div>
    <aside v-if="settingsOpen" class="bt__panel" data-testid="column-panel">
      <h3>列设置</h3>
      <div v-for="c in mergeColumns(columns,config)" :key="c.id" class="bt__col">
        <input type="checkbox" :checked="c.visible!==false" :aria-label="`显示${c.title}`" @change="e=>toggleVisible(c.id,(e.target as HTMLInputElement).checked)">
        <span>{{c.title}}</span>
        <div class="bt__pins"><button :class="{on:config.columns[c.id]?.fixed==='left'}" :title="`左冻结 ${c.title}`" @click="togglePin(c.id,'left')">◧</button><button :class="{on:config.columns[c.id]?.fixed==='right'}" :title="`右冻结 ${c.title}`" @click="togglePin(c.id,'right')">◨</button></div>
        <input type="range" min="80" max="500" :value="config.columns[c.id]?.width??c.width??160" :aria-label="`${c.title}列宽`" @change="e=>changeWidth(c.id,Number((e.target as HTMLInputElement).value))">
      </div>
    </aside>
  </header>
  <vxe-table :data="rows" :loading="loading||busy" :height="'auto'" border="inner" show-overflow stripe>
    <vxe-column v-for="c in resolvedColumns" :key="c.id" :field="c.field" :title="c.title" :width="c.width" :min-width="c.minWidth??120" :fixed="c.fixed||undefined" :align="c.align??'left'" :sortable="false">
      <template #header><button v-if="c.sortable" style="border:0;background:transparent;padding:0;font-weight:600" @click="sort(c)">{{c.title}} <span v-if="sorts[0]?.field===c.field">{{sorts[0]?.order==='asc'?'↑':'↓'}}</span></button><span v-else>{{c.title}}</span></template>
      <template #default="{row}"><span v-if="c.valueMap" class="bt-tag" :style="{color:mapStyle(getValue(row,c.field),c.valueMap)?.color,background:mapStyle(getValue(row,c.field),c.valueMap)?.background}">{{displayValue(getValue(row,c.field),c)}}</span><span v-else>{{displayValue(getValue(row,c.field),c)}}</span></template>
    </vxe-column>
    <vxe-column v-if="actions.length" title="操作" width="190" fixed="right">
      <template #default="{row}">
        <div class="bt__actions"><button v-for="a in inlineActions" :key="a.id" :class="{danger:a.danger}" @click="runAction(a,row)">{{a.label}}</button>
          <div v-if="moreActions.length" class="bt__more"><button @click="moreRow=moreRow===rowId(row)?null:rowId(row)">更多</button><div v-if="moreRow===rowId(row)" class="bt__menu"><button v-for="a in moreActions" :key="a.id" :class="{danger:a.danger}" @click="runAction(a,row)">{{a.label}}</button></div></div>
        </div>
      </template>
    </vxe-column>
    <template #empty><div class="bt__empty">暂无数据</div></template>
  </vxe-table>
  <footer class="bt__footer"><span>共 {{total}} 条，第 {{page}} / {{pages}} 页</span><div class="bt__pages"><select v-model.number="pageSize" aria-label="每页条数"><option v-for="n in pagination?.pageSizeOptions??[10,20,50,100]" :key="n" :value="n">{{n}} 条/页</option></select><button :disabled="page<=1" @click="page--">上一页</button><button :disabled="page>=pages" @click="page++">下一页</button></div></footer>
</section>
</template>
