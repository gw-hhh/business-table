import type {ColumnCapabilities} from '../../src/config/types'
import {resolveSettingsPolicy,type SettingsDefinition,type SettingsPolicy} from '../../src/features/settings/policy'

/** Tests opt in explicitly, just like a full-featured business definition. */
export const allColumnCapabilities:ColumnCapabilities={
  visible:true,order:true,rename:true,width:true,fixed:true,align:true,sortable:true,
  headerStyle:true,cellStyle:true,content:true,format:true,filter:true,mapping:true,template:true,trial:true,
}
export function fullSettingsPolicy():SettingsPolicy {
  return resolveSettingsPolicy(fullSettingsDefinition())
}
export function fullSettingsDefinition():SettingsDefinition {
  return {
    pages:{columns:true,sorts:true,actions:true,appearance:true,toolbar:true},
    columnSections:{basic:true,content:true,number:true,filter:true,mapping:true,template:true,trial:true},
  }
}
