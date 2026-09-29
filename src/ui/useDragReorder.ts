import Sortable from 'sortablejs'
import {nextTick,onScopeDispose,ref,watch,type ComponentPublicInstance} from 'vue'
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

/** Sortable owns gestures; Vue and the feature's guarded command own order. */
export function useDragReorder(options:ReorderOptions){
  const source=ref<string>(),marker=ref<{id:string;edge:Edge}>()
  const allowed=(id:string)=>!options.disabled?.()&&options.ids().includes(id)&&(options.canMove?.(id)??true)
  let list:HTMLElement|undefined,engine:Sortable|undefined,originalNodes:ChildNode[]=[]
  let started=false,disposed=false
  const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches

  function restore(){
    if(!list)return
    // Include Vue's fragment anchors and non-draggable headings. Restoring only
    // draggable indices would put these nodes in the wrong order for Vue's patch.
    let next:ChildNode|null=null
    for(const node of [...originalNodes].reverse()){
      if(node.parentNode!==list)continue
      if(node.nextSibling!==next)list.insertBefore(node,next)
      next=node
    }
  }
  function reset(){source.value=undefined;marker.value=undefined;originalNodes=[];started=false}
  function stopEngine(){
    const current=engine;engine=undefined
    if(!current)return
    // End the active DOM gesture first: destroy() alone does not remove native
    // dragend listeners or a live fallback ghost from an interrupted gesture.
    const dragged=Sortable.dragged
    if(dragged&&dragged.parentElement===list){
      dragged.dispatchEvent(new Event('dragend',{bubbles:true,cancelable:true}))
      if(Sortable.dragged===dragged)document.dispatchEvent(new Event('pointercancel',{bubbles:true,cancelable:true}))
      if(Sortable.dragged===dragged)document.dispatchEvent(new Event('touchcancel',{bubbles:true,cancelable:true}))
    }
    current.destroy()
  }
  function clear(){
    restore();reset();stopEngine()
    if(list&&!disposed)createEngine()
  }
  function destination(id:string,edge:Edge){
    const full=options.ids(),ids=full.filter(allowed),from=ids.indexOf(source.value??''),to=ids.indexOf(id)
    if(from<0||to<0||from===to||!source.value||!allowed(source.value)||!allowed(id))return
    const index=to+(edge==='after'?1:0)-(from<to?1:0),target=ids[index]
    if(index===from||!target||!(options.canDrop?.(source.value,target)??true))return
    const next=[...ids],item=next.splice(from,1)[0]!
    next.splice(index,0,item)
    let cursor=0
    const result=full.map(key=>allowed(key)?next[cursor++]!:key)
    // A locked slot must remain fixed and the promised edge must be achievable.
    if(result.indexOf(item)!==result.indexOf(id)+(edge==='before'?-1:1))return
    return target
  }
  function indicate(element:Element|null,y:number){
    const row=element?.closest<HTMLElement>('[data-reorder-id]')
    if(!source.value||!row||row.parentElement!==list){marker.value=undefined;return}
    const id=row.dataset.reorderId!,box=row.getBoundingClientRect(),edge:Edge=y<box.top+box.height/2?'before':'after'
    marker.value=destination(id,edge)?{id,edge}:undefined
  }
  function over(event:DragEvent){
    if(!source.value)return
    indicate(event.target instanceof Element?event.target:null,event.clientY)
    event.preventDefault()
    if(event.dataTransfer)event.dataTransfer.dropEffect=marker.value?'move':'none'
  }
  function pointer(event:PointerEvent|TouchEvent){
    if(!source.value||!started)return
    const point='touches' in event?event.touches[0]:event
    if(point)indicate(document.elementFromPoint(point.clientX,point.clientY),point.clientY)
  }
  function leave(event:DragEvent){if(!(event.relatedTarget instanceof Node)||!list?.contains(event.relatedTarget))marker.value=undefined}
  function escape(event:KeyboardEvent){if(event.key==='Escape'&&source.value){event.preventDefault();event.stopPropagation();clear()}}
  function createEngine(){
    if(!list||disposed)return
    engine=new Sortable(list,{
      draggable:'.bt-reorder-item',handle:'[data-reorder-handle="true"]',dataIdAttr:'data-reorder-id',
      disabled:!!options.disabled?.(),direction:'vertical',animation:reducedMotion()?0:150,
      ghostClass:'bt-reorder-ghost',chosenClass:'bt-reorder-chosen',dragClass:'bt-reorder-drag',fallbackClass:'bt-reorder-fallback',
      fallbackOnBody:true,fallbackTolerance:4,delay:120,delayOnTouchOnly:true,touchStartThreshold:4,
      scroll:true,bubbleScroll:true,scrollSensitivity:32,scrollSpeed:10,
      // Per-list instances never accept a drag from another settings group.
      group:{name:'business-table-reorder',pull:false,put:false},
      filter:(_event,item)=>!allowed(item.dataset.reorderId??''),preventOnFilter:false,
      onChoose:event=>{
        const id=event.item.dataset.reorderId
        if(!id||!allowed(id))return
        source.value=id;marker.value=undefined;originalNodes=Array.from(list!.childNodes);started=false
      },
      onStart:()=>{started=true},
      onMove:(event,originalEvent)=>{
        const point=typeof TouchEvent!=='undefined'&&originalEvent instanceof TouchEvent?originalEvent.touches[0]:originalEvent instanceof MouseEvent?originalEvent:undefined
        if(point)indicate(event.related,point.clientY)
        // Preview uses the insertion line; order remains unchanged until release.
        return false
      },
      onUnchoose:()=>{if(!started){restore();reset()}},
      onEnd:event=>{
        const originalEvent='originalEvent' in event&&event.originalEvent instanceof Event?event.originalEvent:undefined
        const from=source.value,type=originalEvent?.type
        const target=type&&['drop','mouseup','pointerup','touchend'].includes(type)&&marker.value?destination(marker.value.id,marker.value.edge):undefined
        restore();reset()
        if(!from||!target)return
        const current=engine
        current?.option('animation',reducedMotion()?0:150)
        // Sortable's runtime exposes its animation manager; @types/sortablejs
        // omits these methods. Check their shape before using that optional API.
        let animate:(()=>void)|undefined
        if(current&&'captureAnimationState' in current&&typeof current.captureAnimationState==='function'&&'animateAll' in current&&typeof current.animateAll==='function'){
          current.captureAnimationState()
          const play=current.animateAll
          animate=()=>play.call(current)
        }
        options.move(from,target)
        void nextTick(()=>{if(!disposed&&engine===current)animate?.()})
      },
    })
  }
  function setList(element:Element|ComponentPublicInstance|null){
    const next=typeof HTMLElement!=='undefined'&&element instanceof HTMLElement?element:undefined
    if(next===list)return
    restore();reset();stopEngine()
    if(list){
      list.removeEventListener('dragover',over);list.removeEventListener('dragleave',leave)
      document.removeEventListener('pointermove',pointer);document.removeEventListener('touchmove',pointer);document.removeEventListener('keydown',escape,true)
    }
    list=next
    if(list){
      list.addEventListener('dragover',over);list.addEventListener('dragleave',leave)
      document.addEventListener('pointermove',pointer);document.addEventListener('touchmove',pointer,{passive:true});document.addEventListener('keydown',escape,true)
      createEngine()
    }
  }
  function row(id:string){return {
    class:'bt-reorder-item','data-reorder-id':id,
    'data-reorder-edge':marker.value?.id===id?marker.value.edge:undefined,
    'data-reorder-source':source.value===id?'true':undefined,
  }}
  function handle(id:string){return {'data-reorder-handle':allowed(id)?'true':undefined}}
  watch(()=>JSON.stringify([options.ids(),options.ids().map(allowed),!!options.disabled?.()]),()=>{
    // Synchronous cancellation restores DOM before Vue patches changed keys.
    if(source.value)clear()
    else engine?.option('disabled',!!options.disabled?.())
  },{flush:'sync'})
  onScopeDispose(()=>{disposed=true;setList(null)})
  return {setList,row,handle,clear}
}
