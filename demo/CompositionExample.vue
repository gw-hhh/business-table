<script setup lang="ts">
import ComposedTable from '../docs/03-业务模块/01-接入示例/ComposedTable.vue'
</script>
<template><main class="composition-demo"><h1>组件按需组合</h1><p>两个独立实例共用同一套组件；搜索表单、工具栏和分页在表格外部排版。</p><ComposedTable instance-key="assets.first"/><ComposedTable instance-key="assets.second"/></main></template>
<style>.composition-demo{max-width:1160px;margin:24px auto;padding:0 16px;font:14px/1.5 system-ui;color:#334155;display:grid;gap:16px}.composition-demo h1{font-size:22px;margin:0}.composition-demo>p{margin:0;color:#64748b}body{margin:0;background:#f4f7fb}</style>
