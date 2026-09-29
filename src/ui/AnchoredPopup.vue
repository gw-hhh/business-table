<script setup lang="ts">
import { ref,watch } from 'vue'
import { visibleControls } from './useOverlay'
import {providePopupScope,registerPopup} from './popupScope'
import {useFloatingPosition} from './useFloatingPosition'
import {useMotion} from './useMotion'
const props = withDefaults(defineProps<{ anchor: HTMLElement | null; label: string; role?: 'menu' | 'dialog'; width?: number | 'content'; minWidth?: number; maxWidth?: number; popupClass?: string; initialFocus?: 'first'|'last'; scrollStrategy?:'close'|'follow';open?:boolean }>(), { role: 'menu', width: 230, initialFocus:'first', scrollStrategy:'close',open:true })
const emit = defineEmits<{ close: [restoreFocus?: boolean]; tab: [event: KeyboardEvent] }>()
const popup = ref<HTMLElement>()
const motion=useMotion()
const {styles:position}=useFloatingPosition({anchor:()=>props.anchor,popup,open:()=>props.open,maxWidth:()=>props.maxWidth,scrollStrategy:()=>props.scrollStrategy,contains:node=>childPopups.contains(node),onDismiss:()=>close(),onPositioned:element=>{
  const items=visibleControls(element,props.role==='menu');(items[props.initialFocus==='last'?items.length-1:0]??element).focus({preventScroll:true})
},onError:()=>close()})
registerPopup(popup)
const childPopups = providePopupScope()
function close(restore = false) { if(!props.open)return;if (restore) props.anchor?.focus(); emit('close', restore) }
function outside(event: PointerEvent) { if (!popup.value?.contains(event.target as Node) && !props.anchor?.contains(event.target as Node) && !childPopups.contains(event.target as Node)) close() }
function keydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || !popup.value) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
  if (event.key === 'Tab' && props.role === 'menu') { emit('tab', event); if (!event.defaultPrevented) close(true); return }
  if (props.role !== 'menu' || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return
  const items = visibleControls(popup.value,props.role==='menu'), index = items.indexOf(document.activeElement as HTMLElement)
  if (!items.length) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
  items[next]?.focus()
}
watch(()=>props.open,(open,_,onCleanup)=>{
  if(!open)return
  const frame=requestAnimationFrame(()=>document.addEventListener('pointerdown',outside))
  onCleanup(()=>{cancelAnimationFrame(frame);document.removeEventListener('pointerdown',outside)})
},{immediate:true,flush:'post'})
</script>
<template><Teleport to="body"><Transition appear :css="false" @enter="motion.enter" @leave="motion.leave" @enter-cancelled="motion.cancel" @leave-cancelled="motion.cancel"><div v-if="open" ref="popup" class="bt-anchored-popup" :class="popupClass" :role="role" :aria-label="label" tabindex="-1" :style="{...position,width:width==='content'?'max-content':width+'px',minWidth:minWidth===undefined?undefined:`min(${minWidth}px, calc(100vw - 16px))`}" @keydown="keydown"><slot /></div></Transition></Teleport></template>
<style>
.bt-anchored-popup{position:fixed;z-index:1400;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;border:1px solid #dfe5ee;border-radius:8px;background:#fff;box-shadow:0 12px 38px #243e621b,0 3px 9px #243e6210;padding:6px;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;color:#526177;box-sizing:border-box}.bt-anchored-popup *{box-sizing:border-box}.bt-anchored-popup>[role=menuitem],.bt-anchored-popup>.bt-menu-command{display:flex;align-items:center;gap:9px;min-height:36px;width:100%;padding:8px 10px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}.bt-anchored-popup>[role=menuitem]:hover,.bt-anchored-popup>[role=menuitem]:focus-visible{background:#edf4ff;color:#2468e8}.bt-anchored-popup>[role=menuitem]:disabled{opacity:.4;cursor:not-allowed}.bt-anchored-popup .danger{color:#dc4045}.bt-anchored-popup :focus-visible{outline:2px solid #2468e8;outline-offset:-2px}.bt-menu-divider{height:1px;background:#e5eaf1;margin:5px 8px}
</style>
