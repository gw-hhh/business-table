<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import TableIcon from '../../components/TableIcon.vue'
import {providePopupScope} from '../../ui/popupScope'
import { presentTools, type ToolDefinition, type ToolPreference } from '../presentation/model'

const props = withDefaults(defineProps<{
  tools: readonly ToolDefinition[]
  layout?: Record<string, ToolPreference>
  gap?: number
  overflow?: 'wrap' | 'collapse'
  size?: 'default' | 'small'
  moreLabel?: string
  buttonClass?: string
  iconButtonClass?: string
  menuClass?: string
}>(), { layout: () => ({}), gap: 4, overflow: 'collapse', size:'default', moreLabel: '更多工具', buttonClass: '', iconButtonClass: '', menuClass: '' })
const popupScope=providePopupScope()
const emit = defineEmits<{ error: [cause: unknown] }>()
const root = ref<HTMLElement>(), trigger = ref<HTMLButtonElement>(), opened = ref(false), failure = ref('')
const menu = ref<HTMLElement>(), menuStyle = ref<CSSProperties>({ position: 'fixed', right: 'auto' }), narrow = ref(false)
let media: MediaQueryList | undefined
let observer: ResizeObserver | undefined
const available = ref(Number.POSITIVE_INFINITY), widths = ref<Record<string,number>>({})
const collapsed = computed(() => {
  if (props.overflow !== 'collapse') return new Set<string>()
  const items = presented.value.filter(tool => tool.position !== 'more'), hidden = new Set<string>()
  let total = items.reduce((sum,tool) => sum + (widths.value[tool.id] ?? (tool.display === 'icon' ? 32 : tool.label.length * 14 + 48)) + props.gap, -props.gap)
  const hasMore = presented.value.some(tool => tool.position === 'more')
  if (hasMore) total += 32 + props.gap
  for (const tool of [...items].reverse()) {
    if (total <= available.value) break
    if (tool.fixed) continue
    if (!hidden.size && !hasMore) total += 32 + props.gap
    hidden.add(tool.id); total -= (widths.value[tool.id] ?? (tool.display === 'icon' ? 32 : tool.label.length * 14 + 48)) + props.gap
  }
  return hidden
})
function measureContainer() {
  if (!root.value) return
  const measured:Record<string,number> = {}
  root.value.querySelectorAll<HTMLElement>('[data-measure-tool]').forEach(item => { if(item.dataset.measureTool) measured[item.dataset.measureTool] = item.getBoundingClientRect().width })
  if (JSON.stringify(measured) !== JSON.stringify(widths.value)) widths.value = measured
  const width = root.value.parentElement?.clientWidth
  if (width) available.value = width
}
const presented = computed(() => presentTools(props.tools, props.layout))
const inOverflow = (tool: ToolDefinition) => tool.position === 'more' || (props.overflow === 'collapse' && !tool.fixed && (narrow.value || collapsed.value.has(tool.id)))
const direct = computed(() => presented.value.filter(tool => !inOverflow(tool)))
const overflow = computed(() => presented.value.filter(inOverflow))
const menuItems = () => [...(root.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
function close(focus = false) { opened.value = false; if (focus) trigger.value?.focus() }
function positionMenu() {
  if (!opened.value || !trigger.value || !menu.value) return
  const anchor = trigger.value.getBoundingClientRect(), box = menu.value.getBoundingClientRect(), margin = 12
  const left = Math.max(margin, Math.min(anchor.right - box.width, window.innerWidth - box.width - margin))
  const below = anchor.bottom + 8, above = anchor.top - box.height - 8
  const top = Math.max(margin, Math.min(below + box.height <= window.innerHeight - margin ? below : above, window.innerHeight - box.height - margin))
  menuStyle.value = { position: 'fixed', right: 'auto', left: `${left}px`, top: `${top}px`, maxHeight: `${window.innerHeight - margin * 2}px`, overflowY: box.height > window.innerHeight - margin * 2 ? 'auto' : 'visible' }
}
async function toggleMenu() { opened.value = !opened.value; if (opened.value) { await nextTick(); positionMenu(); focusAt(0) } }
async function invoke(tool: ToolDefinition, event: Event, keepOpen = false) {
  if (tool.disabled === true || !tool.handler) return
  failure.value = ''
  if (!keepOpen) close(opened.value)
  try { await tool.handler(event) }
  catch (cause) { failure.value = cause instanceof Error ? cause.message : '操作失败，请重试。'; emit('error', cause) }
}
function focusAt(index: number) { const items = menuItems(); items[index]?.focus() }
async function openFromKey(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return
  event.preventDefault(); event.stopPropagation(); opened.value = true
  await nextTick(); positionMenu(); focusAt(event.key === 'ArrowUp' ? menuItems().length - 1 : 0)
}
function menuKey(event: KeyboardEvent) {
  const popup = root.value?.querySelector('[role="menu"]')
  if (event.target instanceof Element && event.target.closest('[role="menu"],[role="dialog"]') !== popup) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
  if (event.key === 'Tab') {
    const stops = [...document.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]')].filter(element => {
      if (popup?.contains(element) || element.tabIndex < 0 || element.matches(':disabled,[aria-disabled="true"]')) return false
      for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        if (parent.hidden || parent.inert || style.display === 'none' || style.visibility === 'hidden') return false
      }
      return true
    })
    const index = trigger.value ? stops.indexOf(trigger.value) : -1
    const target = index >= 0 ? stops[index + (event.shiftKey ? -1 : 1)] : undefined
    event.preventDefault(); event.stopPropagation(); close(); (target ?? trigger.value)?.focus(); return
  }
  const items = menuItems(), index = items.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : undefined
  if (next === undefined) return
  event.preventDefault(); event.stopPropagation(); focusAt(next)
}
function outside(event: PointerEvent) { if (event.target instanceof Node && !root.value?.contains(event.target) && !popupScope.contains(event.target)) close() }
function classes(tool: ToolDefinition) { return ['bt-tool', tool.display === 'icon' ? props.iconButtonClass : props.buttonClass, { 'is-active': tool.active, 'is-primary': tool.variant === 'primary', 'is-icon': tool.display === 'icon' }] }
function resize() { narrow.value = media?.matches ?? window.innerWidth <= 700; void nextTick(positionMenu) }
watch(overflow, items => { if (!items.length) close(); else void nextTick(positionMenu) })
watch(()=>JSON.stringify([presented.value.map(tool=>[tool.id,tool.label,tool.display,tool.position,tool.separator]),props.size,props.gap]),()=>void nextTick(measureContainer),{flush:'post'})
function observeContainer(){observer?.disconnect();if(root.value?.parentElement)observer?.observe(root.value.parentElement);measureContainer()}
watch(root,observeContainer,{flush:'post'})
onMounted(() => {
  // A strip has intrinsic width; viewport width avoids collapse/expand measurement feedback.
  if (typeof window.matchMedia === 'function') media = window.matchMedia('(max-width: 700px)')
  resize(); void nextTick(measureContainer)
  if (typeof ResizeObserver !== 'undefined') { observer=new ResizeObserver(measureContainer); observeContainer() }
  media?.addEventListener('change', resize)
  document.addEventListener('pointerdown', outside)
  window.addEventListener('resize', resize)
  window.addEventListener('scroll', positionMenu, true)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  media?.removeEventListener('change', resize)
  document.removeEventListener('pointerdown', outside)
  window.removeEventListener('resize', resize)
  window.removeEventListener('scroll', positionMenu, true)
})
</script>

<template>
  <div v-if="presented.length" ref="root" class="bt-tool-strip" :class="{'bt-tool-strip--small':size==='small'}" :style="{ gap: `${gap}px` }">
    <div class="bt-tool-measure" aria-hidden="true" inert><span v-for="tool in presented" :key="tool.id" :data-measure-tool="tool.id" class="bt-tool-item" :class="{'has-separator':tool.separator}"><span :class="classes(tool)"><TableIcon v-if="tool.display!=='text'" :name="tool.icon??'file'"/><span v-if="tool.display!=='icon'">{{tool.label}}</span></span></span></div>
    <div v-for="tool in direct" :key="tool.id" class="bt-tool-item" :class="{'has-separator':tool.separator,'is-fixed':tool.fixed}" :data-tool-id="tool.id">
      <slot :name="`tool-${tool.id}`" :tool="tool" :invoke="(event:Event,keepOpen=false)=>invoke(tool,event,keepOpen)">
        <button type="button" :class="classes(tool)" :title="tool.label" :aria-label="tool.label" :aria-pressed="tool.active === undefined ? undefined : tool.active" :disabled="tool.disabled === true" @click="invoke(tool,$event)"><TableIcon v-if="tool.display !== 'text'" :name="tool.icon ?? 'file'"/><span v-if="tool.display !== 'icon'">{{tool.label}}</span></button>
      </slot>
    </div>
    <div v-if="overflow.length" class="bt-tool-more">
      <button ref="trigger" type="button" class="bt-tool is-icon" :class="iconButtonClass" :aria-label="moreLabel" :title="moreLabel" :aria-expanded="opened" aria-haspopup="menu" @click="toggleMenu" @keydown="openFromKey"><TableIcon name="more"/></button>
      <div v-if="opened" ref="menu" class="bt-tool-menu" :class="menuClass" :style="menuStyle" role="menu" :aria-label="moreLabel" @keydown="menuKey">
        <div v-for="tool in overflow" :key="tool.id" :data-tool-id="tool.id" :class="{'has-separator':tool.separator}">
          <slot :name="`tool-${tool.id}`" :tool="tool" :invoke="(event:Event,keepOpen=false)=>invoke(tool,event,keepOpen)" :in-menu="true">
            <button type="button" role="menuitem" tabindex="-1" :disabled="tool.disabled === true" :title="tool.label" :aria-label="tool.label" @click="invoke(tool,$event)"><TableIcon v-if="tool.display !== 'text'" :name="tool.icon ?? 'file'"/><span v-if="tool.display !== 'icon'">{{tool.label}}</span></button>
          </slot>
        </div>
      </div>
    </div>
    <p v-if="failure" class="bt-tool-error" role="alert">{{failure}}</p>
  </div>
</template>

<style scoped>
.bt-tool-measure{position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;display:flex;width:max-content;contain:layout style}.bt-tool-strip{display:flex;align-items:center;flex-wrap:wrap;min-width:0}.bt-tool-item,.bt-tool-more{position:relative;flex-shrink:0}.bt-tool{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 13px;border:1px solid #d9dfe8;border-radius:6px;background:#fff;color:#526177;font:inherit;white-space:nowrap;cursor:pointer}.bt-tool:hover:not(:disabled){color:#2468e8;border-color:#a7c5f6;background:#fafcff}.bt-tool.is-icon{width:32px;height:32px;padding:0;border-color:transparent;background:transparent;color:#76869b}.bt-tool.is-active{color:#2468e8;background:#edf4ff}.bt-tool.is-primary{background:#2468e8;border-color:#2468e8;color:#fff}.bt-tool.is-primary:hover:not(:disabled){background:#1755cc;border-color:#1755cc;color:#fff}.bt-tool:disabled,.bt-tool-menu button:disabled{opacity:.5;cursor:not-allowed}.bt-tool-item.has-separator{border-left:1px solid #e0e6ee;padding-left:8px;margin-left:4px}.bt-tool-menu{position:absolute;right:0;top:40px;z-index:60;width:var(--bt-tool-menu-width,220px);max-width:calc(100vw - 24px);padding:8px 9px;background:#fff;border:1px solid #dde5f0;border-radius:8px;box-shadow:0 12px 34px #283d5b20,0 2px 7px #283d5b06;color:#526681;font-size:13px}.bt-tool-menu button{display:flex;align-items:center;gap:9px;min-height:36px;width:100%;text-align:left;border:0;border-radius:4px;background:transparent;padding:7px 10px;color:#526681;font:inherit;white-space:nowrap;cursor:pointer}.bt-tool-menu button:hover:not(:disabled),.bt-tool-menu button:focus-visible{color:#2468e8;background:#f0f5ff}.bt-tool-menu .has-separator{border-top:1px solid #e6eaf0;padding-top:6px;margin-top:6px}.bt-tool-strip--small .bt-tool:not(.is-icon){height:32px;font-size:13px;padding:0 9px}.bt-tool-error{color:#be3544;font-size:12px;margin:0}
</style>
