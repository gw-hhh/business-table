import type{ColumnConfig,DataSource,Query,QueryResult}from'../src'
export interface QuoteRow extends Record<string,unknown>{id:string;name:string;customer:string;amount:number;status:number;owner:string;date:string}
export const rows:QuoteRow[]=[
{id:'Q20260901-0001',name:'二期计量系统改造',customer:'澄川水务',amount:63860,status:1,owner:'林予安',date:'2026-11-02'},
{id:'Q20260901-0002',name:'化学品储罐监测',customer:'澄川水务',amount:237450,status:2,owner:'林予安',date:'2026-11-02'},
{id:'Q20260902-0003',name:'生产线测量点升级',customer:'泽临管道',amount:231540,status:2,owner:'陈景行',date:'2026-12-22'},
{id:'Q20260903-0004',name:'智能水厂仪表配置',customer:'临溪能源',amount:189050,status:3,owner:'周子衡',date:'2026-11-03'}]
export const quoteColumns:ColumnConfig<QuoteRow>[]=[
{id:'id',field:'id',title:'报价编号',width:170,fixed:'left',sortable:true},
{id:'name',field:'name',title:'项目名称',minWidth:220,sortable:true},
{id:'customer',field:'customer',title:'客户',width:150},
{id:'amount',field:'amount',title:'含税金额',type:'currency',width:150,align:'right',sortable:true,numberFormat:{style:'currency',currency:'CNY',minimumFractionDigits:2,maximumFractionDigits:2}},
{id:'status',field:'status',title:'状态',type:'enum',width:120,align:'center',valueMap:[{value:1,label:'草稿',color:'#536273',background:'#f1f3f5'},{value:2,label:'评审中',color:'#2468e8',background:'#eef4ff'},{value:3,label:'已转合同',color:'#17875b',background:'#edf9f3'}]},
{id:'owner',field:'owner',title:'负责人',width:120},{id:'date',field:'date',title:'有效期至',width:140}]
export const provider:DataSource<QuoteRow>={async query(q:Query):Promise<QueryResult<QuoteRow>>{let r=[...rows];if(q.keyword){const k=q.keyword.toLowerCase();r=r.filter(x=>Object.values(x).some(v=>String(v).toLowerCase().includes(k)))}for(const f of q.filters){if(f.operator==='eq')r=r.filter(x=>x[f.field]===f.value)}for(const s of [...q.sorts].reverse())r.sort((a,b)=>{const av=a[s.field],bv=b[s.field];return(av===bv?0:(av??'')<(bv??'')?-1:1)*(s.order==='asc'?1:-1)});return{rows:r.slice((q.page-1)*q.pageSize,q.page*q.pageSize),total:r.length}}}
