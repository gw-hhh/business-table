import {describe,it,expect,vi} from 'vitest'
import {resolveFeatureGate,readFeatureDetails,featureEntryVisible} from '../src/config/features'
import {createFeatureController} from '../src/runtime/feature'

describe('feature gates before details',()=>{
  it('hides a default entry without disabling contextual commands, and remote cannot widen it',()=>{
    const local={enabled:true,entry:false}
    expect(featureEntryVisible(local,{entry:true})).toBe(false)
    expect(resolveFeatureGate(local).enabled).toBe(true)
    expect(featureEntryVisible(true,{entry:false})).toBe(false)
    expect(featureEntryVisible(false,{enabled:true,entry:true})).toBe(false)
  })
  it.each([
    [undefined,undefined,false],[false,{enabled:true},false],
    [true,undefined,true],[true,{},true],[true,{enabled:false},false],
    [{enabled:true},{enabled:true},true],[{enabled:false},{enabled:true},false],
    [true,false,false],
  ])('local %j and remote %j => %s',(local,remote,enabled)=>{
    expect(resolveFeatureGate(local,remote).enabled).toBe(enabled)
  })
  it('does not inspect remote metadata or disabled local details',()=>{
    const local={enabled:false,get details():never{throw Error('local detail')},get mode():never{throw Error('mode')}}
    const remote={get enabled():never{throw Error('remote enabled')},get details():never{throw Error('remote detail')}}
    expect(resolveFeatureGate(local,remote).enabled).toBe(false)
    expect(readFeatureDetails(local,remote)).toEqual({})
  })
  it('does not read details when remote disables a local feature',()=>{
    const local={enabled:true,get details():never{throw Error('detail')}}
    expect(readFeatureDetails(local,{enabled:false})).toEqual({})
  })
  it('code owns render mode and loading; remote only narrows allowed items',()=>{
    const local={enabled:true,mode:'custom',loadStrategy:'on-interaction',details:{label:'列',allowedItems:['id','name']}}
    const remote={enabled:true,mode:'headless',loadStrategy:'eager',details:{label:'字段',allowedItems:['name','secret']}}
    expect(resolveFeatureGate(local,remote)).toEqual({enabled:true,mode:'custom',loadStrategy:'on-interaction'})
    expect(readFeatureDetails(local,remote)).toEqual({label:'字段',allowedItems:['name']})
    expect(readFeatureDetails({enabled:true},{details:{allowedItems:['secret']}}).allowedItems).toBeUndefined()
  })
})

describe('feature lifetime',()=>{
  it('does not read details or create a disabled feature',async()=>{
    const create=vi.fn()
    const feature=createFeatureController({local:{enabled:false,get details():never{throw Error('read')}},create})
    expect(await feature.activate('on-interaction')).toBeUndefined()
    expect(create).not.toHaveBeenCalled()
    expect(feature.state).toBe('disabled')
  })
  it('defers details and factory until interaction, then reuses the resource',async()=>{
    const details=vi.fn(()=>({label:'列'})), dispose=vi.fn(), create=vi.fn(()=>({value:{ready:true},dispose}))
    const feature=createFeatureController({local:{enabled:true,loadStrategy:'on-interaction',get details(){return details()}},create})
    expect(feature.state).toBe('enabled')
    expect(await feature.activate('eager')).toBeUndefined()
    expect(details).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(await feature.activate('on-interaction')).toEqual({ready:true})
    expect(await feature.activate('on-interaction')).toBe(feature.value)
    expect(details).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
    feature.dispose();feature.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(feature.state).toBe('disabled')
  })
  it('shares concurrent activation and releases a late result after disable/unmount',async()=>{
    let finish!:(value:{value:string;dispose:()=>void})=>void
    const dispose=vi.fn(),create=vi.fn(()=>new Promise<{value:string;dispose:()=>void}>(resolve=>{finish=resolve}))
    const feature=createFeatureController({local:true,create})
    const first=feature.activate('eager'),second=feature.activate('eager')
    expect(create).toHaveBeenCalledTimes(1)
    feature.dispose()
    finish({value:'late',dispose})
    expect(await first).toBeUndefined();expect(await second).toBeUndefined()
    expect(feature.value).toBeUndefined()
    expect(dispose).toHaveBeenCalledTimes(1)
  })
  it('isolates factory rejection, reports diagnostics and permits retry',async()=>{
    const report=vi.fn(),create=vi.fn().mockRejectedValueOnce(Error('module offline')).mockResolvedValueOnce({value:'ok'})
    const feature=createFeatureController({local:true,create,report})
    expect(await feature.activate('eager')).toBeUndefined()
    expect(feature.state).toBe('unavailable')
    expect(report).toHaveBeenCalledWith(expect.objectContaining({code:'RemoteConfigError'}))
    expect(await feature.activate('eager')).toBe('ok')
    expect(feature.state).toBe('enabled')
  })
})
