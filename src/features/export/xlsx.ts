import type { ExportBook, ExportCell } from './model'
import { fontFamilyExcel } from '../../config/font-families'
export const xlsxMime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const xml=(value:unknown)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')
const prefix='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const encoder=new TextEncoder()
function checksum(bytes:Uint8Array){let crc=0xffffffff;for(const value of bytes){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
function pack(entries:Record<string,string>):Uint8Array<ArrayBuffer>{
  const output:Uint8Array[]=[],directory:Uint8Array[]=[];let offset=0,count=0
  for(const [path,text] of Object.entries(entries)){
    const name=encoder.encode(path),data=encoder.encode(text),crc=checksum(data),local=new Uint8Array(30+name.length),a=new DataView(local.buffer)
    a.setUint32(0,0x04034b50,true);a.setUint16(4,20,true);a.setUint16(6,0x800,true);a.setUint32(14,crc,true);a.setUint32(18,data.length,true);a.setUint32(22,data.length,true);a.setUint16(26,name.length,true);local.set(name,30)
    const central=new Uint8Array(46+name.length),b=new DataView(central.buffer);b.setUint32(0,0x02014b50,true);b.setUint16(4,20,true);b.setUint16(6,20,true);b.setUint16(8,0x800,true);b.setUint32(16,crc,true);b.setUint32(20,data.length,true);b.setUint32(24,data.length,true);b.setUint16(28,name.length,true);b.setUint32(42,offset,true);central.set(name,46)
    output.push(local,data);directory.push(central);offset+=local.length+data.length;count++
  }
  const size=directory.reduce((sum,value)=>sum+value.length,0),end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,count,true);view.setUint16(10,count,true);view.setUint32(12,size,true);view.setUint32(16,offset,true)
  const result=new Uint8Array(offset+size+end.length);let position=0;for(const chunk of [...output,...directory,end]){result.set(chunk,position);position+=chunk.length}return result
}
function columnName(index:number){let value=index+1,result='';while(value){value--;result=String.fromCharCode(65+value%26)+result;value=Math.floor(value/26)}return result}
/** A small, dependency-free OOXML writer loaded only when Excel export is requested. */
export function writeXlsx(book:ExportBook):Uint8Array<ArrayBuffer>{
  const styles:ExportCell[]=[{value:null,text:''}],keys=new Map<string,number>()
  function style(cell:ExportCell){const key=JSON.stringify({format:cell.format??'General',style:cell.style??{},header:cell.header??false});const existing=keys.get(key);if(existing!==undefined)return existing;const id=styles.length;styles.push(cell);keys.set(key,id);return id}
  const files:Record<string,string>={}
  book.sheets.forEach((sheet,index)=>{
    const cols=sheet.widths?.map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('')??''
    const rows=sheet.rows.map((row,r)=>`<row r="${r+1}">${row.map((cell,c)=>{const ref=`${columnName(c)}${r+1}`,s=style(cell),value=cell.value;
      if(value instanceof Date)return `<c r="${ref}" s="${s}"><v>${value.getTime()/86400000+25569}</v></c>`
      if(typeof value==='number'&&Number.isFinite(value))return `<c r="${ref}" s="${s}"><v>${value}</v></c>`
      if(typeof value==='boolean')return `<c r="${ref}" s="${s}" t="b"><v>${value?1:0}</v></c>`
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`}).join('')}</row>`).join('')
    const validations=sheet.validations?.filter(rule=>rule.choices.length).map(rule=>`<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${columnName(rule.column)}${rule.from}:${columnName(rule.column)}${rule.to}"><formula1>${xml('"'+rule.choices.join(',').replaceAll('"','""')+'"')}</formula1></dataValidation>`).join('')??''
    files[`xl/worksheets/sheet${index+1}.xml`]=`${prefix}<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols?`<cols>${cols}</cols>`:''}<sheetData>${rows}</sheetData>${validations?`<dataValidations count="${sheet.validations?.length}">${validations}</dataValidations>`:''}</worksheet>`
  })
  const fonts=styles.map(cell=>{const s=cell.style;return `<font><sz val="${(s?.fontSize??14)*.75}"/><name val="${xml(fontFamilyExcel(s?.fontFamily??'system'))}"/>${cell.header||s?.fontWeight==='bold'||s?.fontWeight==='600'?'<b/>':''}<color rgb="FF${(s?.color??'334155').replace('#','')}"/></font>`}).join('')
  const formats=styles.map((cell,i)=>`<numFmt numFmtId="${164+i}" formatCode="${xml(cell.format??'General')}"/>`).join('')
  const xfs=styles.map((cell,i)=>`<xf numFmtId="${164+i}" fontId="${i}" fillId="${cell.header?2:0}" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="center" horizontal="${cell.style?.align??(typeof cell.value==='number'?'right':'left')}" wrapText="1"/></xf>`).join('')
  files['xl/styles.xml']=`${prefix}<styleSheet xmlns="${ns}"><numFmts count="${styles.length}">${formats}</numFmts><fonts count="${styles.length}">${fonts}</fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F7FC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  files['xl/workbook.xml']=`${prefix}<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${book.sheets.map((sheet,i)=>`<sheet name="${xml(sheet.name.slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`
  files['xl/_rels/workbook.xml.rels']=`${prefix}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${book.sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  files['_rels/.rels']=`${prefix}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  files['[Content_Types].xml']=`${prefix}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${book.sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`
  return pack(files)
}
