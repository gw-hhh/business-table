<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SearchContext } from '../runtime/query'
import SearchField from './SearchField.vue'
import type {SearchPanelContext} from '../features/search/panel'
import {useMotion} from '../ui/useMotion'

const props = defineProps<{ context: SearchContext & {panel?:SearchPanelContext};panel?:SearchPanelContext }>()
const localExpanded = ref(!props.context.defaultCollapsed)
const panel=computed(()=>props.panel??props.context.panel)
const expanded=computed({get:()=>panel.value?.advanced.value??localExpanded.value,set:value=>{if(panel.value)panel.value.setAdvanced(value);else localExpanded.value=value}})
const motion=useMotion('collapse',()=>panel.value?.animateCollapse.value===true)
const error = ref('')
const primary = computed(() => props.context.items.filter(item => !item.advanced))
const advanced = computed(() => props.context.items.filter(item => item.advanced))

async function perform(action: 'submit' | 'reset') {
  error.value = ''
  try { await props.context[action]() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
}
</script>

<template>
  <form class="bt-search" aria-label="表格查询" @submit.prevent="perform('submit')">
    <div class="bt-search__row">
      <SearchField v-for="item in primary" :key="item.id" :item="item" :context="context" :show-label="context.items.length > 1" @submit="perform('submit')" />
      <button v-if="context.items.length > 1" type="button" @click="perform('reset')">重置</button>
      <button type="submit" class="primary" @click.prevent="perform('submit')">查询</button>
      <button v-if="advanced.length" type="button" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收起' : '展开' }}</button>
    </div>
    <Transition :css="false" @enter="motion.enter" @leave="motion.leave" @enter-cancelled="motion.cancel" @leave-cancelled="motion.cancel"><div v-if="advanced.length" v-show="expanded" :inert="!expanded" class="bt-search__row bt-search__row--advanced">
      <SearchField v-for="item in advanced" :key="item.id" :item="item" :context="context" :show-label="true" @submit="perform('submit')" />
    </div></Transition>
    <p v-if="error" class="bt-search__error" role="alert">{{ error }}</p>
    <p v-else-if="context.pending" class="bt-search__pending">条件已修改，点击查询生效</p>
  </form>
</template>
