import type {DiagnosticReporter} from '../config/diagnostics'
import {resolveFeatureGate,readFeatureDetails,type FeatureLoadStrategy,type ResolvedFeature} from '../config/features'
export type FeatureState = 'disabled' | 'enabled' | 'degraded' | 'unavailable'
export interface FeatureResource<T> {value:T; dispose?:()=>void}
export interface FeatureControllerOptions<T> {
  local:unknown; remote?:unknown; defaultStrategy?:FeatureLoadStrategy; report?:DiagnosticReporter
  readDetails?:()=>{label?:string;allowedItems?:string[]}
  create:(details:{label?:string;allowedItems?:string[]})=>FeatureResource<T>|Promise<FeatureResource<T>>
}
export interface FeatureController<T> {
  readonly gate:ResolvedFeature; readonly state:FeatureState; readonly value:T|undefined
  activate(trigger:FeatureLoadStrategy):Promise<T|undefined>
  dispose():void
}
export function createFeatureController<T>(options:FeatureControllerOptions<T>):FeatureController<T> {
  const gate=resolveFeatureGate(options.local,options.remote,options.defaultStrategy,options.report)
  let state:FeatureState=gate.enabled?'enabled':'disabled'
  let resource:FeatureResource<T>|undefined,pending:Promise<T|undefined>|undefined,disposed=false
  return {
    gate,
    get state(){return state},
    get value(){return resource?.value},
    activate(trigger){
      if(disposed||!gate.enabled||trigger!==gate.loadStrategy)return Promise.resolve(undefined)
      if(resource)return Promise.resolve(resource.value)
      if(pending)return pending
      // Invoke synchronously so every concurrent caller shares the same attempt.
      try {
        const created=options.create(options.readDetails?options.readDetails():readFeatureDetails(options.local,options.remote,options.report))
        pending=Promise.resolve(created).then(next=>{
          if(disposed){next.dispose?.();return undefined}
          resource=next;state='enabled'
          return next.value
        }).catch(cause=>{
          if(!disposed){state='unavailable';options.report?.({code:'RemoteConfigError',path:'features.module',message:cause instanceof Error?cause.message:String(cause)})}
          return undefined
        }).finally(()=>{pending=undefined})
      } catch(cause) {
        state='unavailable'
        options.report?.({code:'SchemaValidationError',path:'features.details',message:cause instanceof Error?cause.message:String(cause)})
        return Promise.resolve(undefined)
      }
      return pending
    },
    dispose(){
      if(disposed)return
      disposed=true;state='disabled'
      resource?.dispose?.();resource=undefined
    },
  }
}
