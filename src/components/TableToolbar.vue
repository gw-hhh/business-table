<script setup lang="ts">
import ToolStrip from '../features/toolbar/ToolStrip.vue'
import type { ToolDefinition, ToolPreference } from '../features/presentation/model'
defineProps<{context:{tools:readonly ToolDefinition[];layout:Record<string,ToolPreference>;gap:number}}>()
</script>
<template><ToolStrip :tools="context.tools" :layout="context.layout" :gap="context.gap" /></template>
