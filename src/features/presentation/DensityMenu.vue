<script setup lang="ts">
import { ref } from 'vue'
import TableIcon from '../../components/TableIcon.vue'
import AnchoredPopup from '../../ui/AnchoredPopup.vue'
import type { ToolDefinition } from './model'
defineProps<{ value: 'compact' | 'default' | 'comfortable'; tool: ToolDefinition; inMenu?: boolean }>()
const emit = defineEmits<{ change: [value: 'compact' | 'default' | 'comfortable'] }>()
const anchor = ref<HTMLElement | null>(null), opened = ref(false), initialFocus=ref<'first'|'last'>('first')
const options = [{ id: 'compact', label: '紧凑' }, { id: 'default', label: '默认' }, { id: 'comfortable', label: '宽松' }] as const
function open(event: Event) { initialFocus.value=event instanceof KeyboardEvent&&event.key==='ArrowUp'?'last':'first'; anchor.value = event.currentTarget as HTMLElement; opened.value = !opened.value }
function choose(value: 'compact' | 'default' | 'comfortable') { emit('change', value); opened.value = false; anchor.value?.focus() }
defineExpose({open})
</script>
<template>
  <button :class="tool.display==='icon'?'bt__icon-button':'bt-ui-button'" :title="tool.label" :aria-label="tool.label" :role="inMenu?'menuitem':undefined" :tabindex="inMenu?-1:undefined" :disabled="tool.disabled" :aria-expanded="opened" aria-haspopup="menu" @click="open" @keydown.down.prevent.stop="open" @keydown.up.prevent.stop="open"><TableIcon v-if="tool.display!=='text'" :name="tool.icon??'density'"/><span v-if="tool.display!=='icon'">{{tool.label}}</span></button>
  <AnchoredPopup v-if="opened" :anchor="anchor" :width="144" :initial-focus="initialFocus" label="行高密度" @close="opened=false"><button v-for="option in options" :key="option.id" class="bt-menu-command" role="menuitemradio" tabindex="-1" :aria-checked="value===option.id" @click="choose(option.id)"><TableIcon v-if="value===option.id" name="check"/><span v-else style="width:16px"/>{{option.label}}</button></AnchoredPopup>
</template>
