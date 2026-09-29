<script setup lang="ts">
defineProps<{pending:boolean}>()
</script>
<template><span v-if="pending" class="bt-search-pending-indicator" role="img" aria-label="查询条件有未应用的更改" title="条件已修改，点击查询生效"/></template>
<style>
.bt-search-pending-indicator{display:inline-block;flex:0 0 5px;width:5px;height:5px;margin-inline-start:4px;vertical-align:middle;border-radius:50%;background:#f0dca3;box-shadow:0 0 0 1px #bc944826}
</style>
