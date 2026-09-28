<script setup lang="ts">
import { BusinessTable } from '@company/business-table'
import { columns, rows } from './assets'
</script>

<template>
  <BusinessTable row-key="id" :columns="columns" :data="rows" />
</template>
