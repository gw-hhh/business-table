import {afterEach,beforeAll,afterAll,describe,expect,it} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {reactive} from 'vue'
import ColumnSettings from '../src/components/ColumnSettings.vue'
import {guardColumnPatch} from '../src/config/columns'
import {columnTextCss} from '../src/components/settingsTypes'
import type {ColumnConfig,ColumnTextStyle,UserColumnConfig} from '../src/types'

const wrappers:VueWrapper[]=[]
// JSDOM does not implement the browser top layer. Browser tests cover real modality.
const methods=new Map<string,PropertyDescriptor|undefined>()
beforeAll(()=>{
  for(const method of ['showModal','close']){
    methods.set(method,Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,method))
    Object.defineProperty(HTMLDialogElement.prototype,method,{configurable:true,value:function(this:HTMLDialogElement){
      if(method==='showModal')this.setAttribute('open','');else this.removeAttribute('open')
    }})
  }
})
afterAll(()=>{for(const [method,descriptor] of methods){if(descriptor)Object.defineProperty(HTMLDialogElement.prototype,method,descriptor);else delete (HTMLDialogElement.prototype as unknown as Record<string,unknown>)[method]}})
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount());document.body.innerHTML=''})
function setup(mode:'drawer'|'quick'='drawer',lockedStyle=false){
  const saves:Record<string,UserColumnConfig>[]=[]
  const columns:ColumnConfig[]=[
    {id:'id',field:'id',title:'编号',width:180,fixed:'left',configurable:{visible:false,fixed:false,order:false}},
    {id:'name',field:'name',title:'名称',width:220,sortable:true,...(lockedStyle?{configurable:{headerStyle:false,cellStyle:true,rename:true}}:{})},
    {id:'customer',field:'customer',title:'客户',visible:false,width:150},
  ]
  const context=reactive({columns,baseColumns:columns,openMode:mode,closeCount:0,previewRows:[{id:'A1',name:'项目甲',customer:'客户甲'}],close(){context.closeCount++},async patch(){},async apply(value:Record<string,UserColumnConfig>){saves.push(value)}})
  const wrapper=mount(ColumnSettings,{props:{context},attachTo:document.body,global:{stubs:{Teleport:true}}})
  wrappers.push(wrapper)
  return {wrapper,context,saves}
}
const button=(w:VueWrapper,label:string)=>w.findAll('button').find(b=>b.text()===label)!

describe('legacy settings refinement',()=>{
  it('accepts only named font tokens and resolves a controlled CSS fallback stack',()=>{
    const column={id:'name',field:'name',title:'名称'}
    expect(guardColumnPatch(column,{cellStyle:{fontFamily:'yahei'}})).toEqual({cellStyle:{fontFamily:'yahei'}})
    expect(columnTextCss({fontFamily:'yahei'} as unknown as ColumnTextStyle).fontFamily).toContain('Microsoft YaHei')
    expect(guardColumnPatch(column,{cellStyle:{fontFamily:'url(https://bad.example/font)'}})).toEqual({})
    for(const family of ['inherit','sans-serif','serif','monospace'])expect(guardColumnPatch(column,{cellStyle:{fontFamily:family}})).toEqual({cellStyle:{fontFamily:family}})
  })
  it('offers the legacy named fonts without removing existing generic choices',()=>{
    const {wrapper}=setup()
    const options=wrapper.get('select[aria-label="表头文字字体"]').findAll('option').map(o=>o.text())
    for(const name of ['跟随表格','系统字体','微软雅黑','苹方','宋体','等宽字体'])expect(options).toContain(name)
  })
  it('searches fonts, keeps selection in the draft, and commits once on apply',async()=>{
    const {wrapper,saves}=setup()
    const trigger=wrapper.find('button[aria-label="查找表头文字字体"]')
    expect(trigger.exists()).toBe(true)
    await trigger.trigger('click');await flushPromises()
    const modal=wrapper.get('dialog[aria-label="选择字体"]')
    await modal.get('input[aria-label="搜索字体"]').setValue('雅黑')
    expect(modal.findAll('[role="option"]').map(o=>o.text())).toEqual(['微软雅黑'])
    await modal.get('[role="option"]').trigger('click');await flushPromises()
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(wrapper.get('select[aria-label="表头文字字体"]').element).toHaveProperty('value','yahei')
    expect(saves).toEqual([])
    await button(wrapper,'应用').trigger('click');await flushPromises()
    expect(saves).toEqual([{name:{headerStyle:{fontFamily:'yahei'}}}])
  })
  it('closes only font search on Escape and retains the outer drawer and focus',async()=>{
    const {wrapper,context}=setup()
    const trigger=wrapper.find('button[aria-label="查找表头文字字体"]')
    expect(trigger.exists()).toBe(true)
    await trigger.trigger('click');await flushPromises()
    await wrapper.get('input[aria-label="搜索字体"]').setValue('不存在的字体')
    expect(wrapper.text()).toContain('没有匹配的字体')
    await wrapper.get('dialog').trigger('keydown',{key:'Escape'});await flushPromises()
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(context.closeCount).toBe(0)
    expect(document.activeElement).toBe(wrapper.get('select[aria-label="表头文字字体"]').element)
  })
  it('does not open font search when the column style capability is disabled',async()=>{
    const {wrapper}=setup('drawer',true)
    const trigger=wrapper.find('button[aria-label="查找表头文字字体"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.attributes('disabled')).toBeDefined()
    await trigger.trigger('click');expect(wrapper.find('dialog').exists()).toBe(false)
  })
  it('represents inherited color as an empty override instead of a hard-coded hex value',()=>{
    const {wrapper}=setup()
    const field=wrapper.get('input[aria-label="表头文字文字颜色"]')
    expect(field.element).toHaveProperty('value','')
    expect(field.attributes('placeholder')).toBe('跟随默认')
  })
  it('offers eight color presets and choosing one does not apply the table immediately',async()=>{
    const {wrapper,saves}=setup()
    const palette=wrapper.find('[data-color-picker="表头文字"]')
    expect(palette.exists()).toBe(true)
    expect(palette.findAll('[data-color-preset]')).toHaveLength(8)
    await palette.get('button[aria-label="使用深蓝色"]').trigger('click')
    expect(wrapper.get('input[aria-label="表头文字文字颜色"]').element).toHaveProperty('value','#2468e8')
    expect(saves).toEqual([])
    await button(wrapper,'应用').trigger('click');await flushPromises()
    expect(saves).toEqual([{name:{headerStyle:{color:'#2468e8'}}}])
  })
  it('retains invalid color across column switches and blocks apply until corrected',async()=>{
    const {wrapper,saves}=setup()
    await wrapper.get('input[aria-label="显示名称"]').setValue('新名称')
    await wrapper.get('input[aria-label="表头文字文字颜色"]').setValue('#xyz')
    expect(wrapper.get('input[aria-label="表头文字文字颜色"]').attributes('aria-invalid')).toBe('true')
    expect(button(wrapper,'应用').attributes('disabled')).toBeDefined()
    await wrapper.get('button[aria-label="编辑列 客户"]').trigger('click')
    expect(button(wrapper,'应用').attributes('disabled')).toBeDefined()
    await wrapper.get('button[aria-label="编辑列 新名称"]').trigger('click')
    expect(wrapper.get('input[aria-label="表头文字文字颜色"]').element).toHaveProperty('value','#xyz')
    await wrapper.get('input[aria-label="表头文字文字颜色"]').setValue('#167457')
    expect(button(wrapper,'应用').attributes('disabled')).toBeUndefined()
    await button(wrapper,'应用').trigger('click');await flushPromises()
    expect(saves).toEqual([{name:{title:'新名称',headerStyle:{color:'#167457'}}}])
  })
  it('asks before closing a draft containing only an invalid color',async()=>{
    const {wrapper,context,saves}=setup()
    await wrapper.get('input[aria-label="表头文字文字颜色"]').setValue('#invalid')
    await wrapper.get('button[aria-label="关闭表格设置"]').trigger('click')
    expect(context.closeCount).toBe(0)
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    await button(wrapper,'继续编辑').trigger('click')
    expect(wrapper.get('input[aria-label="表头文字文字颜色"]').element).toHaveProperty('value','#invalid')
    expect(saves).toEqual([])
  })
  it('clears an invalid color buffer on restore without writing preferences',async()=>{
    const {wrapper,saves}=setup()
    await wrapper.get('input[aria-label="表头文字文字颜色"]').setValue('#bad-value')
    expect(wrapper.find('[aria-invalid="true"]').exists()).toBe(true)
    await button(wrapper,'恢复此列').trigger('click')
    expect(wrapper.get('input[aria-label="表头文字文字颜色"]').element).toHaveProperty('value','')
    expect(wrapper.find('[aria-invalid="true"]').exists()).toBe(false)
    expect(saves).toEqual([])
  })
  it.each(['#167457','#unfinished'])('refreshes a target color buffer after batch style copy (%s)',async(previous)=>{
    const {wrapper,saves}=setup()
    await wrapper.get('button[aria-label="编辑列 客户"]').trigger('click')
    await wrapper.get('input[aria-label="表头文字文字颜色"]').setValue(previous)
    await wrapper.get('button[aria-label="编辑列 名称"]').trigger('click')
    await wrapper.get('input[aria-label="表头文字文字颜色"]').setValue('#2468e8')
    await wrapper.get('input[aria-label="批量样式 客户"]').setValue(true)
    await button(wrapper,'将当前文字样式应用到勾选列').trigger('click')
    await wrapper.get('button[aria-label="编辑列 客户"]').trigger('click')
    expect(wrapper.get('input[aria-label="表头文字文字颜色"]').element).toHaveProperty('value','#2468e8')
    expect(wrapper.find('[aria-invalid="true"]').exists()).toBe(false)
    expect(saves).toEqual([])
    await button(wrapper,'应用').trigger('click');await flushPromises()
    expect(saves[0].customer.headerStyle).toEqual({color:'#2468e8'})
  })
  it('uses arrows/Home/End for alignment with one tab stop and no early persistence',async()=>{
    const {wrapper,saves}=setup()
    const initial=wrapper.get('button[aria-label="表头文字默认对齐"]')
    await initial.trigger('keydown',{key:'ArrowRight'})
    const left=wrapper.get('button[aria-label="表头文字左对齐"]')
    expect(left.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('button[aria-label="表头文字默认对齐"]').attributes('tabindex')).toBe('-1')
    expect(left.attributes('tabindex')).toBe('0')
    await left.trigger('keydown',{key:'End'})
    const right=wrapper.get('button[aria-label="表头文字右对齐"]')
    expect(right.attributes('aria-pressed')).toBe('true')
    await right.trigger('keydown',{key:'Home'})
    expect(wrapper.get('button[aria-label="表头文字默认对齐"]').attributes('aria-pressed')).toBe('true')
    expect(saves).toEqual([])
  })
  it('has touch move commands that preserve locked positions and stable ids',async()=>{
    const {wrapper,saves}=setup('quick')
    const up=wrapper.find('button[aria-label="上移 客户"]')
    expect(up.exists()).toBe(true)
    await up.trigger('click')
    expect(wrapper.get('button[aria-label="上移 客户"]').attributes('disabled')).toBeDefined()
    await button(wrapper,'确认').trigger('click');await flushPromises()
    expect(saves).toEqual([{customer:{order:1},name:{order:2}}])
  })
})
