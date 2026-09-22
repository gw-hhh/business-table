import {describe,it,expect} from 'vitest'
import {splitActionLayout} from '../src/features/presentation/action-layout'
const actions=[{id:'view',label:'查看'},{id:'edit',label:'修改'},{id:'copy',label:'复制为草稿',position:'more' as const}]
describe('one action layout for rows and previews',()=>{
  it('reserves room for More before removing trailing inline actions',()=>{
    const result=splitActionLayout(actions,2,110,12,()=>40,42)
    expect(result.inline.map(a=>a.id)).toEqual(['view'])
    expect(result.more.map(a=>a.id)).toEqual(['edit','copy'])
  })
  it('supports all commands in More and does not create an empty menu',()=>{
    expect(splitActionLayout(actions,0,200,12,()=>40,42).more.map(a=>a.id)).toEqual(['view','edit','copy'])
    expect(splitActionLayout(actions.slice(0,2),4,200,12,()=>40,42).more).toEqual([])
  })
  it('does not mutate registered action positions when the viewport changes',()=>{
    splitActionLayout(actions,2,40,12,()=>40,42)
    expect(actions[0]!.position).toBeUndefined()
    expect(splitActionLayout(actions,2,200,12,()=>40,42).inline).toHaveLength(2)
  })
})
