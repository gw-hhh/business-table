import type {Action,RowData} from '../../types'
/** Geometry is measured by the UI. The allocation policy is shared with preview. */
export function splitActionLayout<T extends RowData>(actions:readonly Action<T>[],maximum:number,width:number,gap:number,measure:(action:Action<T>)=>number,moreWidth=44):{inline:Action<T>[];more:Action<T>[]} {
  const candidates=actions.filter(action=>action.position!=='more')
  let count=Math.min(Math.max(0,Math.trunc(maximum)),candidates.length)
  const available=Number.isFinite(width)&&width>0?width:Number.POSITIVE_INFINITY
  while(count>0){
    const hasMore=actions.length>count,required=candidates.slice(0,count).reduce((sum,action)=>sum+measure(action),0)+Math.max(0,count-1)*gap+(hasMore?gap+moreWidth:0)
    if(required<=available)break
    count--
  }
  const inline=candidates.slice(0,count),ids=new Set(inline.map(action=>action.id))
  return {inline,more:actions.filter(action=>!ids.has(action.id))}
}
