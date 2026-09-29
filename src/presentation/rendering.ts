import type {TableRenderingOptions} from '../types'

const pixels=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?Math.max(1,Math.round(value)):undefined
const count=(value:unknown,fallback:number,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(max,Math.floor(value)):fallback

/** One adapter boundary; row heights and wrapping remain owned by VXE and column content. */
export function resolveTableRendering(options:TableRenderingOptions|undefined,fillHeight?:number) {
  const height=pixels(options?.height)??pixels(fillHeight),maxHeight=pixels(options?.maxHeight)
  const virtual=options?.virtualRows
  const requested=virtual===true||(typeof virtual==='object'&&virtual!==null&&virtual.enabled!==false)
  return {
    height,maxHeight:height?undefined:maxHeight,
    virtualY:{enabled:requested&&Boolean(height||maxHeight),gt:typeof virtual==='object'?count(virtual?.threshold,100,100000):100,oSize:typeof virtual==='object'?count(virtual?.overscan,5,100):5},
  }
}
