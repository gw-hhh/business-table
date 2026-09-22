import {describe,it,expect} from 'vitest'
import {guardColumnPatch,parseColumnPatch} from '../src/config/columns'
import {resolveConfiguration,createPreferenceDelta} from '../src/config/schema'

describe('column rule configuration boundary',()=>{
  it('roundtrips typed rules through a legal preference delta',()=>{
    const base={id:'status',field:'status',title:'状态'}
    const patch={mapping:{enabled:true,type:'number',presentation:'tag',items:[{value:1,label:'有效',color:'#2468e8'}]},content:{wrap:'two',copyable:true},filter:{enabled:true,type:'multi',source:'data',counts:true}}
    expect(guardColumnPatch(base,patch)).toEqual(patch)
    const preference=createPreferenceDelta('rules',[base],{schemaVersion:1,tableKey:'rules',columns:{status:patch as any}})
    expect(preference.columns.status).toEqual(patch)
  })
  it('drops unsafe data without removing adjacent valid fields',()=>{
    const patch=parseColumnPatch({title:'改名',mapping:{enabled:true,type:'text',items:[{value:'x',label:'X',color:'url(javascript:evil)'}]},numberRule:{enabled:true,minimumFractionDigits:4,maximumFractionDigits:2},template:{enabled:true,document:{ops:[{insert:{image:'x'}}]}}})
    expect(patch).toEqual({title:'改名'})
  })
  it('denies new settings when their capabilities were not granted',()=>{
    expect(guardColumnPatch({id:'s',field:'s',title:'S',configurable:{visible:true}},{content:{wrap:'wrap'},filterable:true,mapping:{enabled:true,type:'text',items:[]}})).toEqual({})
  })
  it('accepts declared content and rule capabilities in configured mode',()=>{
    const resolved=resolveConfiguration({definition:{schemaVersion:3,tableKey:'x',columns:[{id:'x',field:'x',title:'X',kind:'data',content:{wrap:'wrap'},configurable:{content:true,mapping:true,filter:true,format:true}}]},preference:{schemaVersion:1,tableKey:'x',columns:{x:{content:{wrap:'two'},numberRule:{enabled:true,scale:10000}}}}})
    expect(resolved.columns[0].content?.wrap).toBe('two')
    expect(resolved.columns[0].numberRule?.scale).toBe(10000)
  })
})
