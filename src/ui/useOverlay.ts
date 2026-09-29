import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

let originalOverflow = ''
interface OverlayEntry {root:HTMLElement;previous:HTMLElement|null;leaving:boolean}
const overlays:OverlayEntry[]=[]
function guardLeaving(event:KeyboardEvent){if(overlays.at(-1)?.leaving&&['Escape','Tab'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation()}}
export function visibleControls(root: HTMLElement, includeProgrammatic = false): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')).filter(element => {
    if ((!includeProgrammatic && element.tabIndex < 0) || element.matches(':disabled') || element.closest('[inert],[hidden]')) return false
    for (let current: HTMLElement | null = element; current && current !== root; current = current.parentElement) {
      const style = getComputedStyle(current)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  })
}
/** Reference-counted body lock; nested dialogs restore focus in closing order. */
export function useOverlay(root: Ref<HTMLElement | undefined>, close: () => void) {
  let entry:OverlayEntry|undefined,disposed=false
  async function acquire(element:HTMLElement){
    if(entry){entry.root=element;entry.leaving=false}
    else{
      entry={root:element,previous:document.activeElement instanceof HTMLElement?document.activeElement:null,leaving:false}
      if(!overlays.length){originalOverflow=document.body.style.overflow;document.body.style.overflow='hidden';document.addEventListener('keydown',guardLeaving,true)}
      overlays.push(entry)
    }
    await nextTick()
    if(disposed||!entry||entry.leaving||overlays.at(-1)!==entry||!element.isConnected)return
    const autofocus=visibleControls(element,true).find(control=>control.hasAttribute('autofocus'))
    ;(autofocus??element).focus({preventScroll:true})
  }
  function release(){
    if(!entry)return
    const current=entry,index=overlays.indexOf(current),wasTop=overlays.at(-1)===current
    entry=undefined
    if(index>=0)overlays.splice(index,1)
    // If a parent closes first, descendants inherit its original return target.
    for(const overlay of overlays)if(overlay.previous&&current.root.contains(overlay.previous))overlay.previous=current.previous
    if(!overlays.length){document.body.style.overflow=originalOverflow;document.removeEventListener('keydown',guardLeaving,true)}
    if(!wasTop)return
    const top=overlays.at(-1)
    if(top?.leaving)return
    const previous=current.previous
    const target=previous?.isConnected&&(!top||top.root.contains(previous))?previous:top?.root
    target?.focus({preventScroll:true})
  }
  watch(root,element=>{if(element)void acquire(element);else if(!entry?.leaving)release()},{flush:'post'})
  onBeforeUnmount(()=>{disposed=true;release()})
  function beforeLeave(){if(entry)entry.leaving=true}
  function afterLeave(){release()}
  function leaveCancelled(){if(entry)entry.leaving=false}
  const isTop=()=>!!entry&&overlays.at(-1)===entry&&!entry.leaving
  function keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || !root.value || !isTop()) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (event.key !== 'Tab') return
    const controls = visibleControls(root.value), first = controls[0], last = controls.at(-1)
    if (!first) { event.preventDefault(); root.value.focus(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === root.value)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.value)) { event.preventDefault(); first.focus() }
  }
  return { keydown,beforeLeave,afterLeave,leaveCancelled,isTop }
}
