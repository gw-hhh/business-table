import type{App,Plugin}from'vue'
import VxeUITable from'vxe-table'
import'vxe-table/lib/style.css'
import'./style.css'
import BusinessTable from'./BusinessTable.vue'
import ConfiguredBusinessTable from'./ConfiguredBusinessTable.vue'
export * from './config/types'
export * from './config/schema'
export * from './config/columns'
export * from './config/features'
export * from './config/diagnostics'
export * from './runtime/feature'
export * from './runtime/registry'
export {ConfiguredBusinessTable}
export*from'./types';export*from'./core';export*from'./persistence';export{BusinessTable}
export const BusinessTablePlugin:Plugin={install(app:App){app.use(VxeUITable);app.component('BusinessTable',BusinessTable);app.component('ConfiguredBusinessTable',ConfiguredBusinessTable)}}
export default BusinessTablePlugin

export type { FilterGroup } from './runtime/filter'
export type { FilterState } from './runtime/filter-state'
export type { FiltersContext } from './features/filters/context'
export type { FilterPlan, FilterPlansEnvelope, FilterPlanPersistence } from './features/filters/plans'
export type { ViewSnapshot } from './features/views/runtime'
