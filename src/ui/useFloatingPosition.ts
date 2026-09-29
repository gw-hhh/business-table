import {autoUpdate,computePosition,flip,offset,shift,size,type Boundary,type Placement} from '@floating-ui/vue'
import {computed,nextTick,shallowRef,toValue,watch,type CSSProperties,type MaybeRefOrGetter} from 'vue'

interface FloatingPositionOptions {
  anchor:MaybeRefOrGetter<HTMLElement|null|undefined>
  popup:MaybeRefOrGetter<HTMLElement|null|undefined>
  open?:MaybeRefOrGetter<boolean>
  placement?:MaybeRefOrGetter<Placement>
  gap?:number
  padding?:number
  boundary?:MaybeRefOrGetter<Boundary|undefined>
  maxWidth?:MaybeRefOrGetter<number|undefined>
  onPositioned?:(popup:HTMLElement)=>void
  onError?:(cause:unknown)=>void
}

/** Position and observe only the current mounted popup. Dismissal stays with its owner. */
export function useFloatingPosition(options:FloatingPositionOptions){
  const position=shallowRef<{x:number;y:number;placement:Placement}>()
  const failure=shallowRef<{cause:unknown}>()
  watch(failure,value=>{if(value)options.onError?.(value.cause)})
  const styles=computed<CSSProperties>(()=>({position:'fixed',boxSizing:'border-box',right:'auto',bottom:'auto',left:`${position.value?.x??0}px`,top:`${position.value?.y??0}px`,visibility:position.value?'visible':'hidden'}))
  const isPositioned=computed(()=>position.value!==undefined)
  watch(()=>({anchor:toValue(options.anchor),popup:toValue(options.popup),open:toValue(options.open)??true,placement:toValue(options.placement)??'bottom-end',boundary:toValue(options.boundary)??[],maxWidth:toValue(options.maxWidth)}),({anchor,popup,open,placement,boundary,maxWidth},_,onCleanup)=>{
    position.value=undefined
    failure.value=undefined
    if(!anchor||!popup||!open)return
    let disposed=false,request=0,focused=false,cleanup=()=>{}
    let boundaryObserver:ResizeObserver|undefined
    const collision={boundary,padding:options.padding??8,rootBoundary:'viewport' as const}
    const update=()=>{
      if(disposed)return
      const current=++request
      void computePosition(anchor,popup,{strategy:'fixed',placement,middleware:[
        offset(options.gap??6),flip(collision),shift({...collision,crossAxis:true}),
        size({...collision,apply({availableWidth,availableHeight,elements}){
          if(disposed||current!==request)return
          const width=Math.max(0,Math.min(availableWidth,maxWidth??Infinity)),height=Math.max(0,availableHeight)
          Object.assign(elements.floating.style,{maxWidth:`${width}px`,maxHeight:`${height}px`})
          elements.floating.style.setProperty('--bt-floating-max-height',`${height}px`)
        }}),
      ]}).then(async result=>{
        if(disposed||current!==request)return
        position.value={x:result.x,y:result.y,placement:result.placement}
        await nextTick()
        if(disposed||current!==request||focused)return
        focused=true
        options.onPositioned?.(popup)
      }).catch(cause=>{
        if(disposed||current!==request)return
        disposed=true;request++;cleanup();boundaryObserver?.disconnect()
        position.value=undefined;failure.value={cause}
      })
    }
    cleanup=autoUpdate(anchor,popup,update)
    // A boundary may shrink without resizing or moving either positioned element.
    const boundaries=Array.isArray(boundary)?boundary:boundary instanceof Element?[boundary]:[]
    boundaryObserver=boundaries.length&&typeof ResizeObserver!=='undefined'?new ResizeObserver(update):undefined
    boundaries.forEach(element=>boundaryObserver?.observe(element))
    onCleanup(()=>{disposed=true;request++;cleanup();boundaryObserver?.disconnect()})
  },{immediate:true,flush:'post'})
  return {styles,isPositioned,error:computed(()=>failure.value?.cause),placement:computed(()=>position.value?.placement)}
}
