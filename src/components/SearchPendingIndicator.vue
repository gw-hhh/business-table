<script setup lang="ts">
import '../ui/change-indicator.css'
defineProps<{pending:boolean}>()
</script>
<template><span v-if="pending" class="bt-change-indicator bt-search-pending-indicator" role="img" aria-label="查询条件有未应用的更改" title="条件已修改，点击查询生效"/></template>
