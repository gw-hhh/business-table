<script setup lang="ts">
import { ref } from 'vue'
import TableIcon from '../components/TableIcon.vue'
import { useOverlay } from './useOverlay'
defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ title: string; subtitle?: string; wide?: boolean; drawer?: boolean; busy?: boolean }>(), { busy: false })
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLElement>()
const close = () => { if (!props.busy) emit('close') }
const { keydown } = useOverlay(dialog, close)
</script>
<template>
  <Teleport to="body">
    <div class="bt-dialog-overlay" :class="{'bt-dialog-overlay--drawer': drawer}" @pointerdown.self="close">
      <section ref="dialog" v-bind="$attrs" class="bt-dialog" :class="{ 'bt-dialog--wide': wide, 'bt-dialog--drawer': drawer }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" @keydown="keydown">
        <header class="bt-dialog-header"><div><h2>{{ title }}</h2><p v-if="subtitle">{{ subtitle }}</p></div><div class="bt-dialog-header-actions"><slot name="header-actions"/><button type="button" class="bt-ui-icon" :aria-label="'关闭'+title" :disabled="busy" @click="close"><TableIcon name="close" /></button></div></header>
        <div class="bt-dialog-body"><slot /></div>
        <footer v-if="$slots.footer" class="bt-dialog-footer"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>
<style>
.bt-dialog-overlay{position:fixed;inset:0;z-index:1600;background:rgba(35,55,79,.3);display:flex;align-items:center;justify-content:center;padding:24px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;color:#263248}.bt-dialog-overlay *{box-sizing:border-box}.bt-dialog{width:min(620px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column;background:#fff;border-radius:9px;box-shadow:0 18px 64px #142a3a2e;overflow:hidden;outline:none;animation:bt-dialog-enter .16s ease-out}.bt-dialog--wide{width:min(1040px,100%)}.bt-dialog-header{display:flex;justify-content:space-between;align-items:center;padding:16px 24px;gap:20px;border-bottom:1px solid #e5eaf1;flex-shrink:0}.bt-dialog-header h2{margin:0;font-size:16px;line-height:24px;font-weight:600}.bt-dialog-header p{margin:4px 0 0;color:#64748b;font-size:12px;line-height:18px}.bt-dialog-body{padding:20px 24px;overflow:auto;min-height:0}.bt-dialog-footer{padding:12px 24px;display:flex;justify-content:flex-end;align-items:center;gap:8px;border-top:1px solid #e5eaf1;min-height:60px;flex-shrink:0}.bt-dialog button,.bt-dialog input,.bt-dialog select,.bt-dialog textarea{font:inherit}.bt-ui-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 13px;border:1px solid #d9dfe8;border-radius:6px;background:#fff;color:#526177;cursor:pointer;white-space:nowrap}.bt-ui-button:hover:not(:disabled){border-color:#a7c5f6;color:#2468e8;background:#fafcff}.bt-ui-button.primary{background:#2468e8;color:#fff;border-color:#2468e8}.bt-ui-button.danger{background:#dc4045;color:#fff;border-color:#dc4045}.bt-ui-button.text{background:transparent;border-color:transparent;color:#2468e8;padding:0 7px}.bt-ui-icon{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:0;border-radius:5px;background:transparent;color:#64748b;cursor:pointer}.bt-ui-icon:hover{background:#edf4ff;color:#2468e8}.bt-dialog button:disabled{cursor:not-allowed;opacity:.4}.bt-dialog :focus-visible{outline:2px solid #2468e8;outline-offset:2px}.bt-ui-field{display:flex;flex-direction:column;gap:7px;font-size:13px;color:#526177;min-width:0}.bt-ui-field input,.bt-ui-field select,.bt-ui-field textarea{width:100%;min-width:0;height:36px;border:1px solid #d9dfe8;border-radius:6px;background:#fff;color:#263248;padding:0 10px}.bt-ui-field textarea{height:auto;padding:10px;line-height:1.6;resize:vertical}.bt-ui-field small,.bt-ui-note{font-size:12px;line-height:1.6;color:#64748b}.bt-ui-error{padding:9px 12px;background:#fff3f3;color:#be3544;border:1px solid #f4d9db;border-radius:5px;font-size:13px;line-height:1.6}.bt-ui-check{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:#526177}.bt-ui-check input{accent-color:#2468e8;width:16px;height:16px;margin:0}.bt-ui-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.bt-ui-empty{padding:32px;text-align:center;color:#64748b}.bt-ui-separator{height:1px;margin:16px 0;background:#e5eaf1}.bt-ui-fill{flex:1}.bt-ui-preview-note{padding:8px 12px;border:1px solid #dbe7fb;border-radius:6px;background:#f5f8ff;color:#64748b;font-size:12px}
@media(max-width:640px){.bt-dialog-overlay{padding:12px}.bt-dialog{max-height:calc(100dvh - 24px)}.bt-dialog-body{padding:16px}.bt-dialog-header,.bt-dialog-footer{padding:12px 16px}.bt-ui-grid{grid-template-columns:1fr}}
.bt-dialog-overlay--drawer{padding:0;justify-content:flex-end}.bt-dialog--drawer{width:min(580px,100vw);height:100dvh;max-height:100dvh;border-radius:0;animation:bt-drawer-enter .18s ease-out}.bt-dialog--drawer .bt-dialog-body{flex:1}@keyframes bt-dialog-enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@keyframes bt-drawer-enter{from{transform:translateX(30px);opacity:.5}to{transform:none;opacity:1}}@media(prefers-reduced-motion:reduce){.bt-dialog,.bt-dialog--drawer{animation:none}}@media(max-width:640px){.bt-dialog-overlay--drawer{padding:0}.bt-dialog--drawer{max-height:100dvh}}
.bt-dialog-header-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-shrink:0}
</style>
