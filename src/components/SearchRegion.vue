<script setup lang="ts">
import {defineAsyncComponent} from 'vue'
import type {SearchContext} from '../runtime/query'
import type {SearchPanelContext} from '../features/search/panel'
import {useMotion} from '../ui/useMotion'
const TableSearch=defineAsyncComponent(()=>import('./TableSearch.vue'))
const props=defineProps<{panel:SearchPanelContext;context:SearchContext}>()
const motion=useMotion('collapse',()=>props.panel.animateCollapse.value)
</script>
<template><Transition :css="false" @enter="motion.enter" @leave="motion.leave" @enter-cancelled="motion.cancel" @leave-cancelled="motion.cancel"><div v-if="panel.enabled.value" v-show="panel.visible.value" :id="panel.id.value" class="bt-search-region" :class="{'bt-search-region--animated':panel.animateCollapse.value}" role="region" aria-label="搜索区域" :inert="!panel.visible.value"><slot :context="context" :panel="panel"><TableSearch :context="context" :panel="panel"/></slot></div></Transition></template>
<style>.bt-search-region{display:contents}.bt-search-region--animated{display:block;min-width:0}</style>
