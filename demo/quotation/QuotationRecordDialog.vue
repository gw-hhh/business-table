<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DialogFrame from '../../src/ui/DialogFrame.vue'
import TableIcon from '../../src/components/TableIcon.vue'
import { readRichDocument, richText, type RichDocument } from '../../src/features/rich-text/document'
import { renderRichDocument } from '../../src/features/rich-text/render'
import { cloneData } from '../../src/runtime/value'
import { createQuotationDraft, normalizeQuotation, quotationRegions, quotationStatuses, type Quotation } from './model'
const RichEditor=defineAsyncComponent(()=>import('../../src/features/rich-text/RichEditor.vue'))
const props=defineProps<{mode:'new'|'edit'|'copy'|'view';row?:Quotation;rows:Quotation[];save:(row:Quotation)=>void|Promise<void>}>()
const emit=defineEmits<{close:[];saved:[row:Quotation]}>()
const mode=ref(props.mode),draft=ref<Quotation>(makeDraft()),amount=ref(props.mode==='new'?'':draft.value.amount.toFixed(2)),error=ref(''),busy=ref(false),discard=ref(false),richOpen=ref(false),richDraft=ref<RichDocument>({ops:[]}),errorElement=ref<HTMLElement>()
function makeDraft(){return props.row&&props.mode!=='copy'?cloneData(props.row):createQuotationDraft(props.mode==='copy'?props.row:undefined,props.rows)}
const signature=()=>JSON.stringify({row:draft.value,amount:amount.value})
let original=signature()
const dirty=computed(()=>mode.value!=='view'&&signature()!==original)
const title=computed(()=>({new:'新增报价',copy:'复制报价',edit:'修改报价',view:'报价详情'})[mode.value])
const subtitle=computed(()=>mode.value==='edit'||mode.value==='view'?draft.value.id:'填写报价信息，保存后生成编号。')
const customers=computed(()=>[...new Set(props.rows.map(row=>row.customer))].sort((a,b)=>a.localeCompare(b,'zh-CN')))
const owners=computed(()=>[...new Set(['林予安',...props.rows.map(row=>row.owner)])].sort((a,b)=>a.localeCompare(b,'zh-CN')))
const regions=computed(()=>[...new Set([...quotationRegions,...(draft.value.region?[draft.value.region]:[])])])
const statuses=computed(()=>[...new Set([...quotationStatuses,draft.value.status])])
const detailFields=computed(()=>[['报价编号',draft.value.id],['客户',draft.value.customer],['负责人',draft.value.owner],['大区',draft.value.region],['创建日期',draft.value.createdAt],['有效期至',draft.value.date]])
const money=(value:number)=>new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)
const Note=defineComponent({setup:()=>()=>draft.value.notesRich?renderRichDocument(draft.value.notesRich,undefined,true):draft.value.notes||'暂无备注'})
function requestClose(){if(busy.value)return;if(dirty.value)discard.value=true;else emit('close')}
function changeMode(next:'edit'|'copy'){mode.value=next;if(next==='copy')draft.value=createQuotationDraft(draft.value,props.rows);amount.value=draft.value.amount.toFixed(2);original=signature();error.value='';void nextTick(()=>document.querySelector<HTMLInputElement>('.q-record-dialog input[autofocus]')?.focus())}
function openRich(){richDraft.value=readRichDocument(draft.value.notesRich??{ops:[{insert:draft.value.notes}]},{maxChars:1000});richOpen.value=true}
function saveRich(){draft.value.notesRich=readRichDocument(richDraft.value,{maxChars:1000});draft.value.notes=richText(draft.value.notesRich);richOpen.value=false}
function plainNotes(){delete draft.value.notesRich}
async function submit(){
  if(busy.value||mode.value==='view')return
  error.value=''
  try{
    if(!/^\d{1,11}(?:\.\d{1,2})?$/.test(amount.value.trim()))throw new Error('请输入非负金额，最多保留两位小数。')
    const value=normalizeQuotation({...draft.value,amount:Number(amount.value),...((mode.value==='new'||mode.value==='copy')?{id:createQuotationDraft(undefined,props.rows).id}:{})},true)
    busy.value=true;await props.save(value);original=signature();emit('saved',value);emit('close')
  }catch(cause){error.value=cause instanceof Error?cause.message:'保存失败，请稍后重试。';await nextTick();errorElement.value?.focus();errorElement.value?.scrollIntoView?.({block:'nearest'})}
  finally{busy.value=false}
}
function hotkey(event:KeyboardEvent){if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();void submit()}}
function beforeUnload(event:BeforeUnloadEvent){if(dirty.value){event.preventDefault();event.returnValue=''}}
watch(()=>[props.mode,props.row],()=>{mode.value=props.mode;draft.value=makeDraft();amount.value=props.mode==='new'?'':draft.value.amount.toFixed(2);original=signature();error.value=''})
onMounted(()=>window.addEventListener('beforeunload',beforeUnload))
onBeforeUnmount(()=>window.removeEventListener('beforeunload',beforeUnload))
</script>
<template>
  <DialogFrame class="q-record-dialog" :title="title" :subtitle="subtitle" drawer :busy="busy" @close="requestClose">
    <template v-if="mode==='view'"><section class="q-record-hero"><h3>{{draft.name}}</h3><p>{{draft.customer}}</p><div class="q-record-amount"><div><small>含税金额（元）</small><strong>¥ {{money(draft.amount)}}</strong></div><span class="q-record-status" :class="{'contract':draft.status==='已转合同','review':draft.status==='评审中'}">{{draft.status}}</span></div></section><h3 class="q-record-section">基本信息</h3><dl class="q-record-detail"><div v-for="[label,value] in detailFields" :key="label"><dt>{{label}}</dt><dd>{{value}}</dd></div></dl><h3 class="q-record-section q-record-section--gap">备注</h3><div class="q-record-notes"><Note/></div></template>
    <form v-else id="quotation-editor" class="q-record-form" novalidate @submit.prevent="submit" @keydown="hotkey"><p v-if="error" ref="errorElement" tabindex="-1" class="bt-ui-error" role="alert">{{error}}</p><fieldset :disabled="busy"><h3 class="q-record-section">基本信息</h3><div class="q-record-grid">
      <label class="q-record-field q-record-wide">报价编号<input :value="mode==='edit'?draft.id:'保存后自动生成'" readonly/></label>
      <label class="q-record-field q-record-wide"><span><b>*</b>项目名称</span><input v-model="draft.name" aria-label="项目名称" autofocus required maxlength="100" placeholder="请输入项目名称"/></label>
      <label class="q-record-field"><span><b>*</b>客户</span><input v-model="draft.customer" aria-label="客户" list="q-record-customers" required maxlength="60" placeholder="输入或选择客户"/></label>
      <label class="q-record-field"><span><b>*</b>负责人</span><input v-model="draft.owner" aria-label="负责人" list="q-record-owners" required maxlength="40" placeholder="输入或选择负责人"/></label>
      <label class="q-record-field"><span><b>*</b>大区</span><select v-model="draft.region" aria-label="大区"><option value="">请选择大区</option><option v-for="region in regions" :key="region">{{region}}</option></select></label>
      <label class="q-record-field">状态<select v-model="draft.status" aria-label="状态"><option v-for="status in statuses" :key="status">{{status}}</option></select></label>
    </div><h3 class="q-record-section q-record-section--gap">报价信息</h3><div class="q-record-grid">
      <label class="q-record-field q-record-wide"><span><b>*</b>含税金额（元）</span><input v-model="amount" aria-label="含税金额（元）" inputmode="decimal" maxlength="14" placeholder="0.00" required/><small>最多保留两位小数。</small></label>
      <label class="q-record-field">创建日期<input v-model="draft.createdAt" aria-label="创建日期" type="date" readonly/></label>
      <label class="q-record-field"><span><b>*</b>有效期至</span><input v-model="draft.date" aria-label="有效期至" type="date" :min="draft.createdAt" required/></label>
      <div class="q-record-field q-record-wide"><label for="q-record-notes">备注</label><textarea id="q-record-notes" v-model="draft.notes" maxlength="1000" placeholder="补充报价说明（选填）" @input="plainNotes"/><small>{{draft.notes.length}} / 1000</small><button type="button" class="bt-ui-button" @click="openRich"><TableIcon name="edit" :size="14"/>富文本编辑</button><small v-if="draft.notesRich">已保留富文本样式；直接修改纯文本会在保存时替换样式。</small></div>
    </div></fieldset><datalist id="q-record-customers"><option v-for="customer in customers" :key="customer" :value="customer"/></datalist><datalist id="q-record-owners"><option v-for="owner in owners" :key="owner" :value="owner"/></datalist></form>
    <template #footer><template v-if="mode==='view'"><button class="bt-ui-button" @click="requestClose">关闭</button><button class="bt-ui-button" @click="changeMode('copy')"><TableIcon name="copy" :size="14"/>复制报价</button><button class="bt-ui-button primary" @click="changeMode('edit')"><TableIcon name="edit" :size="14"/>修改报价</button></template><template v-else><span class="q-record-footer-note">Ctrl / ⌘ + Enter 保存</span><button class="bt-ui-button" :disabled="busy" @click="requestClose">取消</button><button class="bt-ui-button primary" :disabled="busy" type="submit" form="quotation-editor">{{busy?'正在保存…':'保存报价'}}</button></template></template>
  </DialogFrame>
  <DialogFrame v-if="discard" class="q-record-confirm" title="放弃修改？" @close="discard=false"><p>还有未保存的内容，关闭后不会保留。</p><template #footer><button class="bt-ui-button" @click="discard=false">取消</button><button class="bt-ui-button danger" @click="emit('close')">放弃修改</button></template></DialogFrame>
  <DialogFrame v-if="richOpen" title="编辑备注" wide @close="richOpen=false"><RichEditor v-model="richDraft" label="备注内容" :max-chars="1000"/><template #footer><button class="bt-ui-button" @click="richOpen=false">取消</button><button class="bt-ui-button primary" @click="saveRich">保存</button></template></DialogFrame>
</template>
<style>
.q-record-dialog{line-height:normal}.q-record-dialog .bt-dialog-header{padding:16px 24px;align-items:flex-start;gap:12px}.q-record-dialog .bt-dialog-header h2{font-size:16px;line-height:24px}.q-record-dialog .bt-dialog-header p{margin-top:4px;color:#64748b;line-height:18px}.q-record-dialog .bt-dialog-body{padding:20px 24px}.q-record-dialog .bt-dialog-footer{padding:12px 24px;gap:9px;background:#fcfdff}.q-record-form fieldset{border:0;margin:0;padding:0;min-width:0}.q-record-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px 16px}.q-record-field{display:flex;flex-direction:column;gap:7px;min-width:0;font-size:13px;color:#526177}.q-record-wide{grid-column:1/-1}.q-record-field input,.q-record-field select,.q-record-field textarea{width:100%;height:36px;border:1px solid #d9dfe8;border-radius:6px;background:#fff;padding:0 10px;color:#526681;font:inherit;font-size:14px;line-height:normal}.q-record-field textarea{min-height:108px;resize:vertical;padding:10px;line-height:1.7}.q-record-field input[readonly]{color:#9aa5b7;background:#f8fafd}.q-record-field b{color:#e2676c;font-weight:400}.q-record-field small{color:#64748b;font-size:12px;line-height:1.6}.q-record-field>.bt-ui-button{align-self:flex-start}.q-record-section{margin:3px 0 14px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#263248}.q-record-section:before{content:"";width:3px;height:12px;background:#8db4f4;border-radius:2px}.q-record-section--gap{margin-top:30px;padding-top:22px;border-top:1px solid #e8edf4}.q-record-footer-note{margin-right:auto;color:#64748b;font-size:12px}.q-record-hero{background:#f5f8fd;border:1px solid #e7edf7;border-radius:8px;padding:20px;margin-bottom:25px}.q-record-hero h3{margin:0;font-size:16px;font-weight:600;line-height:1.7;overflow-wrap:anywhere}.q-record-hero>p{color:#8b99ae;font-size:12px;margin:5px 0 0}.q-record-amount{display:flex;justify-content:space-between;align-items:center;margin-top:20px;gap:15px}.q-record-amount strong{font-size:27px;font-weight:600;letter-spacing:-.5px;font-variant-numeric:tabular-nums}.q-record-amount small{display:block;color:#97a4b6;font-size:11px;margin-bottom:4px}.q-record-status{background:#f0f3f7;color:#7f8da0;border-radius:4px;padding:4px 9px;font-size:11px}.q-record-status.contract{color:#2c956d;background:#e6f6ee}.q-record-status.review{color:#4683d1;background:#eaf2ff}.q-record-detail{display:grid;grid-template-columns:1fr 1fr;gap:23px 18px;margin:0}.q-record-detail dt{color:#92a0b3;font-size:12px;margin-bottom:7px}.q-record-detail dd{margin:0;font-size:13px;color:#435775;overflow-wrap:anywhere;line-height:1.65}.q-record-notes{font-size:13px;white-space:pre-wrap;color:#687a93;overflow-wrap:anywhere;line-height:1.9}.q-record-notes p{margin:0}.q-record-confirm{width:min(480px,calc(100vw - 32px))}.q-record-confirm .bt-dialog-body>p{font-size:13px;line-height:1.9;color:#65768f}.q-record-form>.bt-ui-error{margin:0 0 18px}@media(max-width:760px){.q-record-grid{gap:18px 13px}.q-record-footer-note{display:none}}@media(max-width:380px){.q-record-grid,.q-record-detail{grid-template-columns:1fr}}
</style>
