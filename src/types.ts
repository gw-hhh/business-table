export type RowData=Record<string,unknown>
export type SortOrder='asc'|'desc'
export type FixedSide='left'|'right'|false
export type ColumnType='text'|'number'|'currency'|'percent'|'date'|'enum'|'boolean'
export interface ValueMapItem{value:string|number|boolean|null;label:string;color?:string;background?:string}
export interface NumberFormat{style?:'decimal'|'currency'|'percent';currency?:string;useGrouping?:boolean;minimumFractionDigits?:number;maximumFractionDigits?:number;percentBase?:'ratio'|'percent';prefix?:string;suffix?:string}
export interface ColumnConfig<T extends RowData=RowData>{id:string;field:keyof T & string|string;title:string;type?:ColumnType;width?:number;minWidth?:number;visible?:boolean;fixed?:FixedSide;align?:'left'|'center'|'right';sortable?:boolean;filterable?:boolean;numberFormat?:NumberFormat;valueMap?:ValueMapItem[];emptyText?:string}
export interface SortConfig{field:string;order:SortOrder}
export interface FilterConfig{field:string;operator:'eq'|'contains'|'in'|'gt'|'gte'|'lt'|'lte';value:unknown}
export interface Query{page:number;pageSize:number;sorts:SortConfig[];filters:FilterConfig[];keyword?:string;viewId?:string|null;signal?:AbortSignal}
export interface QueryResult<T extends RowData>{rows:T[];total:number}
export interface DataSource<T extends RowData>{query(query:Query):Promise<QueryResult<T>>}
export interface Pagination{page:number;pageSize:number;total:number;pageSizeOptions?:number[]}
export interface UserColumnConfig{title?:string;visible?:boolean;order?:number;width?:number;fixed?:FixedSide;align?:'left'|'center'|'right'}
export interface TableConfig{schemaVersion:1;tableKey:string;columns:Record<string,UserColumnConfig>;pageSize?:number}
export interface ViewConfig{id:string;name:string;isDefault?:boolean;filters?:FilterConfig[];sorts?:SortConfig[];columns?:Record<string,UserColumnConfig>}
export interface Action<T extends RowData>{id:string;label:string;position?:'inline'|'more';order?:number;danger?:boolean;handler?:(row:T)=>void|Promise<void>}
export interface Persistence{load(tableKey:string):Promise<TableConfig|null>;save(tableKey:string,config:TableConfig):Promise<void>}
