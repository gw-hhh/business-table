<script setup lang="ts">
import {defineAsyncComponent} from 'vue'
import type {SearchContext} from '../runtime/query'
import type {SearchPanelContext} from '../features/search/panel'
const TableSearch=defineAsyncComponent(()=>import('./TableSearch.vue'))
defineProps<{panel:SearchPanelContext;context:SearchContext}>()
</script>
<template><div v-if="panel.enabled.value" v-show="panel.visible.value" :id="panel.id.value" class="bt-search-region" role="region" aria-label="搜索区域"><slot :context="context" :panel="panel"><TableSearch :context="context" :panel="panel"/></slot></div></template>
<style>.bt-search-region{display:contents}</style>
