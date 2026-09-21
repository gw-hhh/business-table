<script setup lang="ts">
defineProps<{context:{draft:string;submit:()=>void}}>()
</script>
<template><input v-model="context.draft" class="bt__search" placeholder="搜索当前数据" @keyup.enter="context.submit"><button class="primary" @click="context.submit">查询</button></template>
