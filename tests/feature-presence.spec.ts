import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import FeatureHost from '../src/components/FeatureHost.vue'
import DialogFrame from '../src/ui/DialogFrame.vue'
import ColumnSettings from '../src/components/ColumnSettings.vue'
import {allColumnCapabilities,fullSettingsPolicy} from './fixtures/settings'

const wrappers:VueWrapper[]=[],finishers:(()=>void)[]=[]
const animated:{element:Element;frames:Keyframe[]|PropertyIndexedKeyframes}[]=[]
const original=Object.getOwnPropertyDescriptor(Element.prototype,'animate')
beforeEach(()=>{
  Object.defineProperty(Element.prototype,'animate',{configurable:true,value(this:Element,frames:Keyframe[]|PropertyIndexedKeyframes){
    animated.push({element:this,frames})
    let finish=()=>{};const finished=new Promise<void>(resolve=>{finish=resolve});finishers.push(finish)
    return {finished,cancel:finish}
  }})
})
afterEach(()=>{
  wrappers.splice(0).forEach(wrapper=>wrapper.unmount());finishers.splice(0).forEach(finish=>finish())
  if(original)Object.defineProperty(Element.prototype,'animate',original);else Reflect.deleteProperty(Element.prototype,'animate')
  document.body.replaceChildren();document.body.style.overflow='';animated.length=0
})
async function finish(){finishers.splice(0).forEach(done=>done());await flushPromises()}
function setupHost(){
  let sessions=0,disposed=0
  const feature=defineComponent({props:{open:Boolean},emits:['afterLeave'],setup(props,{emit}){
    const session=++sessions
    return()=>h(DialogFrame,{open:props.open,title:'设置',onAfterLeave:()=>emit('afterLeave')},{default:()=>h('input',{'aria-label':'会话',value:String(session)})})
  }})
  const wrapper=mount(FeatureHost,{attachTo:document.body,props:{local:true,defaultStrategy:'on-interaction',entryLabel:'打开设置',deferClose:true,createContext:(_details,controls)=>{controls.onDispose(()=>disposed++);return {}},loader:async()=>({default:feature})},global:{stubs:{transition:false}}})
  wrappers.push(wrapper)
  return {wrapper,sessions:()=>sessions,disposed:()=>disposed}
}

it('does not pass presence listeners to fragment features that did not opt into deferred close',async()=>{
  const warnings:string[]=[]
  const feature=defineComponent({props:{context:Object},render(){return [h('span','区域汇总'),h('span','复制区域')]}})
  const wrapper=mount(FeatureHost,{attachTo:document.body,props:{local:true,defaultStrategy:'on-interaction',entryLabel:'打开区域',createContext:()=>({}),loader:async()=>({default:feature})},global:{config:{warnHandler:message=>warnings.push(message)}}})
  wrappers.push(wrapper)
  await wrapper.get('button').trigger('click');await flushPromises()
  expect(wrapper.text()).toContain('区域汇总')
  expect(warnings).toEqual([])
  await wrapper.get('button').trigger('click');await flushPromises()
  expect(wrapper.text()).not.toContain('区域汇总')
})

it('retains the current session during leave and creates a new one only after a completed close',async()=>{
  const x=setupHost();await x.wrapper.get('button').trigger('click');await flushPromises();await finish()
  await x.wrapper.get('button').trigger('click')
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  await finish()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  await x.wrapper.get('button').trigger('click');await flushPromises();await finish()
  expect(x.sessions()).toBe(2)
  expect(x.disposed()).toBe(0)
})

it('starts a fresh session when reopened during leave and removes it when permission is revoked',async()=>{
  const x=setupHost();await x.wrapper.get('button').trigger('click');await flushPromises();await finish()
  await x.wrapper.get('button').trigger('click');await x.wrapper.get('button').trigger('click');await finish()
  expect(x.sessions()).toBe(2)
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  await x.wrapper.setProps({local:false});await flushPromises()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(x.disposed()).toBe(1)
  expect(document.body.style.overflow).toBe('')
})

it('discards cancelled column drafts when the feature is reopened before its leave finishes',async()=>{
  const wrapper=mount(FeatureHost,{attachTo:document.body,props:{local:true,defaultStrategy:'on-interaction',entryLabel:'打开设置',deferClose:true,createContext:(_details,controls)=>({
    columns:[{id:'name',field:'name',title:'项目',visible:true,configurable:{...allColumnCapabilities}}],settingsPolicy:fullSettingsPolicy(),openMode:'quick' as const,close:controls.close,patch:async()=>{},
  }),loader:async()=>({default:ColumnSettings})},global:{stubs:{transition:false}}})
  wrappers.push(wrapper);await wrapper.get('button').trigger('click');await flushPromises();await finish()
  await wrapper.get('input[aria-label="显示项目"]').setValue(false)
  await wrapper.findAll('button').find(button=>button.text()==='取消')!.trigger('click')
  expect(document.querySelector('[data-testid="column-panel"]')).not.toBeNull()
  await wrapper.get('button').trigger('click');await flushPromises();await finish()
  expect((wrapper.get('input[aria-label="显示项目"]').element as HTMLInputElement).checked).toBe(true)
  expect(wrapper.findAll('[data-testid="column-panel"]')).toHaveLength(1)
})

it('slides the settings drawer panel while its backdrop only fades',async()=>{
  const wrapper=mount(FeatureHost,{attachTo:document.body,props:{local:true,defaultStrategy:'on-interaction',entryLabel:'打开设置',deferClose:true,createContext:(_details,controls)=>({
    columns:[{id:'name',field:'name',title:'项目',visible:true,configurable:{...allColumnCapabilities}}],settingsPolicy:fullSettingsPolicy(),openMode:'drawer' as const,close:controls.close,patch:async()=>{},
  }),loader:async()=>({default:ColumnSettings})},global:{stubs:{transition:false}}})
  wrappers.push(wrapper);await wrapper.get('button').trigger('click');await flushPromises()
  const panel=document.querySelector('[data-testid="settings-drawer"]')!,backdrop=panel.parentElement!
  expect(animated.some(animation=>animation.element===panel&&!Array.isArray(animation.frames)&&animation.frames.transform!==undefined)).toBe(true)
  expect(animated.some(animation=>animation.element===backdrop&&!Array.isArray(animation.frames)&&animation.frames.transform!==undefined)).toBe(false)
  await finish();await wrapper.get('button').trigger('click')
  expect(document.body.style.overflow).toBe('hidden')
  await finish()
  expect(document.querySelector('[data-testid="settings-drawer"]')).toBeNull()
  expect(document.body.style.overflow).toBe('')
})

it('ignores a pending module after permission revocation and page disposal',async()=>{
  let resolveModule!:(value:{default:ReturnType<typeof defineComponent>})=>void
  const loader=()=>new Promise<{default:ReturnType<typeof defineComponent>}>(resolve=>{resolveModule=resolve})
  const dispose=vi.fn()
  const wrapper=mount(FeatureHost,{attachTo:document.body,props:{local:true,defaultStrategy:'on-interaction',entryLabel:'打开设置',deferClose:true,createContext:(_details,controls)=>{controls.onDispose(dispose);return {}},loader}})
  wrappers.push(wrapper);await wrapper.get('button').trigger('click');await flushPromises()
  await wrapper.setProps({local:false});wrapper.unmount()
  resolveModule({default:defineComponent({render:()=>h('div',{role:'dialog'},'过期内容')})});await flushPromises()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(dispose).toHaveBeenCalledTimes(1)
})

it('does not reopen a feature dismissed while its first module is loading',async()=>{
  let resolveModule!:(value:{default:ReturnType<typeof defineComponent>})=>void
  const loader=()=>new Promise<{default:ReturnType<typeof defineComponent>}>(resolve=>{resolveModule=resolve})
  const wrapper=mount(FeatureHost,{attachTo:document.body,props:{local:true,defaultStrategy:'on-interaction',entryLabel:'打开设置',deferClose:true,createContext:()=>({}),loader}})
  wrappers.push(wrapper);await wrapper.get('button').trigger('click');await flushPromises()
  await wrapper.get('button').trigger('click')
  resolveModule({default:defineComponent({render:()=>h('div',{role:'dialog'},'延迟内容')})});await flushPromises()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
})
