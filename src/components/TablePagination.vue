<script setup lang="ts">
import {computed,ref,type Ref} from 'vue'
import type {Pagination} from '../types'
import TableIcon from './TableIcon.vue'
export interface PaginationContext {
  page:Readonly<Ref<number>>;pageSize:Readonly<Ref<number>>;total:Readonly<Ref<number>>
  pages:Readonly<Ref<number>>;allowedPageSizes:Readonly<Ref<number[]>>
  paginationEnabled:Readonly<Ref<boolean>>;paginationOptions:Readonly<Ref<Partial<Pagination>>>
  goPage:(page:number)=>void|Promise<void>;setPageSize:(size:number)=>void
}
const props=defineProps<{runtime:PaginationContext;full?:boolean}>()
const options=computed(()=>props.runtime.paginationOptions.value)
const full=computed(()=>options.value.variant?options.value.variant==='full':props.full===true)
const visible=computed(()=>props.runtime.paginationEnabled.value&&options.value.visible!==false&&(!options.value.hideOnSinglePage||props.runtime.pages.value>1))
const numbers=computed(()=>Array.from({length:Math.min(5,props.runtime.pages.value)},(_,index)=>Math.max(1,Math.min(props.runtime.page.value-2,props.runtime.pages.value-4))+index))
const jump=ref(1)
</script>
<template>
  <footer v-if="visible" class="bt__footer" :class="'bt__footer--'+(options.align??'right')">
    <slot v-if="options.showTotal!==false" name="summary" :total="runtime.total.value" :page="runtime.page.value" :page-size="runtime.pageSize.value"><span>共 {{runtime.total.value}} 条，第 {{runtime.page.value}} / {{runtime.pages.value}} 页</span></slot>
    <slot :context="runtime">
      <div class="bt__pages">
        <select v-if="options.showPageSize!==false" :value="runtime.pageSize.value" aria-label="每页条数" @change="runtime.setPageSize(Number(($event.target as HTMLSelectElement).value))"><option v-for="n in runtime.allowedPageSizes.value" :key="n" :value="n">{{n}} 条 / 页</option></select>
        <button :class="{'bt__page-arrow':full}" aria-label="上一页" :disabled="runtime.page.value<=1" @click="runtime.goPage(runtime.page.value-1)"><TableIcon v-if="full" name="chevron-left"/><template v-else>上一页</template></button>
        <template v-if="options.showPageNumbers??full"><button v-for="n in numbers" :key="n" :class="{'is-current':n===runtime.page.value}" :aria-current="n===runtime.page.value?'page':undefined" :aria-label="'第 '+n+' 页'" @click="runtime.goPage(n)">{{n}}</button></template>
        <button :class="{'bt__page-arrow':full}" aria-label="下一页" :disabled="runtime.page.value>=runtime.pages.value" @click="runtime.goPage(runtime.page.value+1)"><TableIcon v-if="full" name="chevron-right"/><template v-else>下一页</template></button>
        <label v-if="options.showJumper??full" class="bt__jump">前往 <input v-model.number="jump" type="number" min="1" :max="runtime.pages.value" aria-label="跳转页码" @keyup.enter="runtime.goPage(jump)"><button class="bt__link" @click="runtime.goPage(jump)">跳转</button></label>
      </div>
    </slot>
  </footer>
</template>
<style>
.bt__footer--left .bt__pages{margin-right:auto}.bt__footer--center .bt__pages{margin-left:auto;margin-right:auto}.bt__footer--right .bt__pages{margin-left:auto}
</style>
