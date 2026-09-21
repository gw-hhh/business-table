<script setup lang="ts">
import type {ViewConfig} from '../types'
defineProps<{context:{views:ViewConfig[];activeId:string|null;apply:(id:string)=>void}}>()
</script>
<template><div v-if="context.views.length"><select :value="context.activeId??''" aria-label="视图" @change="e=>context.apply((e.target as HTMLSelectElement).value)"><option value="">视图</option><option v-for="view in context.views" :key="view.id" :value="view.id">{{view.name}}</option></select></div></template>
