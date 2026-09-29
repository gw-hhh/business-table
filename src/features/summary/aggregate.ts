import type {ColumnConfig,RowData} from '../../types'
import {getValue} from '../../runtime/value'
import {decimal,formatNumeric} from '../columns/evaluate'
import type {NumberRule} from '../columns/types'
/** Decimal arithmetic preserves the source precision before applying the column's display rule. */
export function sumColumn(rows:readonly RowData[],column:ColumnConfig):{value:string;text:string} {
  let numerator=0n,denominator=1n
  for(const row of rows){
    const raw=getValue(row,column.field)
    if(raw===null || raw===undefined || raw==='')continue
    const fraction=decimal(raw)
    if(!fraction)throw new Error(`“${column.title}”包含无效数值，无法汇总。`)
    const [value,scale]=fraction
    const common=scale>denominator?scale:denominator
    numerator=numerator*(common/denominator)+value*(common/scale);denominator=common
  }
  const negative=numerator<0n,magnitude=negative?-numerator:numerator
  const places=String(denominator).length-1
  const fraction=places?String(magnitude%denominator).padStart(places,'0').replace(/0+$/,''):''
  const value=`${negative?'-':''}${magnitude/denominator}${fraction?'.'+fraction:''}`
  const rule:NumberRule=column.numberRule?.enabled?column.numberRule:column.numberFormat??{
    style:column.type==='currency'?'currency':column.type==='percent'?'percent':'decimal',
    minimumFractionDigits:column.type==='currency'?2:0,maximumFractionDigits:column.type==='currency'?2:20,
  }
  const text=formatNumeric(value,rule).text
  if(text==='—')throw new Error(`“${column.title}”汇总值超出支持的数值精度。`)
  return {value,text}
}
