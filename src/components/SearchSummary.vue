<script setup lang="ts">
import { ref } from 'vue'
import type { SearchContext } from '../runtime/query'
import TableIcon from './TableIcon.vue'
const props = defineProps<{ context: SearchContext }>()
const busy = ref(false), error = ref('')
async function perform(id?: string) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    if (id === undefined) await props.context.reset()
    else {
      const item = props.context.items.find(item => item.id === id)
      if (!item) return
      props.context.setValue(id, item.kind === 'keyword' || item.kind === 'text' || item.kind === 'date' ? ''
        : item.kind === 'number' || item.kind === 'select' && item.operator !== 'in' && item.operator !== 'notIn' ? null : undefined)
      await props.context.submit()
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { busy.value = false }
}
</script>

<template>
  <div v-if="context.summaryItems.length || context.pending || error" class="bt-search-summary" aria-label="查询条件">
    <span v-for="item in context.summaryItems" :key="item.id" class="bt-search-summary__chip">
      <span>{{item.label}}：{{item.displayValue}}</span>
      <button type="button" :aria-label="`移除${item.label}：${item.displayValue}`" :disabled="busy" @click="perform(item.id)"><TableIcon name="close" :size="12" /></button>
    </span>
    <button v-if="context.summaryItems.length" type="button" class="bt-search-summary__clear" :disabled="busy" @click="perform()">清除条件</button>
    <span v-if="context.pending" class="bt-search-summary__pending">条件已修改，点击查询生效</span>
    <span v-if="error" class="bt-search-summary__error" role="alert">{{error}}</span>
  </div>
</template>

<style scoped>
.bt-search-summary{display:flex;align-items:center;flex-wrap:wrap;gap:7px 12px;min-height:44px;box-sizing:border-box;padding:9px 22px;border-bottom:1px solid #e7ecf3;flex-shrink:0;font-size:12px;line-height:17px}
.bt-search-summary__chip{display:inline-flex;align-items:center;gap:6px;padding:3px 7px;border:1px solid #e2e9f4;background:#f7f9fd;border-radius:4px;color:#667890;max-width:260px}
.bt-search-summary__chip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-search-summary__chip button{display:flex;flex-shrink:0;border:0;background:none;color:#8b9bb0;padding:0;cursor:pointer}
.bt-search-summary__clear{border:0;background:none;color:#2468e8;padding:0;font:inherit;cursor:pointer}
.bt-search-summary button:disabled{cursor:default;opacity:.5}
.bt-search-summary button:focus-visible{outline:2px solid #2468e8;outline-offset:3px}
.bt-search-summary__pending{color:#b7791f}.bt-search-summary__error{color:#b42318}
@media(max-width:640px){.bt-search-summary{padding:9px 13px}}
</style>
