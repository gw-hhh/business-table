<script setup lang="ts">
defineProps<{context:{refresh:()=>void}}>()
</script>
<template><button @click="context.refresh">刷新</button></template>
