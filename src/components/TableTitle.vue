<script setup lang="ts">
defineProps<{context:{label:string;total:number}}>()
</script>
<template><div><span class="bt__title">{{context.label}}</span><span class="bt__status"> · {{context.total}} 条</span></div></template>
