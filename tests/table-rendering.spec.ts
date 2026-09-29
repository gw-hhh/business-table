import {describe,it,expect} from 'vitest'
import {resolveTableRendering} from '../src/presentation/rendering'
import {emptyReason} from '../src/presentation/empty'
import type {Query} from '../src/types'

describe('renderer boundary',()=>{
  it('keeps virtualization opt in and requires bounded geometry',()=>{
    expect(resolveTableRendering(undefined).virtualY.enabled).toBe(false)
    expect(resolveTableRendering({virtualRows:true}).virtualY.enabled).toBe(false)
    expect(resolveTableRendering({virtualRows:true},480).virtualY.enabled).toBe(true)
    expect(resolveTableRendering({maxHeight:600,virtualRows:true})).toMatchObject({height:undefined,maxHeight:600,virtualY:{enabled:true}})
  })
  it('normalizes invalid external numbers and gives explicit height precedence',()=>{
    expect(resolveTableRendering({height:520,maxHeight:800,virtualRows:{threshold:0,overscan:8}},400)).toMatchObject({height:520,maxHeight:undefined,virtualY:{enabled:true,gt:0,oSize:8}})
    expect(resolveTableRendering({height:NaN,maxHeight:-1,virtualRows:{threshold:NaN,overscan:Infinity}})).toMatchObject({height:undefined,maxHeight:undefined,virtualY:{enabled:false,gt:100,oSize:5}})
    expect(resolveTableRendering({virtualRows:{enabled:false}},400).virtualY.enabled).toBe(false)
  })
})
describe('empty result context',()=>{
  const base:Query={page:1,pageSize:20,filters:[],sorts:[]}
  it('distinguishes displayed query conditions and request states without inferring remote inventory',()=>{
    expect(emptyReason(base,false,'')).toBe('empty')
    expect(emptyReason({...base,filters:[{field:'code',operator:'eq',value:0}]},false,'')).toBe('no-results')
    expect(emptyReason({...base,keyword:'unmatched'},false,'')).toBe('no-results')
    expect(emptyReason(base,false,'failed')).toBe('error')
    expect(emptyReason(base,true,'failed')).toBe('loading')
  })
})
