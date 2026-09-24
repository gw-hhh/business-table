<script setup lang="ts">
import {useId} from 'vue'
import TableIcon from '../../components/TableIcon.vue'

defineProps<{title:string;description?:string;disabled?:boolean}>()
const open=defineModel<boolean>('open',{default:true})
const bodyId=useId()
</script>

<template>
  <section class="bt-settings-section bt-settings-disclosure" :class="{'is-collapsed':!open}">
    <header class="bt-settings-disclosure__heading">
      <h4 :aria-label="title"><button type="button" :aria-label="(open?'收起':'展开')+title" :aria-expanded="open" :aria-controls="bodyId" @click="open=!open">
        <TableIcon name="chevron-down" :size="14" class="bt-settings-disclosure__chevron" />
        <span>{{title}}<small v-if="description">{{description}}</small></span>
        <span class="bt-settings-disclosure__state">{{open?'收起':'展开'}}</span>
      </button></h4>
      <slot name="actions" />
    </header>
    <fieldset v-show="open" :id="bodyId" class="bt-settings-disclosure__body bt-settings-control-group" :disabled="disabled">
      <slot />
    </fieldset>
  </section>
</template>

<style>
.bt-settings-disclosure__heading{display:flex;align-items:center;gap:10px;margin-bottom:8px;min-height:26px}
.bt-settings-disclosure.is-collapsed>.bt-settings-disclosure__heading{margin-bottom:0}
.bt-settings-disclosure__heading>h4{flex:1;min-width:0;margin:0}
.bt-settings-disclosure__heading>h4>button{display:flex;align-items:center;gap:7px;width:100%;min-width:0;padding:3px 0;border:0;background:transparent;color:#29384e;font:inherit;font-size:14px;font-weight:600;text-align:left;white-space:normal;cursor:pointer}
.bt-settings-disclosure__heading small{display:block;margin-top:3px;color:#64748b;font-size:12px;line-height:18px;font-weight:400}
.bt-settings-disclosure__state{margin-left:auto;flex-shrink:0;color:#2468e8;font-size:12px;font-weight:400}
.bt-settings-disclosure__chevron{flex-shrink:0;transition:transform .15s;color:#8290a5}
.bt-settings-disclosure.is-collapsed>.bt-settings-disclosure__heading .bt-settings-disclosure__chevron{transform:rotate(-90deg)}
.bt-settings-disclosure__body{padding:0;min-width:0}
.bt-settings-disclosure .bt-settings-disclosure__heading h4{margin:0}
@media(prefers-reduced-motion:reduce){.bt-settings-disclosure__chevron{transition:none}}
</style>
