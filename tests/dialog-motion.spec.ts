import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {defineComponent,h,ref} from 'vue'
import DialogFrame from '../src/ui/DialogFrame.vue'
import AnchoredPopup from '../src/ui/AnchoredPopup.vue'

const wrappers:VueWrapper[]=[]
const animations:{element:HTMLElement;finish:()=>void}[]=[]
const originalAnimate=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'animate')
let reduced=false
const changes=new Set<()=>void>()
beforeEach(()=>{
  reduced=false
  vi.stubGlobal('matchMedia',()=>({get matches(){return reduced},addEventListener(_type:string,listener:()=>void){changes.add(listener)},removeEventListener(_type:string,listener:()=>void){changes.delete(listener)}}))
  Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:function(this:HTMLElement){
    let finish=()=>{}
    const finished=new Promise<void>(resolve=>{finish=resolve})
    animations.push({element:this,finish})
    return {finished,cancel:finish}
  }})
})
afterEach(()=>{
  wrappers.splice(0).forEach(wrapper=>wrapper.unmount());animations.splice(0).forEach(animation=>animation.finish())
  if(originalAnimate)Object.defineProperty(HTMLElement.prototype,'animate',originalAnimate)
  else Reflect.deleteProperty(HTMLElement.prototype,'animate')
  document.body.replaceChildren();document.body.style.overflow='';changes.clear();vi.unstubAllGlobals()
})
async function settle(){animations.splice(0).forEach(animation=>animation.finish());await flushPromises()}
function trigger(){const button=document.createElement('button');document.body.append(button);button.focus();return button}
function setup(open=true){const wrapper=mount(DialogFrame,{attachTo:document.body,props:{title:'编辑内容',open},slots:{default:'<input autofocus aria-label="名称"/>'},global:{stubs:{transition:false}}});wrappers.push(wrapper);return wrapper}

it('keeps the overlay lock until a controlled close finishes, then restores focus',async()=>{
  const button=trigger(),wrapper=setup();await settle()
  await wrapper.setProps({open:false})
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.querySelector('.bt-dialog-overlay')?.hasAttribute('inert')).toBe(true)
  expect(document.activeElement).not.toBe(button)
  await settle()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.body.style.overflow).toBe('')
  expect(document.activeElement).toBe(button)
})

it('does not acquire focus or a body lock for an initially closed dialog',async()=>{
  const button=trigger(),wrapper=setup(false);await flushPromises()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(button)
  expect(document.body.style.overflow).toBe('')
  await wrapper.setProps({open:true});await settle()
  expect(document.activeElement?.getAttribute('aria-label')).toBe('名称')
  expect(document.body.style.overflow).toBe('hidden')
})

it('keeps nested locks and never restores focus into a closing parent',async()=>{
  const button=trigger(),parent=setup();await settle()
  const child=mount(DialogFrame,{attachTo:document.body,props:{title:'确认'},global:{stubs:{transition:false}}});wrappers.push(child);await settle()
  await parent.setProps({open:false});await settle()
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.activeElement?.closest('[aria-label="确认"]')).not.toBeNull()
  await child.setProps({open:false});await settle()
  expect(document.body.style.overflow).toBe('')
  expect(document.activeElement).toBe(button)
})

it('cancels a pending leave when reopened without releasing its lock',async()=>{
  const button=trigger(),wrapper=setup();await settle()
  await wrapper.setProps({open:false});await wrapper.setProps({open:true});await settle()
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.activeElement).not.toBe(button)
  await wrapper.setProps({open:false});await settle()
  expect(document.body.style.overflow).toBe('')
  expect(document.activeElement).toBe(button)
})

it('removes an externally unmounted dialog immediately and clears its active motion',async()=>{
  const opened=ref(true),button=trigger()
  const wrapper=mount(defineComponent({setup(){return()=>opened.value?h(DialogFrame,{title:'父级卸载'}):null}}),{attachTo:document.body,global:{stubs:{transition:false}}});wrappers.push(wrapper);await settle()
  opened.value=false;await flushPromises()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.body.style.overflow).toBe('')
  expect(document.activeElement).toBe(button)
})

it('also removes the already leaving vnode when its owner is unmounted mid-exit',async()=>{
  const button=trigger(),wrapper=setup();await settle()
  await wrapper.setProps({open:false})
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  wrapper.unmount();await flushPromises()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.body.style.overflow).toBe('')
  expect(document.activeElement).toBe(button)
  expect(changes.size).toBe(0)
})

it('closes immediately with reduced motion while preserving focus restoration',async()=>{
  reduced=true
  const button=trigger(),wrapper=setup();await flushPromises()
  await wrapper.setProps({open:false});await flushPromises()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(button)
  expect(animations).toHaveLength(0)
})

it('finishes an active leave when reduced motion becomes enabled',async()=>{
  const button=trigger(),wrapper=setup();await settle()
  await wrapper.setProps({open:false})
  reduced=true;changes.forEach(change=>change());await flushPromises()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.body.style.overflow).toBe('')
  expect(document.activeElement).toBe(button)
})

it('retains the last popup position during leave and blocks its exiting controls',async()=>{
  const button=trigger()
  const wrapper=mount(AnchoredPopup,{attachTo:document.body,props:{anchor:button,label:'浮层'},slots:{default:'<button role="menuitem">执行</button>'},global:{stubs:{transition:false}}});wrappers.push(wrapper)
  await flushPromises();await settle()
  const popup=document.querySelector<HTMLElement>('[aria-label="浮层"]')!
  const left=popup.style.left,top=popup.style.top
  await wrapper.setProps({open:false})
  expect(popup.isConnected).toBe(true)
  expect(popup.style.visibility).toBe('visible')
  expect([popup.style.left,popup.style.top]).toEqual([left,top])
  expect(popup.hasAttribute('inert')).toBe(true)
  await settle()
  expect(popup.isConnected).toBe(false)
})
