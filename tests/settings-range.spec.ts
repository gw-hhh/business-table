import {afterEach,describe,it,expect,vi} from 'vitest'
import {mount,type VueWrapper} from '@vue/test-utils'
import SettingsRange from '../src/features/settings/SettingsRange.vue'
import {numericValidationKey} from '../src/features/settings/numericValidation'

const wrappers:VueWrapper[]=[]
afterEach(()=>{for(const wrapper of wrappers.splice(0))wrapper.unmount()})
describe('bounded settings numbers',()=>{
  it('reports invalid, empty and fractional drafts without changing the last valid value',async()=>{
    const report=vi.fn(),unregister=vi.fn(),wrapper=mount(SettingsRange,{props:{path:['test'],label:'字号',modelValue:14,min:10,max:32},global:{provide:{[numericValidationKey as symbol]:{read:vi.fn(),report,register:vi.fn(),unregister}}}});wrappers.push(wrapper)
    const input=wrapper.get('input[type=number]')
    for(const value of ['99','','14.5']){await input.setValue(value);expect(input.attributes('aria-invalid')).toBe('true')}
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await input.setValue('10');expect(wrapper.emitted('update:modelValue')).toEqual([[10]])
    expect(input.attributes('aria-invalid')).toBe('false')
    wrapper.unmount();expect(unregister).toHaveBeenCalledOnce()
  })
  it('keeps inherited size explicit and clears the override when restored',async()=>{
    const wrapper=mount(SettingsRange,{props:{path:['test'],label:'字号',inheritedValue:16,min:10,max:32}});wrappers.push(wrapper)
    expect(wrapper.get('input[type=number]').element).toHaveProperty('value','16')
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
    await wrapper.get('input[type=range]').setValue('20')
    await wrapper.setProps({modelValue:20})
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[20],[undefined]])
  })
  it('does not emit for disabled controls and updates when the owner restores its value',async()=>{
    const wrapper=mount(SettingsRange,{props:{path:['test'],label:'间距',modelValue:4,min:0,max:24,disabled:true}});wrappers.push(wrapper)
    await wrapper.get('input[type=range]').setValue('12')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.setProps({disabled:false,modelValue:8})
    expect(wrapper.get('input[type=number]').element).toHaveProperty('value','8')
    await wrapper.get('input[type=range]').setValue('24')
    expect(wrapper.emitted('update:modelValue')).toEqual([[24]])
  })
})
