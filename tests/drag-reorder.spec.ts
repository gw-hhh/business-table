import {afterEach,describe,expect,it} from 'vitest'
import {effectScope,nextTick,ref,type EffectScope} from 'vue'
import {useDragReorder} from '../src/ui/useDragReorder'

const scopes:EffectScope[]=[]
afterEach(()=>scopes.splice(0).forEach(scope=>scope.stop()))
function setup(){
  const ids=ref(['a','b','c','d']),disabled=ref(false),locked=ref<string[]>([])
  const moves:string[][]=[]
  const scope=effectScope();scopes.push(scope)
  const reorder=scope.run(()=>useDragReorder({ids:()=>ids.value,disabled:()=>disabled.value,canMove:id=>!locked.value.includes(id),move:(id,target)=>{
    moves.push([id,target]);const next=[...ids.value],from=next.indexOf(id),to=next.indexOf(target)
    next.splice(from,1);next.splice(to,0,id);ids.value=next
  }}))!
  const row=document.createElement('div')
  // JSDOM's zero-height rect lets -1/+1 represent the two halves. Real hit
  // testing and the line's geometry are exercised by native browser dragging.
  function drag(id:string){const event=new Event('dragstart',{cancelable:true});reorder.handle(id).onDragstart(event as DragEvent)}
  function event(y:number){const e=new MouseEvent('dragover',{clientY:y,cancelable:true});Object.defineProperty(e,'currentTarget',{value:row});return e as DragEvent}
  function over(id:string,y:number){reorder.row(id).onDragover(event(y))}
  function drop(id:string,y:number){reorder.row(id).onDrop(event(y))}
  return {ids,disabled,locked,moves,reorder,drag,over,drop,event}
}

describe('drag insertion shared by settings lists',()=>{
  it('places a downward move before or after the hovered row exactly as indicated',()=>{
    const before=setup();before.drag('a');before.over('c',-1)
    expect(before.reorder.row('c')['data-reorder-edge']).toBe('before')
    expect(before.ids.value).toEqual(['a','b','c','d'])
    before.drop('c',-1);expect(before.ids.value).toEqual(['b','a','c','d'])
    const after=setup();after.drag('a');after.over('c',1)
    expect(after.reorder.row('c')['data-reorder-edge']).toBe('after')
    after.drop('c',1);expect(after.ids.value).toEqual(['b','c','a','d'])
    expect(after.reorder.row('c')['data-reorder-edge']).toBeUndefined()
  })
  it('handles upward insertion and treats adjacent unchanged positions as no-ops',()=>{
    const x=setup();x.drag('d');x.drop('b',1)
    expect(x.ids.value).toEqual(['a','b','d','c'])
    x.drag('d');x.over('b',1);x.drop('b',1)
    expect(x.moves).toHaveLength(1)
    expect(x.reorder.row('b')['data-reorder-edge']).toBeUndefined()
  })
  it('clears canceled and outside drags without moving any item',()=>{
    const x=setup();x.drag('a');x.over('c',1)
    x.reorder.row('c').onDragleave(x.event(1))
    expect(x.reorder.row('c')['data-reorder-edge']).toBeUndefined()
    x.over('c',1);x.reorder.handle('a').onDragend();x.drop('c',1)
    expect(x.moves).toEqual([])
  })
  it('rechecks permissions and removed sources before drop',async()=>{
    const x=setup();x.locked.value=['b'];x.drag('b');x.drop('d',1)
    x.drag('a');x.over('b',1);x.drop('b',1)
    expect(x.moves).toEqual([])
    x.drag('a');x.over('c',1);x.disabled.value=true;await nextTick();x.drop('c',1)
    expect(x.moves).toEqual([])
    x.disabled.value=false;x.drag('a');x.ids.value=['b','c','d'];await nextTick();x.drop('d',1)
    expect(x.moves).toEqual([])
  })
  it('ignores drags from another list even when their item IDs overlap',()=>{
    const page=setup(),table=setup();page.drag('a');table.over('c',1);table.drop('c',1)
    expect(table.reorder.row('c')['data-reorder-edge']).toBeUndefined()
    expect(table.moves).toEqual([])
    expect(page.ids.value).toEqual(['a','b','c','d'])
  })
  it('rejects a line beside a locked slot when the feature cannot land at that edge',()=>{
    const x=setup();x.ids.value=['a','locked','b','c'];x.locked.value=['locked']
    x.drag('c');x.over('a',1)
    expect(x.reorder.row('a')['data-reorder-edge']).toBeUndefined()
    x.drop('a',1);expect(x.moves).toEqual([])
    x.drag('c');x.over('b',-1)
    expect(x.reorder.row('b')['data-reorder-edge']).toBe('before')
    x.drop('b',-1);expect(x.ids.value).toEqual(['a','locked','c','b'])
  })
})
