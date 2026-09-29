import {computed,ref,useId,watch} from 'vue'
import type {TableControlsSnapshot} from '../presentation/useTableControls'

export interface SearchPanelOptions {
  regionId?:string
  defaultVisible?:boolean
  toggleButton?:boolean
  /** Omit to submit manually. Zero enables immediate automatic submission. */
  autoSubmitMs?:number
  /** Opt in to a block wrapper and height transition. Default keeps display:contents. */
  animateCollapse?:boolean
}
export interface SearchPanelPersistence {
  load(tableKey:string):unknown
  save(tableKey:string,value:TableControlsSnapshot):void
}
export function useSearchPanel(options:{key:()=>string;enabled:()=>boolean;definition:()=>SearchPanelOptions|undefined;collapsed:()=>boolean;persistence:()=>SearchPanelPersistence|undefined;report:(cause:unknown)=>void}) {
  const localId=useId(),shown=ref(true),advanced=ref(false)
  let restoring=false
  function restore(){
    restoring=true
    shown.value=options.definition()?.defaultVisible!==false
    advanced.value=!options.collapsed()
    if(options.enabled())try{
      const raw=options.persistence()?.load(options.key())
      const stored:unknown=typeof raw==='string'?JSON.parse(raw):raw
      if(stored!=null){
        if(typeof stored!=='object'||Array.isArray(stored))throw new Error('查询区显示偏好格式无效。')
        const value=stored as Record<string,unknown>
        if(typeof value.searchVisible!=='boolean'||typeof value.advanced!=='boolean')throw new Error('查询区显示偏好格式无效。')
        shown.value=value.searchVisible;advanced.value=value.advanced
      }
    }catch(cause){options.report(cause)}
    restoring=false
  }
  watch([options.key,options.enabled,options.persistence],restore,{immediate:true,flush:'sync'})
  watch([shown,advanced],([searchVisible,advanced])=>{
    if(restoring||!options.enabled())return
    try{options.persistence()?.save(options.key(),{searchVisible,advanced})}catch(cause){options.report(cause)}
  },{flush:'sync'})
  const visible=computed(()=>options.enabled()&&shown.value)
  return {
    id:computed(()=>options.definition()?.regionId||`bt-search-${localId}`),visible,
    advanced:computed(()=>advanced.value),enabled:computed(options.enabled),
    animateCollapse:computed(()=>options.definition()?.animateCollapse===true),
    toggleButton:computed(()=>options.enabled()&&options.definition()?.toggleButton===true),
    show:()=>{if(options.enabled())shown.value=true},hide:()=>{shown.value=false},
    toggle:()=>{if(options.enabled())shown.value=!shown.value},setAdvanced:(value:boolean)=>{advanced.value=value},
  }
}
export type SearchPanelContext=ReturnType<typeof useSearchPanel>
