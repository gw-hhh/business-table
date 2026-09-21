import type {DiagnosticReporter} from './diagnostics'

export type FeatureRenderMode = 'default' | 'custom' | 'headless'
export type FeatureLoadStrategy = 'eager' | 'after-definition' | 'on-visible' | 'on-interaction'
export interface FeatureDeclaration {
  enabled: boolean
  mode?: FeatureRenderMode
  loadStrategy?: FeatureLoadStrategy
  details?: {label?: string; allowedItems?: string[]}
}
export type FeatureConfig = boolean | FeatureDeclaration
export type TableFeatures = Partial<Record<'title' | 'search' | 'views' | 'toolbar' | 'columnSettings' | 'rowActions', FeatureConfig>>
export interface ResolvedFeature {enabled:boolean; mode:FeatureRenderMode; loadStrategy:FeatureLoadStrategy}
function record(value:unknown):Record<string,unknown>|undefined {
  return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined
}
export function resolveFeatureGate(local:unknown, remote?:unknown, defaultStrategy:FeatureLoadStrategy='eager', report?:DiagnosticReporter):ResolvedFeature {
  const disabled:ResolvedFeature={enabled:false,mode:'default',loadStrategy:defaultStrategy}
  const declaration=record(local)
  if(local!==true&&declaration?.enabled!==true)return disabled
  if(remote===false||record(remote)?.enabled===false)return disabled
  const mode=declaration?.mode??'default',strategy=declaration?.loadStrategy??defaultStrategy
  const validMode=['default','custom','headless'].includes(String(mode))
  const validStrategy=['eager','after-definition','on-visible','on-interaction'].includes(String(strategy))
  if(!validMode||!validStrategy)report?.({code:'SchemaValidationError',path:'features',message:'无效的渲染模式或加载策略，已使用默认值'})
  return {enabled:true,mode:validMode?mode as FeatureRenderMode:'default',loadStrategy:validStrategy?strategy as FeatureLoadStrategy:defaultStrategy}
}
export function readFeatureDetails(local:unknown, remote?:unknown, report?:DiagnosticReporter):{label?:string;allowedItems?:string[]} {
  if(!resolveFeatureGate(local,remote,'eager',report).enabled)return {}
  const own=record(record(local)?.details),override=record(record(remote)?.details)
  const result:{label?:string;allowedItems?:string[]}={}
  const label=typeof override?.label==='string'?override.label:own?.label
  if(typeof label==='string')result.label=label
  if(Array.isArray(own?.allowedItems)){
    const allowed=own.allowedItems.filter((id):id is string=>typeof id==='string')
    result.allowedItems=Array.isArray(override?.allowedItems)?allowed.filter(id=>override.allowedItems instanceof Array&&override.allowedItems.includes(id)):[...allowed]
  }
  return result
}
