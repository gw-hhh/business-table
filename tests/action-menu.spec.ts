import {afterEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {reactive} from 'vue'
import RowActions from '../src/components/RowActions.vue'
import type {Action,RowData} from '../src/types'
const wrappers:VueWrapper[]=[]
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount());document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals()})
function create(actions:Action<RowData>[]){
  const wrapper=mount(RowActions,{attachTo:document.body,props:{context:{actions,rowId:row=>String(row.id),reportError:vi.fn()}},global:{stubs:{'vxe-column':{template:'<div><slot :row="{id:\'A\'}"/></div>'}}}}) as VueWrapper
  wrappers.push(wrapper);return wrapper
}
describe('row action floating menu',()=>{
  it('opens an unclipped menu and returns keyboard focus to its trigger on Escape',async()=>{
    const wrapper=create([{id:'copy',label:'复制为草稿',position:'more',handler:()=>{}}])
    const trigger=wrapper.get('button')
    ;(trigger.element as HTMLElement).focus()
    trigger.element.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}))
    await flushPromises()
    const menu=document.querySelector<HTMLElement>('[role="menu"]')
    expect(menu).not.toBeNull()
    expect(menu?.parentElement).toBe(document.body)
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
    await flushPromises()
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
  })
  it('opens an export submenu and executes the chosen leaf with its row',async()=>{
    let exported=''
    const wrapper=create([{id:'export',label:'导出本条',position:'more',children:[{id:'csv',label:'CSV',handler:row=>{exported=String(row.id)}}]}])
    await wrapper.get('button').trigger('click');await flushPromises()
    const parent=document.querySelector<HTMLElement>('[role="menuitem"]')
    expect(parent?.getAttribute('aria-haspopup')).toBe('menu')
    parent!.click();await flushPromises()
    const leaf=Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(node=>node.textContent?.includes('CSV'))!
    leaf.click();await flushPromises()
    expect(exported).toBe('A')
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })
  it('closes on outside pointer interaction without running a disabled action',async()=>{
    let calls=0
    const wrapper=create([{id:'delete',label:'删除',position:'more',disabled:true,handler:()=>{calls++}}])
    await wrapper.get('button').trigger('click');await flushPromises()
    const item=document.querySelector<HTMLButtonElement>('[role="menuitem"]')
    expect(item?.disabled).toBe(true)
    item!.click();expect(calls).toBe(0)
    document.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));await flushPromises()
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })
  it.each(['disabled','visible'] as const)('rechecks every ancestor %s condition before executing an open descendant',async(condition)=>{
    const permission=reactive({revoked:false})
    const run=vi.fn()
    const wrapper=create([{id:'export',label:'导出',position:'more',disabled:condition==='disabled'?()=>permission.revoked:false,visible:condition==='visible'?()=>!permission.revoked:true,children:[{id:'format',label:'格式',children:[{id:'csv',label:'CSV',handler:run}]}]}])
    await wrapper.get('button').trigger('click');await flushPromises()
    document.querySelector<HTMLButtonElement>('[data-action="export"]')!.click();await flushPromises()
    document.querySelector<HTMLButtonElement>('[data-action="format"]')!.click();await flushPromises()
    const leaf=document.querySelector<HTMLButtonElement>('[data-action="csv"]')!
    permission.revoked=true
    // Recheck the whole action path at execution, even before the DOM refreshes.
    leaf.click();await flushPromises()
    expect(run).not.toHaveBeenCalled()
    expect(document.querySelector('[role="menu"][aria-label="格式"]')).toBeNull()
  })
  it('bounds a long menu and nested menu to the viewport and retains keyboard access',async()=>{
    vi.stubGlobal('innerHeight',240);vi.stubGlobal('innerWidth',390)
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
      if(this.classList.contains('bt__more-trigger'))return {x:315,y:190,left:315,top:190,right:370,bottom:220,width:55,height:30,toJSON(){}} as DOMRect
      if(this.getAttribute('role')==='menu')return {x:0,y:0,left:0,top:0,right:174,bottom:224,width:174,height:224,toJSON(){}} as DOMRect
      return {x:220,y:180,left:220,top:180,right:382,bottom:215,width:162,height:35,toJSON(){}} as DOMRect
    })
    const wrapper=create([{id:'export',label:'导出',position:'more',children:Array.from({length:20},(_,i)=>({id:`format-${i}`,label:`格式 ${i}`}))},...Array.from({length:20},(_,i)=>({id:`extra-${i}`,label:`操作 ${i}`,position:'more' as const}))])
    await wrapper.get('button').trigger('click');await flushPromises()
    const root=document.querySelector<HTMLElement>('[role="menu"][aria-label="行操作"]')!
    expect(root.style.maxHeight).toBe('224px')
    expect(parseFloat(root.style.top)).toBeGreaterThanOrEqual(8)
    expect(parseFloat(root.style.top)+224).toBeLessThanOrEqual(232)
    const parent=document.querySelector<HTMLButtonElement>('[data-action="export"]')!
    parent.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await flushPromises()
    const submenu=document.querySelector<HTMLElement>('[role="menu"][aria-label="导出"]')!
    root.querySelector('.bt__menu-items')!.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(document.querySelector('[role="menu"][aria-label="导出"]')).not.toBeNull()
    expect(submenu.style.position).toBe('fixed')
    expect(submenu.style.maxHeight).toBe('224px')
    expect(parseFloat(submenu.style.top)).toBeGreaterThanOrEqual(8)
    expect(parseFloat(submenu.style.top)+224).toBeLessThanOrEqual(232)
    expect(parseFloat(submenu.style.left)).toBeGreaterThanOrEqual(8)
    expect(parseFloat(submenu.style.left)+174).toBeLessThanOrEqual(382)
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));await flushPromises()
    expect(document.activeElement?.getAttribute('data-action')).toBe('format-19')
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await flushPromises()
    expect(document.activeElement).toBe(parent)
  })
})
