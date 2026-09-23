<script setup lang="ts">
import { ref } from 'vue'
import DialogFrame from '../../ui/DialogFrame.vue'
import TableIcon from '../../components/TableIcon.vue'
import { downloadExport } from './model'
import { createTemplateBook, type TemplateDefinition } from './template'
const props=withDefaults(defineProps<{definition:TemplateDefinition;filename?:string;subtitle?:string;description?:string;note?:string}>(),{filename:'数据模板',subtitle:'使用固定业务字段，不受个人列名称、显示顺序或隐藏列影响。',description:'空白模板包含“数据填写”和“填写说明”；带示例模板另外提供“示例”工作表，不在填写区混入示例数据。',note:'金额和日期有填写说明，选项字段提供下拉选项。此版本仅提供模板下载，尚未提供 Excel 导入。'})
const emit=defineEmits<{close:[];complete:[withExample:boolean]}>(),busy=ref(false),error=ref('')
async function download(withExample:boolean){if(busy.value)return;busy.value=true;error.value='';try{const {writeXlsx,xlsxMime}=await import('./xlsx');downloadExport(writeXlsx(createTemplateBook(props.definition,withExample)),`${props.filename}_${withExample?'带示例':'空白'}.xlsx`,xlsxMime);emit('complete',withExample)}catch(cause){error.value=cause instanceof Error?cause.message:'生成失败，请重试。'}finally{busy.value=false}}
</script>
<template><DialogFrame title="模板下载" :subtitle="subtitle" :busy="busy" class="bt-template-dialog" @close="emit('close')"><div class="bt-template-copy"><p>{{description}}</p><p class="bt-ui-note">{{note}}</p></div><p v-if="error" role="alert" class="bt-ui-error">{{error}}</p><template #footer><button class="bt-ui-button" :disabled="busy" @click="emit('close')">关闭</button><button class="bt-ui-button" :disabled="busy" @click="download(false)"><TableIcon name="download" :size="14"/>空白模板</button><button class="bt-ui-button primary" :disabled="busy" @click="download(true)"><TableIcon name="download" :size="14"/>带示例模板</button></template></DialogFrame></template>
<style>.bt-template-dialog{line-height:normal;width:min(480px,calc(100vw - 32px))}.bt-template-copy{font-size:13px;color:#71819a;line-height:1.95}.bt-template-copy p{margin:0}.bt-template-copy p+p{margin-top:13px}@media(max-width:400px){.bt-template-dialog .bt-dialog-footer{gap:5px}.bt-template-dialog .bt-ui-button{padding:0 9px}}</style>
