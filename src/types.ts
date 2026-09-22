import type {ContentDisplay,MappingConfig,NumberRule,TemplateConfig} from './features/columns/types'
import type {ColumnFilterConfig,FilterGroup} from './features/filters/model'
import type {ColumnFontFamily} from './config/font-families'
export type {ColumnFontFamily} from './config/font-families'
import type {ColumnCapabilities} from './config/types'
export type RowData=Record<string,unknown>
export type SortOrder='asc'|'desc'
export type FixedSide='left'|'right'|false
export type ColumnType='text'|'number'|'currency'|'percent'|'date'|'enum'|'boolean'
export interface ValueMapItem{value:string|number|boolean|null;label:string;color?:string;background?:string}
export interface NumberFormat{style?:'decimal'|'currency'|'percent';currency?:string;useGrouping?:boolean;minimumFractionDigits?:number;maximumFractionDigits?:number;percentBase?:'ratio'|'percent';prefix?:string;suffix?:string}
export interface ColumnTextStyle{fontFamily?:ColumnFontFamily;fontSize?:number;fontWeight?:'normal'|'500'|'600'|'bold';color?:string;align?:'left'|'center'|'right'}
export interface ColumnConfig<T extends RowData=RowData>{kind?:'data'|'actions';content?:ContentDisplay;mapping?:MappingConfig;numberRule?:NumberRule;template?:TemplateConfig;filter?:ColumnFilterConfig;id:string;field:keyof T & string|string;title:string;type?:ColumnType;width?:number;minWidth?:number;visible?:boolean;fixed?:FixedSide;align?:'left'|'center'|'right';sortable?:boolean;headerStyle?:ColumnTextStyle;cellStyle?:ColumnTextStyle;filterable?:boolean;numberFormat?:NumberFormat;valueMap?:ValueMapItem[];emptyText?:string;configurable?:ColumnCapabilities;renderer?:string}
export interface SortConfig{field:string;order:SortOrder}
export interface FilterConfig{field:string;operator:'eq'|'ne'|'contains'|'starts'|'in'|'notIn'|'gt'|'gte'|'lt'|'lte'|'between'|'empty'|'notEmpty'|'nextDays'|'pastDays';value:unknown}
export interface Query{filterGroup?:FilterGroup;page:number;pageSize:number;sorts:SortConfig[];filters:FilterConfig[];keyword?:string;viewId?:string|null;signal?:AbortSignal}
export interface QueryResult<T extends RowData>{rows:T[];total:number}
export interface DataSource<T extends RowData>{query(query:Query):Promise<QueryResult<T>>}
export interface Pagination{page:number;pageSize:number;total:number;pageSizeOptions?:number[]}
export interface UserColumnConfig{content?:ContentDisplay;mapping?:MappingConfig;numberRule?:NumberRule;template?:TemplateConfig;filter?:ColumnFilterConfig;filterable?:boolean;emptyText?:string;numberFormat?:NumberFormat;valueMap?:ValueMapItem[];title?:string;visible?:boolean;order?:number;width?:number;fixed?:FixedSide;align?:'left'|'center'|'right';sortable?:boolean;headerStyle?:ColumnTextStyle;cellStyle?:ColumnTextStyle}
export interface TableConfig{schemaVersion:1;tableKey:string;columns:Record<string,UserColumnConfig>;pageSize?:number}
export interface ViewConfig{id:string;name:string;isDefault?:boolean;filters?:FilterConfig[];sorts?:SortConfig[];columns?:Record<string,UserColumnConfig>}
export interface Action<T extends RowData>{id:string;label:string;position?:'inline'|'more';order?:number;danger?:boolean;icon?:string;separator?:boolean;children?:Action<T>[];visible?:boolean|((row:T)=>boolean);disabled?:boolean|((row:T)=>boolean);handler?:(row:T)=>void|Promise<void>}
export interface Persistence{load(tableKey:string,options?:{signal?:AbortSignal}):Promise<TableConfig|null>;save(tableKey:string,config:TableConfig):Promise<void>}
