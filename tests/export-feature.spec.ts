import { describe, expect, it } from 'vitest'
import { buildExportBook, exportCSV, normalizeExportOptions, readExportPresets, saveExportPreset } from '../src/features/export/model'
import { writeXlsx } from '../src/features/export/xlsx'
import { defaultPresentation } from '../src/features/presentation/model'
import type { ExportField } from '../src/features/export/model'
const fields:ExportField[]=[{id:'id',label:'编号',column:{id:'id',field:'id',title:'自定义编号'}},{id:'amount',label:'金额',total:true,column:{id:'amount',field:'amount',title:'金额',type:'currency'}},{id:'status',label:'状态',column:{id:'status',field:'status',title:'状态',valueMap:[{value:'new',label:'新建'}]}}]
describe('shared export feature',()=>{
  it('shares display mapping, typed amounts, selected order, totals and metadata across output formats',()=>{
    const options=normalizeExportOptions({keys:['status','amount'],valueMode:'both',total:true,metadata:true},fields)
    const book=buildExportBook([{id:'0001',amount:12.5,status:'new'}],fields,options,{scope:'当前页',conditions:['客户：甲'],time:'2026-09-23 12:00'})
    expect(book.sheets[0].rows[0].map(cell=>cell.value)).toEqual(['状态（显示值）','状态（原值）','金额'])
    expect(book.sheets[0].rows[1].map(cell=>cell.value)).toEqual(['新建','new',12.5])
    expect(book.sheets[0].rows[2][2].value).toBe(12.5)
    expect(book.sheets[1].rows.flat().map(cell=>cell.value)).toContain('客户：甲')
    const csv=exportCSV(book)
    expect(csv).toContain('新建');expect(csv).toContain('当前页');expect(csv).toContain('12.50')
  })
  it('bounds presets, ignores unknown fields, and requires explicit replacement of equivalent names',()=>{
    const options=normalizeExportOptions({keys:['id','bad','id'],format:'bad'},fields)
    expect(options.keys).toEqual(['id']);expect(options.format).toBe('xlsx')
    const first=saveExportPreset([],'财务 ABC',options,fields)
    expect(()=>saveExportPreset(first,'财务 ａｂｃ',options,fields)).toThrow('已存在')
    expect(saveExportPreset(first,'财务 ａｂｃ',options,fields,true)).toHaveLength(1)
    expect(readExportPresets(JSON.stringify(first),fields)).toEqual(first)
  })
  it('writes a valid OOXML package with typed cells and neutralizes CSV formulas',()=>{
    const book=buildExportBook([{id:'=HYPERLINK("bad")',amount:5,status:'new'}],fields,normalizeExportOptions({keys:['id','amount'],metadata:false,total:false},fields),{scope:'全部'})
    expect(exportCSV(book)).toContain("'=HYPERLINK")
    const bytes=writeXlsx(book),text=new TextDecoder().decode(bytes)
    expect([...bytes.slice(0,4)]).toEqual([80,75,3,4])
    expect(text).toContain('[Content_Types].xml');expect(text).toContain('xl/worksheets/sheet1.xml')
    expect(text).toContain('<v>5</v>');expect(text).not.toContain('<f>')
  })
  it('sums exact raw decimals while excluding mapped and percentage display totals',()=>{
    const percentages:ExportField[]=[fields[0]!,{...fields[1]!,column:{...fields[1]!.column,numberRule:{enabled:true,style:'percent'}}}]
    const options=normalizeExportOptions({keys:['id','amount'],valueMode:'both',total:true},percentages)
    const percentBook=buildExportBook([{id:'1',amount:.1},{id:'2',amount:.2}],percentages,options,{scope:'全部'})
    expect(percentBook.sheets[0].rows.at(-1)!.map(cell=>cell.value)).toEqual(['合计','',.3])
    const mapped:ExportField[]=[fields[0]!,{...fields[1]!,column:{...fields[1]!.column,mapping:{enabled:true,type:'number',presentation:'text',empty:'—',unknown:'未知',items:[{value:.001,label:'甲'},{value:.002,label:'乙'}]}}}]
    const mappedBook=buildExportBook([{id:'1',amount:.001},{id:'2',amount:.002}],mapped,options,{scope:'全部'})
    expect(mappedBook.sheets[0].rows.at(-1)!.map(cell=>cell.value)).toEqual(['合计','',.003])
    const raw=normalizeExportOptions({keys:['id','amount'],valueMode:'raw',total:true},fields)
    const precise=buildExportBook([{id:'1',amount:'1234567890123456.001'},{id:'2',amount:'0.002'}],fields,raw,{scope:'全部'})
    expect(precise.sheets[0].rows.at(-1)![1].value).toBe('1234567890123456.003')
  })
  it('inherits appearance for current styles and writes real font names with Excel point sizes',()=>{
    const declared:ExportField[]=[{...fields[0]!,column:{...fields[0]!.column,align:'center',cellStyle:{fontFamily:'inherit',fontSize:18}}}]
    const appearance={...defaultPresentation().appearance,fontFamily:'simsun' as const,fontSize:16,headerFontSize:20,color:'#123456',headerColor:'#654321'}
    const book=buildExportBook([{id:'0001'}],declared,normalizeExportOptions({style:'current'},declared),{scope:'全部',appearance})
    expect(book.sheets[0].rows[0][0].style).toMatchObject({fontFamily:'simsun',fontSize:20,color:'#654321'})
    expect(book.sheets[0].rows[1][0].style).toMatchObject({fontFamily:'simsun',fontSize:18,color:'#123456',align:'center'})
    const xml=new TextDecoder().decode(writeXlsx(book))
    expect(xml).toContain('<name val="SimSun"/>');expect(xml).toContain('<sz val="13.5"/>');expect(xml).toContain('<sz val="15"/>')
  })
  it('preserves negative numeric CSV cells while neutralizing formula text and format prefixes',()=>{
    const book=buildExportBook([{id:'＝SUM(1)',amount:-12.5,status:'new'}],fields,normalizeExportOptions({keys:['id','amount'],valueMode:'raw'},fields),{scope:'全部'})
    expect(exportCSV(book)).toContain("'＝SUM(1),-12.5")
    const prefixed={sheets:[{name:'数据',rows:[[{value:-12.5,text:'=SUM(1)'},{value:'－1+2',text:'－1+2'}]]}]}
    expect(exportCSV(prefixed)).toBe("\ufeff'=SUM(1),'－1+2")
  })
})
