import {readRichAttributes,readRichDocument,safeLink,type RichAttributes,type RichDocument,type RichOperation,type RichReadOptions} from './document'

export interface TextRange {start:number;end:number}
const length=(insert:RichOperation['insert'])=>typeof insert==='string'?insert.length:1
export function documentLength(document:RichDocument):number{return document.ops.reduce((sum,op)=>sum+length(op.insert),0)}
function split(document:RichDocument,from:number,to:number):RichOperation[]{
  let offset=0
  return document.ops.flatMap(op=>{
    const start=Math.max(0,from-offset),end=Math.min(length(op.insert),to-offset)
    offset+=length(op.insert)
    if(end<=start)return []
    return [{...op,insert:typeof op.insert==='string'?op.insert.slice(start,end):{...op.insert},...(op.attributes?{attributes:{...op.attributes}}:{})}]
  })
}
function compact(ops:RichOperation[]):RichDocument{
  const result:RichOperation[]=[]
  for(const op of ops){
    if(op.insert==='')continue
    const last=result.at(-1),attrs=readRichAttributes(op.attributes)
    if(typeof op.insert==='string'&&typeof last?.insert==='string'&&JSON.stringify(last.attributes??{})===JSON.stringify(attrs))last.insert+=op.insert
    else result.push({insert:typeof op.insert==='string'?op.insert:{...op.insert},...(Object.keys(attrs).length?{attributes:attrs}:{})})
  }
  return {ops:result}
}
export function replaceRange(document:RichDocument,range:TextRange,replacement:RichDocument):RichDocument{
  const size=documentLength(document),start=Math.max(0,Math.min(size,range.start)),end=Math.max(start,Math.min(size,range.end))
  return compact([...split(document,0,start),...replacement.ops,...split(document,end,size)])
}
export function formatRange(document:RichDocument,range:TextRange,patch:Partial<Record<keyof RichAttributes,unknown>>):RichDocument{
  const selected=split(document,range.start,range.end).map(op=>{
    const attrs:Record<string,unknown>={...op.attributes}
    for(const [key,value] of Object.entries(patch)){if(value===undefined||value===false||value==='')delete attrs[key];else attrs[key]=value}
    return {insert:op.insert,attributes:readRichAttributes(attrs)}
  })
  return replaceRange(document,range,{ops:selected})
}
export function formatBlocks(document:RichDocument,range:TextRange,patch:Pick<RichAttributes,'align'|'list'>):RichDocument{
  let offset=0,lineStart=0
  const ops:RichOperation[]=[]
  for(const op of document.ops){
    if(typeof op.insert!=='string'){ops.push({...op});offset++;continue}
    let start=0
    for(let index=0;index<op.insert.length;index++)if(op.insert[index]==='\n'){
      if(index>start)ops.push({...op,insert:op.insert.slice(start,index)})
      const selected=offset+index>=range.start&&lineStart<=range.end
      const attrs:Record<string,unknown>={...op.attributes}
      if(selected)for(const [key,value] of Object.entries(patch)){if(value===undefined)delete attrs[key];else attrs[key]=value}
      ops.push({insert:'\n',attributes:readRichAttributes(attrs)})
      lineStart=offset+index+1;start=index+1
    }
    if(start<op.insert.length)ops.push({...op,insert:op.insert.slice(start)})
    offset+=op.insert.length
  }
  return compact(ops)
}
export function rangeAttributes(document:RichDocument,range:TextRange):Partial<Record<keyof RichAttributes,unknown>>{
  const ops=split(document,range.start,Math.max(range.end,range.start+1))
  if(!ops.length)return {}
  const first={...ops[0]!.attributes} as Record<string,unknown>
  for(const op of ops.slice(1))for(const key of Object.keys(first))if((op.attributes as Record<string,unknown>|undefined)?.[key]!==first[key])delete first[key]
  return first
}
function color(value:string):string|undefined{
  if(/^#[\da-f]{6}$/i.test(value))return value.toLowerCase()
  const match=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*1)?\s*\)$/.exec(value)
  return match?'#'+match.slice(1).map(value=>Math.min(255,Number(value)).toString(16).padStart(2,'0')).join(''):undefined
}
/** Read a detached DOM tree. Never insert pasted markup, URLs or arbitrary styles into the live editor. */
export function readEditorHtml(html:string,options:RichReadOptions={}):RichDocument{
  const parser=new DOMParser(),doc=parser.parseFromString(html.slice(0,200000),'text/html'),ops:RichOperation[]=[]
  let nodes=0
  const append=(insert:RichOperation['insert'],attributes:RichAttributes)=>{if(insert!=='')ops.push({insert,attributes:readRichAttributes(attributes,options.template)})}
  const newline=(attributes:RichAttributes)=>{append('\n',attributes)}
  const visit=(node:Node,attributes:RichAttributes={},depth=0):void=>{
    if(++nodes>10000||depth>200)return
    if(node.nodeType===Node.TEXT_NODE){append(node.textContent??'',attributes);return}
    if(!(node instanceof Element))return
    const tag=node.tagName.toLowerCase()
    if(['script','style','iframe','object','embed','svg','math','img','video','audio','input','button','select','textarea'].includes(tag))return
    const next={...attributes},style=(node as HTMLElement).style
    if(['b','strong'].includes(tag)||style?.fontWeight==='bold'||Number(style?.fontWeight)>=600)next.bold=true
    if(['i','em'].includes(tag)||style?.fontStyle==='italic')next.italic=true
    if(tag==='u'||style?.textDecoration.includes('underline'))next.underline=true
    if(['s','strike','del'].includes(tag)||style?.textDecoration.includes('line-through'))next.strike=true
    const foreground=color(style?.color??''),background=color(style?.backgroundColor??'')
    if(foreground)next.color=foreground
    if(background)next.background=background
    if(style?.fontSize)next.size=style.fontSize
    if(node.hasAttribute('data-bt-font'))next.font=node.getAttribute('data-bt-font') as RichAttributes['font']
    if(['left','center','right'].includes(style?.textAlign))next.align=style.textAlign as RichAttributes['align']
    if(tag==='a'){const href=safeLink(node.getAttribute('href'));if(href&&!options.template)next.link=href}
    if(tag==='li')next.list=node.parentElement?.tagName==='OL'?'ordered':'bullet'
    const field=node.getAttribute('data-bt-field')
    if(field&&options.template&&options.fields?.includes(field)){append({field},next);return}
    if(tag==='br'){newline(next);return}
    const block=['p','div','li','h1','h2','h3','h4','h5','h6','blockquote','pre'].includes(tag)
    for(const child of node.childNodes)visit(child,next,depth+1)
    if(block){
      const last=ops.at(-1)
      if(typeof last?.insert!=='string'||!last.insert.endsWith('\n'))newline({...(next.align?{align:next.align}:{}),...(next.list?{list:next.list}:{})})
      else if(next.align||next.list)last.attributes=readRichAttributes({...last.attributes,align:next.align,list:next.list})
    }
  }
  for(const node of doc.body.childNodes)visit(node)
  return readRichDocument({ops},options)
}
