import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {defineComponent,h,ref} from 'vue'
import AnchoredPopup from '../src/ui/AnchoredPopup.vue'
import {useFloatingPosition} from '../src/ui/useFloatingPosition'
import {providePopupScope,registerPopup} from '../src/ui/popupScope'

const wrappers:VueWrapper[]=[]
const observers=new Set<{callback:ResizeObserverCallback;elements:Set<Element>}>()
let popupHeight=80
function rect(left:number,top:number,width:number,height:number):DOMRect{return {x:left,y:top,left,top,width,height,right:left+width,bottom:top+height,toJSON(){}}}
function anchor(left:number,top:number){const element=document.createElement('button');element.getBoundingClientRect=()=>rect(left,top,60,30);document.body.append(element);return element}
beforeEach(()=>{
  popupHeight=80
  vi.spyOn(document.documentElement,'clientWidth','get').mockReturnValue(400)
  vi.spyOn(document.documentElement,'clientHeight','get').mockReturnValue(300)
  vi.spyOn(HTMLElement.prototype,'offsetWidth','get').mockImplementation(function(this:HTMLElement){return this.classList.contains('bt-anchored-popup')?120:60})
  vi.spyOn(HTMLElement.prototype,'offsetHeight','get').mockImplementation(function(this:HTMLElement){return this.classList.contains('bt-anchored-popup')?popupHeight:30})
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.classList.contains('bt-anchored-popup')?rect(0,0,120,popupHeight):rect(0,0,400,300)})
  vi.stubGlobal('ResizeObserver',class {
    record:{callback:ResizeObserverCallback;elements:Set<Element>}
    constructor(callback:ResizeObserverCallback){this.record={callback,elements:new Set()};observers.add(this.record)}
    observe(element:Element){this.record.elements.add(element)}
    unobserve(element:Element){this.record.elements.delete(element)}
    disconnect(){this.record.elements.clear();observers.delete(this.record)}
  })
})
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount());document.body.replaceChildren();observers.clear();vi.restoreAllMocks();vi.unstubAllGlobals()})
function setup(element:HTMLElement){const wrapper=mount(AnchoredPopup,{attachTo:document.body,props:{anchor:element,label:'菜单',width:120},slots:{default:'<button role="menuitem">执行</button>'}});wrappers.push(wrapper);return wrapper}

it('repositions an open popup when its reactive anchor changes and focuses only its visible content',async()=>{
  const first=anchor(90,40),second=anchor(290,210)
  const wrapper=setup(first);await flushPromises()
  const popup=document.querySelector<HTMLElement>('[aria-label="菜单"]')!
  expect(popup.style.visibility).toBe('visible')
  expect(document.activeElement?.textContent).toBe('执行')
  await wrapper.setProps({anchor:second});await flushPromises()
  expect(parseFloat(popup.style.left)).toBe(230)
  expect(parseFloat(popup.style.top)).toBe(124)
})

it('recalculates placement when open content grows without a window resize',async()=>{
  setup(anchor(180,110));await flushPromises()
  const popup=document.querySelector<HTMLElement>('[aria-label="菜单"]')!
  expect(parseFloat(popup.style.top)).toBe(146)
  popupHeight=160
  for(const observer of [...observers])observer.callback([{target:popup,contentRect:popup.getBoundingClientRect(),borderBoxSize:[],contentBoxSize:[],devicePixelContentBoxSize:[]}],{} as ResizeObserver)
  await flushPromises()
  expect(parseFloat(popup.style.top)).toBeGreaterThanOrEqual(8)
  expect(parseFloat(popup.style.top)+popupHeight).toBeLessThanOrEqual(292)
})

it('releases mounted element observers when a popup unmounts and can position a fresh popup',async()=>{
  const first=setup(anchor(90,40));await flushPromises()
  expect([...observers].some(observer=>[...observer.elements].some(element=>element.classList.contains('bt-anchored-popup')))).toBe(true)
  first.unmount();wrappers.splice(wrappers.indexOf(first),1)
  expect(observers.size).toBe(0)
  setup(anchor(290,210));await flushPromises()
  expect(document.querySelector<HTMLElement>('[aria-label="菜单"]')!.style.visibility).toBe('visible')
})

it('hides and stops observing a still mounted popup without an anchor, then measures its replacement',async()=>{
  const wrapper=setup(anchor(90,40));await flushPromises()
  await wrapper.setProps({anchor:null});await flushPromises()
  const popup=document.querySelector<HTMLElement>('[aria-label="菜单"]')!
  expect(popup.style.visibility).toBe('hidden')
  expect(observers.size).toBe(0)
  await wrapper.setProps({anchor:anchor(290,210)});await flushPromises()
  expect(popup.style.visibility).toBe('visible')
  expect(parseFloat(popup.style.left)).toBe(230)
  expect(parseFloat(popup.style.top)).toBe(124)
})

it('repositions when a custom container shrinks without moving the anchor',async()=>{
  let boundaryHeight=240
  const boundary=document.createElement('section');document.body.append(boundary)
  boundary.getBoundingClientRect=()=>rect(40,20,320,boundaryHeight)
  Object.defineProperties(boundary,{clientWidth:{get:()=>320},clientHeight:{get:()=>boundaryHeight},offsetWidth:{get:()=>320},offsetHeight:{get:()=>boundaryHeight}})
  const element=anchor(90,40)
  const wrapper=mount(defineComponent({setup(){
    const popup=ref<HTMLElement>()
    const {styles}=useFloatingPosition({anchor:element,popup,boundary})
    return ()=>h('div',{ref:popup,class:'bt-anchored-popup',style:styles.value},'内容')
  }}),{attachTo:document.body})
  wrappers.push(wrapper);await flushPromises()
  const popup=wrapper.element as HTMLElement
  expect(parseFloat(popup.style.top)).toBe(76)
  boundaryHeight=120
  for(const observer of [...observers])if(observer.elements.has(boundary))observer.callback([{target:boundary,contentRect:boundary.getBoundingClientRect(),borderBoxSize:[],contentBoxSize:[],devicePixelContentBoxSize:[]}],{} as ResizeObserver)
  await flushPromises()
  expect(parseFloat(popup.style.top)+popupHeight).toBeLessThanOrEqual(132)
})

it('closes a popup when real geometry measurement rejects and releases its observers',async()=>{
  const element=anchor(90,40)
  element.getBoundingClientRect=()=>{throw new Error('测量入口失败')}
  const wrapper=setup(element);await flushPromises()
  expect(wrapper.emitted('close')).toEqual([[false]])
  expect(document.querySelector<HTMLElement>('[aria-label="菜单"]')!.style.visibility).toBe('hidden')
  expect(observers.size).toBe(0)
})

it('ignores a positioning rejection after the popup was already unmounted',async()=>{
  const element=anchor(90,40)
  element.getBoundingClientRect=()=>{throw new Error('已卸载入口的迟到测量')}
  const wrapper=setup(element)
  wrapper.unmount();wrappers.splice(wrappers.indexOf(wrapper),1)
  await flushPromises()
  expect(wrapper.emitted('close')).toBeUndefined()
  expect(document.querySelector('[aria-label="菜单"]')).toBeNull()
  expect(observers.size).toBe(0)
})

it('can follow external scrolling while retaining focus and using the latest anchor position',async()=>{
  const element=anchor(90,40),wrapper=setup(element)
  await wrapper.setProps({scrollStrategy:'follow'});await flushPromises()
  await new Promise(resolve=>requestAnimationFrame(resolve))
  element.getBoundingClientRect=()=>rect(120,70,60,30)
  window.dispatchEvent(new Event('scroll'));await flushPromises()
  expect(wrapper.emitted('close')).toBeUndefined()
  const popup=document.querySelector<HTMLElement>('[aria-label="菜单"]')!
  expect(parseFloat(popup.style.left)).toBe(60)
  expect(parseFloat(popup.style.top)).toBe(106)
  expect(document.activeElement?.textContent).toBe('执行')
})

it('uses the shared close strategy only for external scroll and releases it when closed',async()=>{
  const opened=ref(true),dismissed=vi.fn(),element=anchor(90,40)
  const child=defineComponent({setup(){const popup=ref<HTMLElement>();registerPopup(popup);return()=>h('div',{ref:popup,id:'nested-popup'},'子浮层')}})
  const wrapper=mount(defineComponent({setup(){
    const popup=ref<HTMLElement>(),children=providePopupScope()
    useFloatingPosition({anchor:element,popup,open:opened,scrollStrategy:'close',contains:node=>children.contains(node),onDismiss:dismissed})
    return()=>h('div',[h('div',{ref:popup,id:'scroll-popup'},'滚动内容'),h(child)])
  }}),{attachTo:document.body});wrappers.push(wrapper);await flushPromises()
  document.querySelector('#scroll-popup')!.dispatchEvent(new Event('scroll'))
  document.querySelector('#nested-popup')!.dispatchEvent(new Event('scroll'))
  expect(dismissed).not.toHaveBeenCalled()
  document.dispatchEvent(new Event('scroll'))
  expect(dismissed).toHaveBeenCalledTimes(1)
  opened.value=false;await flushPromises()
  document.dispatchEvent(new Event('scroll'))
  expect(dismissed).toHaveBeenCalledTimes(1)
})

it('dismisses a follow popup whose anchor is removed before the next scroll',async()=>{
  const element=anchor(90,40),wrapper=setup(element)
  await wrapper.setProps({scrollStrategy:'follow'});await flushPromises()
  element.remove();window.dispatchEvent(new Event('scroll'));await flushPromises()
  expect(wrapper.emitted('close')).toEqual([[false]])
  expect(observers.size).toBe(0)
})
