<script setup lang="ts">
import type { Appearance } from '../presentation/model'
import FontSelect from '../../components/FontSelect.vue'
import ColorSelect from '../../components/ColorSelect.vue'
import TableIcon from '../../components/TableIcon.vue'
import SettingsSection from './SettingsSection.vue'
const props = defineProps<{ disabled?:boolean; modelValue: Appearance; pageSizes?: number[] }>()
const emit = defineEmits<{ 'update:modelValue':[value:Appearance]; backup:[]; restore:[] }>()
function patch(value: Partial<Appearance>) { if(props.disabled)return;emit('update:modelValue', { ...props.modelValue, ...value }) }
</script>
<template>
  <div class="bt-settings-page">
    <SettingsSection title="默认文字" :disabled="disabled">
      <div class="bt-settings-grid bt-settings-grid--three">
        <label class="bt-settings-field"><span>字体</span><FontSelect :model-value="modelValue.fontFamily" label="表格默认" @update:model-value="patch({fontFamily:($event||'system') as Appearance['fontFamily']})" /></label>
        <label class="bt-settings-field"><span>内容字号</span><select aria-label="内容字号" :value="modelValue.fontSize" @change="patch({fontSize:Number(($event.target as HTMLSelectElement).value)})"><option v-for="size in [12,13,14,15,16,17,18,19,20,22,24,28,32]" :key="size" :value="size">{{size}} px</option></select></label>
        <label class="bt-settings-field"><span>表头字号</span><select aria-label="表头字号" :value="modelValue.headerFontSize" @change="patch({headerFontSize:Number(($event.target as HTMLSelectElement).value)})"><option v-for="size in [12,13,14,15,16,17,18,19,20,22,24,28,32]" :key="size" :value="size">{{size}} px</option></select></label>
        <div class="bt-settings-field"><span>内容颜色</span><ColorSelect :model-value="modelValue.color" label="表格内容" @update:model-value="patch({color:$event||'#334155'})" /></div>
        <div class="bt-settings-field"><span>表头颜色</span><ColorSelect :model-value="modelValue.headerColor" label="表格表头" @update:model-value="patch({headerColor:$event||'#334155'})" /></div>
      </div><p class="bt-settings-note">单列设置优先于这里的默认值。字体未安装时，使用本机可用的后备字体。</p>
    </SettingsSection>
    <SettingsSection title="布局" :disabled="disabled">
      <div class="bt-settings-grid bt-settings-grid--three">
        <label class="bt-settings-field"><span>行高</span><select aria-label="表格行高" :value="modelValue.density" @change="patch({density:($event.target as HTMLSelectElement).value as Appearance['density']})"><option value="compact">紧凑</option><option value="default">默认</option><option value="comfortable">宽松</option></select></label>
        <label class="bt-settings-field"><span>表格边框</span><select aria-label="表格边框" :value="modelValue.border" @change="patch({border:($event.target as HTMLSelectElement).value as Appearance['border']})"><option value="horizontal">仅横线</option><option value="full">完整边框</option><option value="none">无边框</option></select></label>
        <label class="bt-settings-field"><span>每页条数</span><select aria-label="默认每页条数" :value="modelValue.pageSize" @change="patch({pageSize:Number(($event.target as HTMLSelectElement).value)})"><option v-for="size in pageSizes??[10,25,50,100]" :key="size" :value="size">{{size}} 条</option></select></label>
      </div><div class="bt-settings-inline"><label v-for="option in ([{key:'stripe',label:'斑马纹'},{key:'index',label:'显示序号'},{key:'hover',label:'悬停高亮'}] as const)" :key="option.key" class="bt-settings-check"><input type="checkbox" :aria-label="option.label" :checked="modelValue[option.key]" @change="patch({[option.key]:($event.target as HTMLInputElement).checked})">{{option.label}}</label></div>
    </SettingsSection>
    <SettingsSection title="设置备份" :disabled="disabled"><p class="bt-settings-note">只包含列、排序、按钮和外观设置，不包含业务数据。恢复后仍需点击应用。</p><div class="bt-settings-inline"><button class="bt-ui-button" type="button" @click="emit('backup')"><TableIcon name="download" :size="14" />导出设置</button><button class="bt-ui-button" type="button" @click="emit('restore')"><TableIcon name="upload" :size="14" />恢复设置</button></div></SettingsSection>
  </div>
</template>
