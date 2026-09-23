<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AnchoredPopup from '../../ui/AnchoredPopup.vue'
import TableIcon from '../../components/TableIcon.vue'
import { presentTools, type ToolDefinition } from '../presentation/model'

const props = withDefaults(defineProps<{
  tools: readonly ToolDefinition[]; anchor: HTMLElement | null; label: string
  path?: readonly string[]; initialFocus?: 'first' | 'last'
}>(), { path: () => [], initialFocus: 'first' })
const emit = defineEmits<{ select: [path: string[], event: Event]; close: [restoreFocus?: boolean]; tab: [event: KeyboardEvent] }>()
const items = computed(() => presentTools(props.tools, {}))
const active = ref<string>(), childAnchor = ref<HTMLElement | null>(null)
const child = computed(() => items.value.find(item => item.id === active.value && item.disabled !== true))
watch(child, item => { if (!item?.children?.length) active.value = undefined })
function select(item: ToolDefinition, event: Event) {
  const current = presentTools(props.tools, {}).find(tool => tool.id === item.id)
  if (!current || current.disabled === true) return
  if (!current.children) { emit('select', [...props.path, current.id], event); return }
  childAnchor.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  active.value = active.value === current.id && !(event instanceof KeyboardEvent) ? undefined : current.id
}
function openChild(item: ToolDefinition, event: KeyboardEvent) {
  if (!item.children) return
  event.preventDefault(); event.stopPropagation(); select(item, event)
}
function back(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return
  if (event.key !== 'ArrowLeft') return
  event.preventDefault(); event.stopPropagation(); props.anchor?.focus(); emit('close', true)
}
</script>
<template>
  <AnchoredPopup :anchor="anchor" :label="label" width="content" :min-width="174" :max-width="290" popup-class="bt-tool-popup" :initial-focus="initialFocus" @close="emit('close',$event)" @tab="emit('tab',$event)">
    <div class="bt-tool-menu-items" @keydown="back">
      <template v-for="item in items" :key="item.id">
        <div v-if="item.separator" class="bt-menu-divider" role="separator"/>
        <button type="button" role="menuitem" tabindex="-1" :data-tool-command="item.id" :aria-label="item.label" :title="item.label" :disabled="item.disabled === true" :aria-haspopup="item.children?'menu':undefined" :aria-expanded="item.children?active===item.id:undefined" :class="{'is-active':item.active}" @click="select(item,$event)" @keydown.right="openChild(item,$event)">
          <TableIcon v-if="item.display!=='text'" :name="item.icon??'file'" :size="15"/><span>{{item.label}}</span><TableIcon v-if="item.children" class="bt-tool-child-arrow" name="chevron-right" :size="12"/>
        </button>
      </template>
      <ToolMenu v-if="child?.children" :tools="child.children" :anchor="childAnchor" :label="child.label" :path="[...path,child.id]" @select="(path,event)=>emit('select',path,event)" @close="active=undefined" @tab="emit('tab',$event)"/>
    </div>
  </AnchoredPopup>
</template>
<style scoped>
:global(.bt-anchored-popup.bt-tool-popup){padding:5px;border-color:#dfe6ef;box-shadow:0 12px 36px #23395624;font-size:13px;font-weight:400;line-height:normal;color:#334155}.bt-tool-menu-items>button{display:flex;align-items:center;gap:9px;width:100%;padding:9px 10px;border:0;border-radius:5px;background:transparent;color:#334155;text-align:left;font:inherit;cursor:pointer}.bt-tool-menu-items>button>span{flex:1;min-width:0;overflow-wrap:anywhere}.bt-tool-menu-items>button>svg{color:#8190a4;flex-shrink:0}.bt-tool-menu-items>button:hover:not(:disabled),.bt-tool-menu-items>button:focus-visible,.bt-tool-menu-items>button.is-active{background:#eff4ff;color:#245be8}.bt-tool-menu-items>button:disabled{opacity:.4;cursor:default}.bt-tool-menu-items>.bt-menu-divider{background:#edf0f5;margin:5px 4px}.bt-tool-child-arrow{margin-left:auto;flex-shrink:0}
</style>
