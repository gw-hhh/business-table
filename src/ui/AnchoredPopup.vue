<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { visibleControls } from './useOverlay'
const props = withDefaults(defineProps<{ anchor: HTMLElement | null; label: string; role?: 'menu' | 'dialog'; width?: number }>(), { role: 'menu', width: 230 })
const emit = defineEmits<{ close: [restoreFocus?: boolean] }>()
const popup = ref<HTMLElement>(), position = ref({ left:'0px', top:'0px', visibility:'hidden' as 'hidden'|'visible' })
let frame = 0
function positionNow() {
  if (!popup.value || !props.anchor?.isConnected) return
  const anchor = props.anchor.getBoundingClientRect(), box = popup.value.getBoundingClientRect()
  const width = document.documentElement.clientWidth || innerWidth, height = innerHeight
  const left = Math.max(8, Math.min(width - box.width - 8, anchor.right - box.width))
  const top = anchor.bottom + 6 + box.height <= height - 8 ? anchor.bottom + 6 : Math.max(8, anchor.top - box.height - 6)
  position.value = { left:`${left}px`,top:`${top}px`,visibility:'visible' }
}
function close(restore = false) { if (restore) props.anchor?.focus(); emit('close', restore) }
function outside(event: PointerEvent) { if (!popup.value?.contains(event.target as Node) && !props.anchor?.contains(event.target as Node)) close() }
function scrolled(event: Event) { if (!popup.value?.contains(event.target as Node)) close() }
function keydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || !popup.value) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
  if (event.key === 'Tab' && props.role === 'menu') { close(true); return }
  if (props.role !== 'menu' || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return
  const items = visibleControls(popup.value), index = items.indexOf(document.activeElement as HTMLElement)
  if (!items.length) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
  items[next]?.focus()
}
onMounted(async () => {
  await nextTick(); positionNow()
  frame = requestAnimationFrame(() => {
    document.addEventListener('pointerdown', outside)
    document.addEventListener('scroll', scrolled, true)
    window.addEventListener('resize', positionNow)
    if (popup.value) (visibleControls(popup.value)[0] ?? popup.value).focus({ preventScroll:true })
  })
})
onBeforeUnmount(() => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown',outside);document.removeEventListener('scroll',scrolled,true);window.removeEventListener('resize',positionNow) })
</script>
<template><Teleport to="body"><div ref="popup" class="bt-anchored-popup" :role="role" :aria-label="label" tabindex="-1" :style="{...position,width:width+'px'}" @keydown="keydown"><slot /></div></Teleport></template>
<style>
.bt-anchored-popup{position:fixed;z-index:1400;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;border:1px solid #dfe5ee;border-radius:8px;background:#fff;box-shadow:0 12px 38px #243e621b,0 3px 9px #243e6210;padding:6px;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;color:#526177;box-sizing:border-box}.bt-anchored-popup *{box-sizing:border-box}.bt-anchored-popup>[role=menuitem],.bt-anchored-popup>.bt-menu-command{display:flex;align-items:center;gap:9px;min-height:36px;width:100%;padding:8px 10px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}.bt-anchored-popup>[role=menuitem]:hover,.bt-anchored-popup>[role=menuitem]:focus-visible{background:#edf4ff;color:#2468e8}.bt-anchored-popup>[role=menuitem]:disabled{opacity:.4;cursor:not-allowed}.bt-anchored-popup .danger{color:#dc4045}.bt-anchored-popup :focus-visible{outline:2px solid #2468e8;outline-offset:-2px}.bt-menu-divider{height:1px;background:#e5eaf1;margin:5px 8px}
</style>
