import {defineAsyncComponent,type App,type Plugin}from'vue'
import VxeUITable from'vxe-table'
import'vxe-table/lib/style.css'
import'./style.css'
import BusinessTable from'./BusinessTable.vue'
import ConfiguredBusinessTable from'./ConfiguredBusinessTable.vue'
export * from './config/types'
export * from './config/schema'
export * from './config/explanation'
export * from './config/columns'
export * from './config/features'
export * from './config/diagnostics'
export * from './runtime/feature'
export * from './runtime/registry'
export {ConfiguredBusinessTable}
export*from'./types';export*from'./core';export*from'./persistence';export{BusinessTable}
export const BusinessTablePlugin:Plugin={install(app:App){app.use(VxeUITable);app.component('BusinessTable',BusinessTable);app.component('ConfiguredBusinessTable',ConfiguredBusinessTable)}}
export default BusinessTablePlugin
export {useTableRuntime} from './runtime/useTableRuntime'
export type {TableRuntime,TableRuntimeInput,TableRuntimeEvents} from './runtime/useTableRuntime'
export type {SearchPanelOptions,SearchPanelPersistence,SearchPanelContext} from './features/search/panel'
export {default as BusinessTableGrid} from './components/BusinessTableGrid.vue'
export {default as TablePagination} from './components/TablePagination.vue'
export {default as SearchRegion} from './components/SearchRegion.vue'
export {default as SearchToggle} from './components/SearchToggle.vue'
export const TableSearch=defineAsyncComponent(()=>import('./components/TableSearch.vue'))
export {default as SearchPendingIndicator} from './components/SearchPendingIndicator.vue'
export {default as TableTools} from './features/toolbar/ToolStrip.vue'

export type { FilterGroup } from './runtime/filter'
export type { FilterState } from './runtime/filter-state'
export type { FiltersContext } from './features/filters/context'
export type { FilterPlan, FilterPlansEnvelope, FilterPlanPersistence } from './features/filters/plans'
export type { ViewSnapshot } from './features/views/runtime'
export type { SearchDefinition, SearchItem, SearchOption, SearchValues, SearchSummaryItem } from './features/search/model'
export { summarizeSearchValues } from './features/search/model'
export type { FilterOption, FilterOptionsLoader } from './features/filters/model'
export { formatFilterSummary, useFilterSummaries } from './features/filters/summary'
export type { SearchContext } from './runtime/query'
export const QuerySummary:typeof import('./components/QuerySummary.vue')['default']=defineAsyncComponent(()=>import('./components/QuerySummary.vue'))
export const SearchSummary=defineAsyncComponent(()=>import('./components/SearchSummary.vue'))
export type { ControlConfig, ControlDeclaration, ControlAccess } from './config/access'
export type { SettingsDefinition, SettingsPolicy, SettingsPage, ColumnSettingsSection } from './features/settings/policy'
export type { ToolDefinition, ToolPreference, ToolbarLayout, TablePresentation, PresentationDelta } from './features/presentation/model'
export { createViewsRuntime, createViewChangeTracker, readViews, viewQueryEquals } from './features/views/runtime'
export type { ViewsOptions, ViewsPanelRuntime, ViewSummary } from './features/views/runtime'
export const ViewsPanel=defineAsyncComponent(()=>import('./features/views/ViewsPanel.vue'))
export const DensityMenu=defineAsyncComponent(()=>import('./features/presentation/DensityMenu.vue'))
export { useTableControls } from './features/presentation/useTableControls'
export type { TableControlsSnapshot, TableControlsPersistence, TableControlsOptions } from './features/presentation/useTableControls'
export const ExportDialog=defineAsyncComponent(()=>import('./features/export/ExportDialog.vue'))
export const TemplateDownloadDialog=defineAsyncComponent(()=>import('./features/export/TemplateDownloadDialog.vue'))
export { buildExportBook, exportCSV, exportFields, normalizeExportOptions, readExportPresets, saveExportPreset } from './features/export/model'
export type { ExportField, ExportGroup, ExportOptions, ExportPreset, ExportInfo, ExportCell, ExportBook } from './features/export/model'
export { createTemplateBook } from './features/export/template'
export type { TemplateDefinition, TemplateField } from './features/export/template'

export { useSearchShortcut } from './features/search/shortcut'
export type { ConditionalRule, ConditionalFormattingDefinition } from './features/conditional-formatting/model'
export type { ConditionalFormattingContext } from './features/conditional-formatting/context'
export type { GroupingDefinition, CompareDefinition, ReportField } from './features/reports/model'
export type { ReportsContext } from './features/reports/context'
export type { RangeSelectionDefinition, RangeSelectionContext, RangePoint, RangeDirection } from './features/range-selection/context'
export type { DataToolsHandle } from './features/data-tools'

export const SummaryResult=defineAsyncComponent(()=>import('./features/summary/SummaryResult.vue'))
export type {SummaryState} from './features/summary/model'
