import {afterEach,describe,expect,it} from 'vitest'
import {mount,type VueWrapper} from '@vue/test-utils'
import {defineComponent,h,nextTick,ref} from 'vue'
import Sortable from 'sortablejs'
import {useDragReorder} from '../src/ui/useDragReorder'
import {sortableEvent} from './fixtures/sortable'

const wrappers:VueWrapper[]=[]
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount());document.body.replaceChildren()})
async function setup(initial=['a','b','c','d']){
  const ids=ref(initial),disabled=ref(false),locked=ref<string[]>([]),accept=ref(true)
  const moves:string[][]=[],domAtCommit:string[][]=[]
  const wrapper=mount(defineComponent({setup(){
    const reorder=useDragReorder({ids:()=>ids.value,disabled:()=>disabled.value,canMove:id=>!locked.value.includes(id),canDrop:()=>accept.value,move:(id,target)=>{
      domAtCommit.push(order());moves.push([id,target])
      const movable=ids.value.filter(key=>!locked.value.includes(key)),from=movable.indexOf(id),to=movable.indexOf(target)
      movable.splice(from,1);movable.splice(to,0,id);let cursor=0
      ids.value=ids.value.map(key=>locked.value.includes(key)?key:movable[cursor++]!)
    }})
    return()=>h('div',{ref:reorder.setList},ids.value.map(id=>h('div',{key:id,...reorder.row(id)},[h('button',{...reorder.handle(id)},id)])))
  }}),{attachTo:document.body});wrappers.push(wrapper)
  await nextTick()
  const list=wrapper.element as HTMLElement
  function row(id:string){return list.querySelector<HTMLElement>(`[data-reorder-id="${id}"]`)!}
  function order(){return Array.from(list.children).map(child=>child.getAttribute('data-reorder-id')!)}
  const sortable=Sortable.get(list)
  expect(sortable,'a mounted list must own its Sortable gesture lifecycle').toBeDefined()
  function start(id:string){
    const startEvent=sortableEvent(list,row(id),'mousedown')
    sortable!.options.onChoose?.(startEvent);sortable!.options.onStart?.(startEvent)
  }
  function over(id:string,y:number){row(id).dispatchEvent(new MouseEvent('dragover',{bubbles:true,cancelable:true,clientY:y}))}
  function end(type='drop'){
    const item=list.querySelector<HTMLElement>('[data-reorder-source="true"]')??list.firstElementChild as HTMLElement
    sortable!.options.onEnd?.(sortableEvent(list,item,type))
  }
  return {ids,disabled,locked,accept,moves,domAtCommit,wrapper,list,row,order,sortable:sortable!,start,over,end}
}

describe('Sortable insertion adapter shared by settings lists',()=>{
  it('owns a real Sortable instance and restores the original DOM before committing the indicated edge',async()=>{
    const x=await setup();x.start('a');x.over('c',1);await nextTick()
    expect(x.row('c').dataset.reorderEdge).toBe('after')
    expect(x.ids.value).toEqual(['a','b','c','d'])
    // Exercise the boundary even if a Sortable plugin has changed DOM order.
    x.list.append(x.row('a'));x.end();await nextTick()
    expect(x.domAtCommit).toEqual([['a','b','c','d']])
    expect(x.ids.value).toEqual(['b','c','a','d'])
    expect(x.order()).toEqual(['b','c','a','d'])
    expect(x.list.querySelector('[data-reorder-edge]')).toBeNull()
  })
  it('honors before and upward insertion while rejecting adjacent unchanged positions',async()=>{
    const x=await setup();x.start('a');x.over('c',-1);x.end();await nextTick()
    expect(x.ids.value).toEqual(['b','a','c','d'])
    x.start('d');x.over('a',1);x.end();await nextTick()
    expect(x.ids.value).toEqual(['b','a','d','c'])
    x.start('d');x.over('a',1);x.end();await nextTick()
    expect(x.moves).toHaveLength(2)
  })
  it('cancels native dragend, Escape, and leaving the list without committing',async()=>{
    const x=await setup();x.start('a');x.over('c',1);x.end('dragend');await nextTick()
    expect(x.moves).toEqual([])
    x.start('a');x.over('c',1);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));x.end();await nextTick()
    expect(x.moves).toEqual([])
    x.start('a');x.over('c',1);x.list.dispatchEvent(new MouseEvent('dragleave',{bubbles:true}));x.end();await nextTick()
    expect(x.moves).toEqual([])
  })
  it('checks readonly and destination guards again at drop even before Vue renders',async()=>{
    const x=await setup();x.start('a');x.over('c',1);x.disabled.value=true;x.end();await nextTick()
    expect(x.moves).toEqual([])
    x.disabled.value=false;await nextTick();x.start('a');x.over('c',1);x.accept.value=false;x.end();await nextTick()
    expect(x.moves).toEqual([])
  })
  it('cancels a gesture when stable IDs or permission slots change',async()=>{
    const x=await setup();x.start('a');x.over('c',1);x.ids.value=['a','b','c','new'];await nextTick();x.end()
    expect(x.moves).toEqual([])
    x.start('a');x.over('c',1);x.locked.value=['b'];await nextTick();x.end()
    expect(x.moves).toEqual([])
    expect(x.order()).toEqual(['a','b','c','new'])
  })
  it('rejects lines that cannot retain a locked slot and accepts the next legal edge',async()=>{
    const x=await setup(['a','locked','b','c']);x.locked.value=['locked'];await nextTick()
    x.start('c');x.over('a',1);await nextTick()
    expect(x.row('a').dataset.reorderEdge).toBeUndefined();x.end()
    expect(x.moves).toEqual([])
    x.start('c');x.over('b',-1);await nextTick()
    expect(x.row('b').dataset.reorderEdge).toBe('before');x.end();await nextTick()
    expect(x.ids.value).toEqual(['a','locked','c','b'])
  })
  it('isolates lists with overlapping IDs and releases the engine when unmounted',async()=>{
    const page=await setup(),table=await setup();page.start('a');table.over('c',1);table.end();await nextTick()
    expect(table.moves).toEqual([]);expect(page.moves).toEqual([])
    page.wrapper.unmount();expect(Sortable.get(page.list)).toBeNull()
  })
})
