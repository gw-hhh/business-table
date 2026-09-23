import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ViewsPanel from '../src/features/views/ViewsPanel.vue'
import { createViewsRuntime } from '../src/features/views/runtime'
afterEach(()=>vi.restoreAllMocks())
it('bounds the popup by the viewport content width when a document scrollbar is present',async()=>{
  vi.spyOn(document.documentElement,'clientWidth','get').mockReturnValue(305)
  vi.spyOn(window,'innerWidth','get').mockReturnValue(320)
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.classList.contains('bt-views-popup')?{width:304,height:280,x:0,y:0,left:0,top:0,right:304,bottom:280,toJSON(){}}:{width:106,height:32,x:128,y:300,left:128,top:300,right:234,bottom:332,toJSON(){}}})
  const runtime=createViewsRuntime({tableKey:'a',initial:[{id:'all',name:'全部',isSystem:true}],apply:async()=>{}})
  const wrapper=mount(ViewsPanel,{props:{runtime,snapshot:()=>({})}})
  await wrapper.get('[aria-label="保存与切换视图"]').trigger('click');await flushPromises()
  const popup=wrapper.get('.bt-views-popup').element as HTMLElement
  expect(popup.style.maxWidth).toBe('289px')
  expect(Number.parseFloat(popup.style.left)+Number.parseFloat(popup.style.maxWidth)).toBeLessThanOrEqual(305)
  wrapper.unmount()
})
