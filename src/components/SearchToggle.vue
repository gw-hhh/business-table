<script setup lang="ts">
import type {SearchPanelContext} from '../features/search/panel'
import TableIcon from './TableIcon.vue'
defineProps<{panel:SearchPanelContext}>()
</script>
<template><button v-if="panel.enabled.value" type="button" class="bt-search-toggle" :aria-controls="panel.id.value" :aria-expanded="panel.visible.value" aria-label="显示或隐藏搜索" @click="panel.toggle"><TableIcon name="search"/><slot>{{panel.visible.value?'隐藏搜索':'显示搜索'}}</slot></button></template>
