import { describe, expect, it } from 'vitest'
import { evaluateCell, formatNumeric, typedKey } from '../src/features/columns/evaluate'
import { readRichDocument, richText, safeLink } from '../src/features/rich-text/document'
import { matchesFilter, matchesFilterGroup, collectFilterOptions } from '../src/features/filters/model'

const base = {id:'value',field:'value',title:'值'}
describe('shared cell interpretation', () => {
  it('keeps mapping values typed and never changes source rows', () => {
    const mapping = {enabled:true, type:'number' as const, presentation:'tag' as const, empty:'未填写', unknown:'未知', items:[{value:1,label:'已确认',color:'#2468e8',background:'#edf4ff'}]}
    const row = {value:1}; const column = {...base,mapping}
    expect(evaluateCell(row,column).text).toBe('已确认')
    expect(evaluateCell({value:'1'},column).text).toBe('未知（1）')
    expect(evaluateCell({value:'01'},column).text).toBe('未知（01）')
    expect(evaluateCell({value:null},column).text).toBe('未填写')
    expect(row.value).toBe(1)
    expect(new Set([1,'1','01',true,null].map(typedKey)).size).toBe(5)
  })
  it('uses exact decimal rounding with fixed/maximum decimal places and scale', () => {
    expect(formatNumeric('1.005',{minimumFractionDigits:2,maximumFractionDigits:2}).text).toBe('1.01')
    expect(formatNumeric('-1.005',{minimumFractionDigits:2,maximumFractionDigits:2,sign:'accounting'}).text).toBe('(1.01)')
    expect(formatNumeric(12345,{scale:10000,minimumFractionDigits:0,maximumFractionDigits:3,suffix:'万元'}).text).toBe('1.235万元')
    expect(formatNumeric(12.30,{minimumFractionDigits:0,maximumFractionDigits:3}).text).toBe('12.3')
  })
  it('distinguishes ratio percentages from already-percent values', () => {
    expect(formatNumeric(.1234,{style:'percent',percentBase:'ratio',maximumFractionDigits:2}).text).toBe('12.34%')
    expect(formatNumeric(12.34,{style:'percent',percentBase:'percent',maximumFractionDigits:2}).text).toBe('12.34%')
    expect(formatNumeric(Infinity,{}).text).toBe('—')
    expect(formatNumeric('9007199254740993123',{}).exportValue).toBe('9007199254740993123')
  })
  it('expands safe field tokens once and retains raw export data', () => {
    const row={value:'设备A',customer:'科室一'}
    const template={enabled:true,document:{ops:[{insert:{field:'value'}},{insert:'\n'},{insert:{field:'customer'}}]}}
    const cell=evaluateCell(row,{...base,template},[base,{id:'customer',field:'customer',title:'科室'}])
    expect(cell.text).toBe('设备A\n科室一')
    expect(cell.raw).toBe('设备A')
    expect(row).toEqual({value:'设备A',customer:'科室一'})
  })
})
describe('rich documents',()=>{
  it('strips unsafe embeds, links and attributes without running templates',()=>{
    const doc=readRichDocument({ops:[{insert:'安全',attributes:{bold:true,color:'#ff0000',link:'javascript:alert(1)',onclick:'x'}},{insert:{image:'https://evil.invalid/a.png'}}]})
    expect(richText(doc)).toBe('安全')
    expect(doc.ops[0].attributes).toEqual({bold:true,color:'#ff0000'})
    expect(safeLink('https://user:pass@example.org')).toBe('')
    expect(safeLink('https://example.org/path')).toBe('https://example.org/path')
  })
  it('limits document size and rejects unknown field tokens',()=>{
    const doc=readRichDocument({ops:[{insert:'a'.repeat(20000)},{insert:{field:'secret'}}]},{maxChars:30,fields:['value']})
    expect(richText(doc).length).toBeLessThanOrEqual(30)
  })
})
describe('filter contract',()=>{
  it('supports text, typed membership, empty and numeric/date boundaries',()=>{
    expect(matchesFilter({value:'abc'},{field:'value',operator:'starts',value:'ab'})).toBe(true)
    expect(matchesFilter({value:1},{field:'value',operator:'in',value:['1']})).toBe(false)
    expect(matchesFilter({value:null},{field:'value',operator:'empty',value:null})).toBe(true)
    expect(matchesFilter({value:12},{field:'value',operator:'between',value:[10,15]})).toBe(true)
    expect(matchesFilter({value:'2026-09-23'},{field:'value',operator:'nextDays',value:2},'2026-09-22')).toBe(true)
    expect(matchesFilter({value:'2026-09-19'},{field:'value',operator:'pastDays',value:2},'2026-09-22')).toBe(false)
  })
  it('composes groups without replacing the business search',()=>{
    const group={logic:'or' as const,rules:[{field:'value',operator:'eq' as const,value:1},{field:'value',operator:'eq' as const,value:2}]}
    expect(matchesFilterGroup({value:2},group)).toBe(true)
    expect(matchesFilterGroup({value:3},group)).toBe(false)
    const options=collectFilterOptions([{value:1},{value:1},{value:'1'},{value:null}],base)
    expect(options.map(x=>[x.value,x.count])).toEqual([[1,2],['1',1],[null,1]])
  })
})
