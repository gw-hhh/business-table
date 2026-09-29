import {expect,it,vi} from 'vitest'
import {mount} from '@vue/test-utils'
import {ref} from 'vue'
import TablePagination from '../src/components/TablePagination.vue'
import type {Pagination} from '../src/types'

function context(options:Partial<Pagination>={}){
  return {page:ref(1),pageSize:ref(10),total:ref(31),pages:ref(4),allowedPageSizes:ref([10,20]),paginationEnabled:ref(true),paginationOptions:ref(options),goPage:vi.fn(),setPageSize:vi.fn()}
}
it('reacts to paging and individual display options without hiding the table state',async()=>{
  const runtime=context({variant:'full',align:'left'})
  const wrapper=mount(TablePagination,{props:{runtime}})
  expect(wrapper.classes()).toContain('bt__footer--left')
  await wrapper.get('[aria-label="第 3 页"]').trigger('click')
  expect(runtime.goPage).toHaveBeenCalledWith(3)
  await wrapper.get('select').setValue('20')
  expect(runtime.setPageSize).toHaveBeenCalledWith(20)
  runtime.paginationOptions.value={showTotal:false,showPageSize:false,showPageNumbers:false,showJumper:false}
  await wrapper.vm.$nextTick()
  expect(wrapper.find('select').exists()).toBe(false)
  expect(wrapper.find('[aria-label="跳转页码"]').exists()).toBe(false)
  expect(wrapper.findAll('button')).toHaveLength(2)
  runtime.paginationOptions.value={visible:false}
  await wrapper.vm.$nextTick()
  expect(wrapper.find('footer').exists()).toBe(false)
  expect(runtime.total.value).toBe(31)
  wrapper.unmount()
})
it('respects single-page hiding and exposes shared commands to replacement controls',async()=>{
  const runtime=context({hideOnSinglePage:true})
  const wrapper=mount(TablePagination,{props:{runtime},slots:{default:'<button @click="params.context.goPage(4)">最后一页</button>'}})
  await wrapper.get('button').trigger('click')
  expect(runtime.goPage).toHaveBeenCalledWith(4)
  runtime.pages.value=1
  await wrapper.vm.$nextTick()
  expect(wrapper.find('footer').exists()).toBe(false)
  runtime.pages.value=4;runtime.paginationEnabled.value=false
  await wrapper.vm.$nextTick()
  expect(wrapper.find('footer').exists()).toBe(false)
  wrapper.unmount()
})
