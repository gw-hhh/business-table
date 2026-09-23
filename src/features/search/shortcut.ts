import {onMounted,onBeforeUnmount} from 'vue'

/** The host decides which headless/default search input receives focus. */
export function useSearchShortcut(focus:()=>void){
  function keydown(event:KeyboardEvent){
    if(event.key!=='/'||event.ctrlKey||event.metaKey||event.altKey||event.defaultPrevented)return
    const target=event.target
    if(target instanceof Element&&target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return
    if(document.querySelector('[aria-modal="true"]'))return
    event.preventDefault();focus()
  }
  onMounted(()=>document.addEventListener('keydown',keydown))
  onBeforeUnmount(()=>document.removeEventListener('keydown',keydown))
}
