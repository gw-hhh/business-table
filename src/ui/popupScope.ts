import { inject, onBeforeUnmount, provide, watch, type InjectionKey, type Ref } from 'vue'

interface PopupScope { add: (element: HTMLElement) => void; remove: (element: HTMLElement) => void; contains: (node: Node) => boolean }
const key: InjectionKey<PopupScope> = Symbol('business-table-popup-scope')

/** Teleported child menus remain inside their owning toolbar's interaction scope. */
export function providePopupScope(): PopupScope {
  const parent = inject(key, undefined)
  const elements = new Set<HTMLElement>()
  const scope: PopupScope = {
    add: element => { elements.add(element); parent?.add(element) },
    remove: element => { elements.delete(element); parent?.remove(element) },
    contains: node => [...elements].some(element => element.contains(node)),
  }
  provide(key, scope)
  return scope
}
export function registerPopup(element: Ref<HTMLElement | undefined>): void {
  const scope = inject(key, undefined)
  let registered: HTMLElement | undefined
  watch(element,value=>{if(registered)scope?.remove(registered);registered=value;if(registered)scope?.add(registered)},{flush:'post',immediate:true})
  onBeforeUnmount(() => { if (registered) scope?.remove(registered) })
}
