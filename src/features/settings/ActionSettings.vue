<script setup lang="ts">
import type { Action } from '../../types'
import { computed } from 'vue'
import { availableActions, type ActionPreference, type RowActionLayout } from '../presentation/model'
import SegmentedControl from '../../ui/SegmentedControl.vue'
import TableIcon from '../../components/TableIcon.vue'
const props = defineProps<{ disabled?:boolean; modelValue: RowActionLayout; actions: readonly Action[] }>()
const emit = defineEmits<{ 'update:modelValue':[value:RowActionLayout] }>()
const localActions=computed(()=>availableActions(props.actions))
const aligns=[{value:'left',label:'左对齐',icon:'align-left'},{value:'center',label:'居中',icon:'align-center'},{value:'right',label:'右对齐',icon:'align-right'}]
const displays=[{value:'text',label:'文字'},{value:'icon-text',label:'图标 + 文字'},{value:'icon',label:'仅图标'}]
function patch(value:Partial<RowActionLayout>){if(props.disabled)return;emit('update:modelValue',{...props.modelValue,...value})}
function change(id:string,value:ActionPreference){patch({items:{...props.modelValue.items,[id]:{...props.modelValue.items[id],...value}}})}
function ordered(){return [...localActions.value].sort((a,b)=>(props.modelValue.items[a.id]?.order??a.order??0)-(props.modelValue.items[b.id]?.order??b.order??0))}
function move(id:string,offset:number){const items=ordered(),index=items.findIndex(item=>item.id===id),target=index+offset;if(index<0||target<0||target>=items.length)return;const [item]=items.splice(index,1);items.splice(target,0,item!);const next={...props.modelValue.items};items.forEach((item,index)=>next[item.id]={...next[item.id],order:index});patch({items:next})}
function moveChild(action:Action,index:number,offset:number){const items=[...(action.children??[])].sort((a,b)=>(props.modelValue.items[a.id]?.order??a.order??0)-(props.modelValue.items[b.id]?.order??b.order??0));const target=index+offset;if(target<0||target>=items.length)return;const [child]=items.splice(index,1);items.splice(target,0,child!);const next={...props.modelValue.items};items.forEach((item,index)=>next[item.id]={...next[item.id],order:index});patch({items:next})}
let dragged=''
function drop(id:string){const items=ordered(),from=items.findIndex(item=>item.id===dragged),to=items.findIndex(item=>item.id===id);if(from>=0&&to>=0)move(dragged,to-from);dragged=''}
</script>
<template>
  <div class="bt-settings-page">
    <section class="bt-settings-section">
      <div class="bt-settings-grid bt-settings-grid--four">
        <label class="bt-settings-field"><span>行内最多显示</span><select aria-label="行内最多显示" :value="modelValue.maxInline" @change="patch({maxInline:Number(($event.target as HTMLSelectElement).value)})"><option :value="0">全部放入更多</option><option v-for="value in [1,2,3,4]" :key="value" :value="value">{{value}} 个按钮</option></select></label>
        <label class="bt-settings-field"><span>默认显示形式</span><select aria-label="默认显示形式" :value="modelValue.display" @change="patch({display:($event.target as HTMLSelectElement).value as RowActionLayout['display']})"><option v-for="item in displays" :key="item.value" :value="item.value">{{item.label}}</option></select></label>
        <div class="bt-settings-field"><span>按钮对齐</span><SegmentedControl :model-value="modelValue.align" label="按钮" :options="aligns" @update:model-value="patch({align:$event as RowActionLayout['align']})" /></div>
        <label class="bt-settings-field"><span>按钮间距</span><select aria-label="按钮间距" :value="modelValue.gap" @change="patch({gap:Number(($event.target as HTMLSelectElement).value)})"><option v-for="gap in [4,8,12,16,20,24]" :key="gap" :value="gap">{{gap}} px</option></select></label>
      </div><label class="bt-settings-check"><input type="checkbox" :checked="modelValue.grouped" @change="patch({grouped:($event.target as HTMLInputElement).checked})">更多菜单按普通、导出、危险操作分组</label><p class="bt-settings-note">列宽不足时，末尾按钮自动放入“更多”。隐藏按钮不改变用户权限。</p>
    </section>
    <section class="bt-settings-section"><div class="bt-settings-section__heading"><h4>按钮及顺序</h4></div>

      <div v-for="(action,index) in ordered()" :key="action.id" class="bt-action-setting" :data-action-setting="action.id" @dragover.prevent @drop.prevent="drop(action.id)">
        <div class="bt-action-setting__row">
          <button type="button" :draggable="!disabled" :disabled="disabled" class="bt-settings-icon" :aria-label="'拖动操作 '+action.label" @dragstart="dragged=action.id"><TableIcon name="grip" :size="12"/></button>
          <label class="bt-settings-field"><span>按钮名称</span><input :aria-label="action.label+'按钮名称'" :value="modelValue.items[action.id]?.label??action.label" :disabled="action.danger" maxlength="80" @input="change(action.id,{label:($event.target as HTMLInputElement).value})"></label>
          <label class="bt-settings-field"><span>显示位置</span><select :aria-label="action.label+'显示位置'" :value="modelValue.items[action.id]?.position??action.position??'inline'" @change="change(action.id,{position:($event.target as HTMLSelectElement).value as ActionPreference['position']})"><option value="inline">行内显示</option><option value="more">放入更多</option><option value="hidden">隐藏</option></select></label>
          <label class="bt-settings-field"><span>显示形式</span><select :aria-label="action.label+'显示形式'" :value="modelValue.items[action.id]?.display??'inherit'" @change="change(action.id,{display:($event.target as HTMLSelectElement).value as ActionPreference['display']})"><option value="inherit">跟随默认</option><option v-for="item in displays" :key="item.value" :value="item.value">{{item.label}}</option></select></label>
          <label class="bt-settings-field"><span>菜单分组</span><select :aria-label="action.label+'菜单分组'" :disabled="action.danger" :value="action.danger?'danger':modelValue.items[action.id]?.group??action.group??(action.children?'export':'normal')" @change="change(action.id,{group:($event.target as HTMLSelectElement).value as ActionPreference['group']})"><option value="normal">普通操作</option><option value="export">导出操作</option><option value="danger">危险操作</option></select></label>
          <div class="bt-setting-moves"><button v-for="offset in [-1,1]" :key="offset" class="bt-settings-icon" :aria-label="(offset<0?'上移 ':'下移 ')+action.label" :disabled="index+offset<0||index+offset>=localActions.length" @click="move(action.id,offset)"><TableIcon :name="offset<0?'chevron-up':'chevron-down'" :size="12"/></button></div>
        </div>
        <label class="bt-settings-check bt-action-setting__separator"><input type="checkbox" :checked="modelValue.items[action.id]?.separator??action.separator??false" @change="change(action.id,{separator:($event.target as HTMLInputElement).checked})">此按钮前加分隔线</label>
        <div v-if="action.children" class="bt-action-setting__children"><span class="bt-settings-note">二级菜单</span><div v-for="(child,childIndex) in [...action.children].sort((a,b)=>(modelValue.items[a.id]?.order??a.order??0)-(modelValue.items[b.id]?.order??b.order??0))" :key="child.id"><label class="bt-settings-check"><input type="checkbox" :aria-label="'显示子菜单 '+child.label" :checked="modelValue.items[child.id]?.position!=='hidden'" @change="change(child.id,{position:($event.target as HTMLInputElement).checked?'more':'hidden'})">{{child.label}}</label><div class="bt-setting-moves"><button v-for="offset in [-1,1]" :key="offset" class="bt-settings-icon" :aria-label="(offset<0?'上移子菜单 ':'下移子菜单 ')+child.label" :disabled="childIndex+offset<0||childIndex+offset>=action.children.length" @click="moveChild(action,childIndex,offset)"><TableIcon :name="offset<0?'chevron-up':'chevron-down'" :size="12"/></button></div></div></div>
        <p v-if="action.danger" class="bt-settings-note bt-settings-warning">删除保留原名称、危险色和确认提示。</p>
      </div>
    </section>
  </div>
</template>
