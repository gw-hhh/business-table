<script setup lang="ts" generic="C extends object">
import {computed,markRaw,nextTick,onBeforeUnmount,onMounted,ref,shallowRef,watch,type Component,type WatchStopHandle} from 'vue'
import {resolveFeatureGate,readFeatureDetails,featureEntryVisible,type FeatureLoadStrategy} from '../config/features'
import {createFeatureController,type FeatureController,type FeatureState} from '../runtime/feature'
import type {ConfigDiagnostic} from '../config/diagnostics'
import TableIcon from './TableIcon.vue'

const props=defineProps<{
  local:unknown;remote?:unknown;defaultStrategy?:FeatureLoadStrategy;entryLabel?:string;entryIcon?:string;testId?:string;declaredItems?:readonly string[]
  createContext:(details:{label?:string;allowedItems?:string[]},controls:{close:()=>void;isActive:()=>boolean;onDispose:(dispose:()=>void)=>void})=>C|Promise<C>
  loader:()=>Promise<{default:Component}>
}>()
const emit=defineEmits<{diagnostic:[ConfigDiagnostic];entry:[]}>()
type Loaded={context:C;component?:Component}
const gate=computed(()=>resolveFeatureGate(props.local,props.remote,props.defaultStrategy))
// This computed is never evaluated before activation. Once active it tracks only
// the supported presentation fields, including in-place reactive allowlist edits.
const details=computed(()=>{
  try{return readFeatureDetails(props.local,props.remote,diagnostic=>emit('diagnostic',diagnostic),props.declaredItems)}
  catch(cause){emit('diagnostic',{code:'SchemaValidationError',path:'features.details',message:cause instanceof Error?cause.message:String(cause)});return {}}
})
const loaded=shallowRef<Loaded>(),active=ref(false),state=ref<FeatureState>('disabled'),sentinel=ref<HTMLElement>()
let controller:FeatureController<Loaded>|undefined,observer:IntersectionObserver|undefined
let mounted=false,generation=0,stopDetails:WatchStopHandle|undefined
function close(){active.value=false}
async function activate(trigger:FeatureLoadStrategy=gate.value.loadStrategy){
  const current=controller
  if(trigger===gate.value.loadStrategy&&gate.value.enabled)active.value=true
  const result=await current?.activate(trigger)
  if(current!==controller)return undefined
  state.value=current?.state??'disabled'
  if(result){
    loaded.value=result;active.value=true
  }
  return result?.context
}
async function toggle(){emit('entry');if(loaded.value){active.value=!active.value;return}await activate()}
function observeVisibility(){
  observer?.disconnect()
  if(gate.value.loadStrategy!=='on-visible'||!sentinel.value)return
  observer=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){observer?.disconnect();void activate('on-visible')}
  })
  observer.observe(sentinel.value)
}
function resetController(){
  const currentGeneration=++generation
  stopDetails?.();stopDetails=undefined;observer?.disconnect()
  controller?.dispose();loaded.value=undefined;active.value=false
  const mode=gate.value.mode
  controller=createFeatureController({
    local:props.local,remote:props.remote,defaultStrategy:props.defaultStrategy,
    readDetails:()=>details.value,
    report:diagnostic=>emit('diagnostic',diagnostic),
    async create(details){
      // Observe after the first details read, before awaiting the module. A late
      // import must not commit permissions that were revoked while it loaded.
      stopDetails??=watch(()=>readTrackedDetails(),()=>{
        const wasActive=active.value
        resetController()
        const refreshedGeneration=generation
        void activate().then(()=>{if(generation===refreshedGeneration)active.value=wasActive})
      },{flush:'sync'})
      const disposers:(()=>void)[]=[]
      let released=false
      const release=()=>{
        if(released)return
        released=true
        for(const dispose of disposers.reverse()){
          try{dispose()}
          catch(cause){emit('diagnostic',{code:'RuntimeExtensionError',path:'features.dispose',message:cause instanceof Error?cause.message:String(cause)})}
        }
      }
      try{
        const context=await props.createContext(details,{close,isActive:()=>generation===currentGeneration&&gate.value.enabled,onDispose:dispose=>{if(released)dispose();else disposers.push(dispose)}})
        const component=mode==='default'?markRaw((await props.loader()).default):undefined
        return {value:{context,component},dispose:release}
      }catch(cause){release();throw cause}
    },
  })
  state.value=controller.state
}
function readTrackedDetails(){const value=details.value;return JSON.stringify([value.label??null,value.allowedItems??null])}
watch(()=>[props.local,props.remote,gate.value.mode,gate.value.loadStrategy],()=>{
  resetController()
  void activate('eager');void activate('after-definition')
  if(mounted)void nextTick().then(()=>{if(mounted)observeVisibility()})
},{immediate:true})
onMounted(()=>{mounted=true;observeVisibility()})
onBeforeUnmount(()=>{mounted=false;generation++;stopDetails?.();controller?.dispose();controller=undefined;observer?.disconnect()})
defineExpose({activate,getContext:()=>loaded.value?.context})
</script>
<template>
  <button v-if="gate.mode!=='headless'&&gate.loadStrategy==='on-interaction'&&entryLabel&&featureEntryVisible(local,remote)" :data-testid="testId" :class="{'bt__icon-button':entryIcon,'is-active':active}" :aria-label="entryLabel" :title="entryLabel" :aria-expanded="active" @click="toggle"><TableIcon v-if="entryIcon" :name="entryIcon"/><span :class="{'bt-sr-only':entryIcon}">{{entryLabel}}</span></button>
  <span v-if="gate.mode!=='headless'&&gate.loadStrategy==='on-visible'" ref="sentinel" class="bt__feature-sentinel" aria-hidden="true"></span>
  <span v-if="state==='unavailable'&&gate.mode!=='headless'" class="bt__feature-error" role="status">暂时无法加载 <button @click="activate()">重试</button></span>
  <component :is="loaded.component" v-if="loaded&&active&&gate.mode==='default'" :context="loaded.context"/>
  <slot v-if="loaded&&active&&gate.mode==='custom'" name="custom" :context="loaded.context"/>
</template>
