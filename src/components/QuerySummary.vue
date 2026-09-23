<script setup lang="ts">
import { ref } from 'vue'
import type { SearchContext } from '../runtime/query'
import TableIcon from './TableIcon.vue'
const props = defineProps<{ context?: SearchContext; hasConditions?: boolean; clear?: () => Promise<void> }>()
const busy = ref(false), error = ref('')
async function perform(id?: string) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    if (id === undefined) await (props.clear ? props.clear() : props.context?.reset())
    else await props.context?.remove(id)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { busy.value = false }
}
</script>

<template>
  <div v-if="context?.summaryItems.length || hasConditions || context?.pending || error" class="bt-search-summary" aria-label="查询条件">
    <div v-if="context?.summaryItems.length || hasConditions" class="bt-query-summary__conditions">
      <span v-for="item in context?.summaryItems ?? []" :key="item.id" class="bt-search-summary__chip">
        <span>{{item.label}}：{{item.displayValue}}</span>
        <button type="button" :aria-label="`移除${item.label}：${item.displayValue}`" :disabled="busy" @click="perform(item.id)"><TableIcon name="close" :size="12" /></button>
      </span>
      <slot />
      <button v-if="(context?.summaryItems.length || hasConditions) && (clear || context)" type="button" class="bt-search-summary__clear" :disabled="busy" @click="perform()">清除条件</button>
    </div>
    <span v-if="context?.pending" class="bt-search-summary__pending">条件已修改，点击查询生效</span>
    <span v-if="error" class="bt-search-summary__error" role="alert">{{error}}</span>
  </div>
</template>

<style scoped>
.bt-search-summary{display:flex;align-items:center;flex-wrap:wrap;gap:12px;min-height:44px;box-sizing:border-box;padding:9px 22px;border-bottom:1px solid #e7ecf3;flex-shrink:0;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif}
.bt-query-summary__conditions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;min-width:0}
.bt-search-summary__chip{display:inline-flex;align-items:center;gap:6px;padding:3px 7px;border:1px solid #e2e9f4;background:#f7f9fd;border-radius:4px;color:#667890;max-width:260px}
.bt-search-summary__chip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-search-summary__chip button{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:32px;height:32px;border:0;background:none;color:#8b9bb0;padding:0;border-radius:5px;cursor:pointer}
.bt-search-summary__clear{height:36px;border:1px solid transparent;background:none;color:#2468e8;padding:0 7px;font:inherit;line-height:1.3;border-radius:5px;cursor:pointer}
.bt-search-summary__chip button:hover:not(:disabled),.bt-search-summary__clear:hover:not(:disabled){background:#eaf0f8;color:#2468e8}
.bt-search-summary button:disabled{cursor:default;opacity:.5}
.bt-search-summary button:focus-visible{outline:2px solid #2468e8;outline-offset:3px}
.bt-search-summary__pending{color:#b7791f}.bt-search-summary__error{color:#b42318}
@media(max-width:640px){.bt-search-summary{padding:9px 13px}}
</style>
