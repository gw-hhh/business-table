<script setup lang="ts">
import type { SearchContext } from '../runtime/query'
import QuerySummary from './QuerySummary.vue'
defineProps<{ context: SearchContext }>()
</script>
<template><QuerySummary :context="context" /></template>
