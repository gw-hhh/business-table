import {ref,watch} from 'vue'
import './drag-reorder.css'

interface ReorderOptions {
  /** Full displayed order, including entries whose slots cannot move. */
  ids:()=>readonly string[]
  disabled?:()=>boolean
  canMove?:(id:string)=>boolean
  canDrop?:(id:string,targetId:string)=>boolean
  move:(id:string,targetId:string)=>void
}
type Edge='before'|'after'

/** Shares insertion feedback; each feature retains its own guarded move command. */
export function useDragReorder(options:ReorderOptions){
  const source=ref<string>(),marker=ref<{id:string;edge:Edge}>()
  const allowed=(id:string)=>!options.disabled?.()&&options.ids().includes(id)&&(options.canMove?.(id)??true)
  function clear(){source.value=undefined;marker.value=undefined}
  function destination(id:string,edge:Edge){
    const full=options.ids(),ids=full.filter(allowed),from=ids.indexOf(source.value??''),to=ids.indexOf(id)
    if(from<0||to<0||from===to||!allowed(source.value!)||!allowed(id))return
    const index=to+(edge==='after'?1:0)-(from<to?1:0),target=ids[index]
    if(index===from||!target||!(options.canDrop?.(source.value!,target)??true))return
    // Locked entries retain their slots. A line is valid only when the moved
    // item will actually touch the indicated edge in the full displayed list.
    const next=[...ids],item=next.splice(from,1)[0]!
    next.splice(index,0,item)
    let cursor=0
    const result=full.map(key=>allowed(key)?next[cursor++]!:key)
    if(result.indexOf(item)!==result.indexOf(id)+(edge==='before'?-1:1))return
    return target
  }
  function over(id:string,event:DragEvent){
    const row=event.currentTarget
    if(!(row instanceof HTMLElement))return
    const box=row.getBoundingClientRect(),edge:Edge=event.clientY<box.top+box.height/2?'before':'after'
    marker.value=destination(id,edge)?{id,edge}:undefined
    if(source.value){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect=marker.value?'move':'none'}
  }
  function drop(id:string,event:DragEvent){
    over(id,event)
    const target=marker.value&&destination(marker.value.id,marker.value.edge),from=source.value
    clear()
    if(from&&target)options.move(from,target)
  }
  function row(id:string){return {
    class:'bt-reorder-item',
    'data-reorder-edge':marker.value?.id===id?marker.value.edge:undefined,
    'data-reorder-source':source.value===id?'true':undefined,
    onDragover:(event:DragEvent)=>over(id,event),
    onDrop:(event:DragEvent)=>drop(id,event),
    onDragleave:(event:DragEvent)=>{
      if(event.currentTarget instanceof HTMLElement&&event.relatedTarget instanceof Node&&event.currentTarget.contains(event.relatedTarget))return
      if(marker.value?.id===id)marker.value=undefined
    }
  }}
  function handle(id:string){return {
    draggable:allowed(id),
    onDragstart:(event:DragEvent)=>{
      clear()
      if(!allowed(id)){event.preventDefault();return}
      source.value=id
      if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id)}
    },
    onDragend:clear
  }}
  watch(()=>options.ids().map(id=>[id,allowed(id)]),()=>{
    if(source.value&&!allowed(source.value))clear()
    else if(marker.value&&!destination(marker.value.id,marker.value.edge))marker.value=undefined
  })
  return {row,handle,clear}
}
