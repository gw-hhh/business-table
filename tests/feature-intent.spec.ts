import {afterEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import FeatureHost from '../src/components/FeatureHost.vue'

const wrappers:VueWrapper[]=[]
afterEach(()=>wrappers.splice(0).forEach(wrapper=>wrapper.unmount()))
const component=defineComponent({props:{context:Object},render:()=>h('div',{'data-editor':true},'editor')})
it('preloads on intent without creating a context or opening UI, sharing the pending click',async()=>{
  let resolve!:(value:{default:typeof component})=>void
  const loader=vi.fn(()=>new Promise<{default:typeof component}>(done=>{resolve=done})),create=vi.fn(()=>({}))
  const wrapper=mount(FeatureHost,{props:{local:true,defaultStrategy:'on-interaction',entryLabel:'设置',loader,createContext:create}});wrappers.push(wrapper)
  expect(loader).not.toHaveBeenCalled()
  await wrapper.get('button').trigger('pointerenter');await flushPromises()
  expect(loader).toHaveBeenCalledTimes(1);expect(create).not.toHaveBeenCalled();expect(wrapper.find('[data-editor]').exists()).toBe(false)
  await wrapper.get('button').trigger('click');await wrapper.get('button').trigger('focus');await flushPromises()
  expect(loader).toHaveBeenCalledTimes(1)
  resolve({default:component});await flushPromises()
  expect(wrapper.find('[data-editor]').exists()).toBe(true);expect(create).toHaveBeenCalledTimes(1)
})
it('allows a real click to retry after speculative loading fails',async()=>{
  const loader=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({default:component})
  const wrapper=mount(FeatureHost,{props:{local:true,defaultStrategy:'on-interaction',entryLabel:'设置',loader,createContext:()=>({})}});wrappers.push(wrapper)
  await wrapper.get('button').trigger('pointerenter');await flushPromises()
  expect(loader).toHaveBeenCalledTimes(1);expect(wrapper.find('[role=alert]').exists()).toBe(false)
  await wrapper.get('button').trigger('click');await flushPromises()
  expect(loader).toHaveBeenCalledTimes(2);expect(wrapper.find('[data-editor]').exists()).toBe(true)
})
it('never imports default UI for custom mode or revoked access',async()=>{
  const loader=vi.fn(async()=>({default:component})),create=vi.fn(()=>({}))
  const wrapper=mount(FeatureHost,{props:{local:{enabled:true,mode:'custom'},defaultStrategy:'on-interaction',entryLabel:'设置',loader,createContext:create}});wrappers.push(wrapper)
  await wrapper.get('button').trigger('pointerenter');await wrapper.get('button').trigger('focus');await flushPromises()
  expect(loader).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled()
  await wrapper.setProps({local:false});expect(wrapper.find('button').exists()).toBe(false)
})
