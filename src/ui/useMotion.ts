import {onBeforeUnmount,toValue,type MaybeRefOrGetter} from 'vue'

type MotionKind='popup'|'dialog'|'drawer'|'collapse'

export function motionEnabled(){return typeof Element!=='undefined'&&typeof Element.prototype.animate==='function'&&!(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches)}

/** Vue owns presence; this adapter owns cancellable, nonessential animations. */
export function useMotion(kind:MaybeRefOrGetter<MotionKind>='popup',enabled:MaybeRefOrGetter<boolean>=true){
  const running=new Map<Element,(complete:boolean)=>void>()
  const media=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):undefined
  const cancel=(element:Element)=>running.get(element)?.(false)
  const reduced=()=>{if(media?.matches)for(const finish of [...running.values()])finish(true)}
  function play(element:Element,done:()=>void,leaving:boolean){
    cancel(element)
    const mode=toValue(kind),restoreInert=leaving&&mode!=='collapse'&&!element.hasAttribute('inert')
    if(restoreInert)element.setAttribute('inert','')
    if(!toValue(enabled)||media?.matches||typeof element.animate!=='function'){done();return}
    const panel=mode==='popup'?element:element.querySelector('[role="dialog"]')??element
    const duration=mode==='drawer'?(leaving?160:180):(leaving?120:150)
    const move=mode==='drawer'?'translateX(24px)':mode==='dialog'?'translateY(8px)':'translateY(-4px)'
    const options:KeyframeAnimationOptions={duration,easing:leaving?'ease-in':'ease-out',fill:'both'}
    const animations:Animation[]=[]
    let finished=false
    const finish=(complete:boolean)=>{
      if(finished)return
      finished=true;running.delete(element)
      if(!running.size)media?.removeEventListener?.('change',reduced)
      animations.forEach(animation=>animation.cancel())
      if(!complete&&restoreInert)element.removeAttribute('inert')
      if(complete)done()
    }
    running.set(element,finish)
    media?.addEventListener?.('change',reduced)
    try{
      const opacity=leaving?[1,0]:[0,1],transform=leaving?['none',move]:[move,'none']
      if(mode==='collapse'){
        const height=`${element.getBoundingClientRect().height}px`
        animations.push(element.animate({height:leaving?[height,'0px']:['0px',height],opacity,overflow:['hidden','hidden']},options))
      }
      else if(panel===element)animations.push(element.animate({opacity,transform},options))
      else {
        animations.push(element.animate({opacity},options))
        animations.push(panel.animate({transform},options))
      }
      void Promise.all(animations.map(animation=>animation.finished)).then(()=>finish(true),()=>finish(true))
    }catch{finish(true)}
  }
  // An already leaving vnode is no longer the component's current subtree;
  // finish its Vue callback as well so parent teardown cannot strand its DOM.
  onBeforeUnmount(()=>{media?.removeEventListener?.('change',reduced);for(const finish of [...running.values()])finish(true)})
  return {enter:(element:Element,done:()=>void)=>play(element,done,false),leave:(element:Element,done:()=>void)=>play(element,done,true),cancel}
}
