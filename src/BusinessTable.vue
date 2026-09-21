<script setup lang="ts" generic="T extends RowData">
import{computed,onBeforeUnmount,onMounted,ref,toRaw,watch}from'vue'
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
let requestSequence=0
let activeController:AbortController|null=null
let ready=false
let disposed=false
function unwrapQueryValue(value:unknown,seen=new WeakMap<object,unknown>()):unknown{
  if(value===null||typeof value!=='object')return value
  const raw=toRaw(value)
  if(seen.has(raw))return seen.get(raw)
  if(raw instanceof Map){
    const result=new Map<unknown,unknown>()
    seen.set(raw,result)
    for(const [key,item] of raw)result.set(unwrapQueryValue(key,seen),unwrapQueryValue(item,seen))
    return result
  }
  if(raw instanceof Set){
    const result=new Set<unknown>()
    seen.set(raw,result)
    for(const item of raw)result.add(unwrapQueryValue(item,seen))
    return result
  }
  if(Array.isArray(raw)||Object.prototype.toString.call(raw)==='[object Object]'){
    const result=Array.isArray(raw)?new Array(raw.length):{}
    seen.set(raw,result)
    for(const [key,item] of Object.entries(raw)){
      Object.defineProperty(result,key,{value:unwrapQueryValue(item,seen),enumerable:true,writable:true,configurable:true})
    }
    return result
  }
  return raw
}
function copyQuery(source:Query):Query{
  return {...source,sorts:source.sorts.map(s=>({...s})),filters:source.filters.map(f=>({...f,value:structuredClone(unwrapQueryValue(f.value))}))}
}
function validPage(request:Query,count:number){return Math.max(1,Math.min(request.page,Math.ceil(count/request.pageSize)))}
async function load(snapshot?:Query){
  if(!ready||disposed)return
  const sequence=++requestSequence
  activeController?.abort()
  const controller=new AbortController()
  activeController=controller
  const isCurrent=()=>!disposed&&sequence===requestSequence&&!controller.signal.aborted
  busy.value=true
  error.value=''
  try{
    const request=copyQuery(snapshot??query.value)
    emit('queryChange',copyQuery(request))
    if(props.dataSource){
      const result=await props.dataSource.query({...copyQuery(request),signal:controller.signal})
      if(!isCurrent())return
      const correctedPage=validPage(request,result.total)
      if(correctedPage!==request.page){
        page.value=correctedPage
        void load({...request,page:correctedPage})
        return
      }
      rows.value=result.rows
      total.value=result.total
    }else{
      let result=[...(props.data??[])]
      if(request.keyword){
        const keyword=request.keyword.toLowerCase()
        result=result.filter(row=>resolvedColumns.value.some(column=>String(getValue(row,column.field)??'').toLowerCase().includes(keyword)))
      }
      result=applySorts(applyFilters(result,request.filters),request.sorts)
      total.value=result.length
      page.value=validPage(request,result.length)
      rows.value=result.slice((page.value-1)*request.pageSize,page.value*request.pageSize)
    }
  }catch(cause){
    if(isCurrent())error.value=cause instanceof Error?cause.message:String(cause)
  }finally{
    if(isCurrent()){
      busy.value=false
      activeController=null
    }
  }
}
function search(){page.value=1;void load()}
function goPage(next:number){page.value=Math.max(1,Math.min(next,pages.value));void load()}
function changePageSize(){page.value=1;void load()}
async function saveConfig(next:TableConfig){config.value=next;emit('configChange',next);if(props.persistence)await props.persistence.save(props.tableKey,next)}
async function toggleVisible(id:string,visible:boolean){await saveConfig(patchColumn(config.value,id,{visible}))}
async function togglePin(id:string,side:'left'|'right'){const current=config.value.columns[id]?.fixed;await saveConfig(patchColumn(config.value,id,{fixed:current===side?false:side}))}
async function changeWidth(id:string,width:number){await saveConfig(patchColumn(config.value,id,{width}))}
function sort(column:ColumnConfig){if(!column.sortable)return;const old=sorts.value.find(s=>s.field===column.field);sorts.value=old?[{field:column.field,order:old.order==='asc'?'desc':'asc'}]:[{field:column.field,order:'asc'}];page.value=1;void load()}
function applyView(view:ViewConfig){activeView.value=view.id;filters.value=view.filters??[];sorts.value=view.sorts??[];if(view.columns)config.value={...config.value,columns:{...config.value.columns,...view.columns}};page.value=1;emit('viewChange',view.id);void load()}
function runAction(a:Action<T>,row:T){moreRow.value=null;void a.handler?.(row)}
const inlineActions=computed(()=>props.actions.filter(a=>(a.position??'inline')==='inline').sort((a,b)=>(a.order??0)-(b.order??0)))
const moreActions=computed(()=>props.actions.filter(a=>a.position==='more').sort((a,b)=>(a.order??0)-(b.order??0)))
watch([()=>props.dataSource,()=>props.data],([source],[previousSource])=>{
  if(source!==previousSource)page.value=1
  if(source!==previousSource||!source)void load()
},{deep:true})
onMounted(async()=>{
  if(props.persistence){
    const stored=await props.persistence.load(props.tableKey)
    if(disposed)return
    if(stored)config.value=stored
  }
  ready=true
  void load()
})
onBeforeUnmount(()=>{disposed=true;requestSequence++;activeController?.abort()})
</script>
<template>
<section class="bt" data-business-table :aria-busy="Boolean(loading||busy)">
  <div v-if="error" class="bt__error" role="alert">{{error}}</div>
  <header class="bt__bar">
    <div><span class="bt__title">{{title}}</span><span class="bt__status"> · {{total}} 条</span></div>
    <div class="bt__tools">
      <input v-model="keyword" class="bt__search" placeholder="搜索当前数据" @keyup.enter="search">
      <button class="primary" @click="search">查询</button>
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
  <vxe-table :data="rows" :loading="loading||busy" border="inner" stripe>
    <template #loading><div v-if="loading||busy" class="bt__loading" role="status" aria-label="加载中">加载中…</div></template>
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
  <footer class="bt__footer"><span>共 {{total}} 条，第 {{page}} / {{pages}} 页</span><div class="bt__pages"><select v-model.number="pageSize" aria-label="每页条数" @change="changePageSize"><option v-for="n in pagination?.pageSizeOptions??[10,20,50,100]" :key="n" :value="n">{{n}} 条/页</option></select><button :disabled="page<=1" @click="goPage(page-1)">上一页</button><button :disabled="page>=pages" @click="goPage(page+1)">下一页</button></div></footer>
</section>
</template>
