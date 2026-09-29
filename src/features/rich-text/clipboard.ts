import {readRichAttributes,readRichDocument,safeLink,type RichAttributes,type RichDocument,type RichOperation,type RichReadOptions} from './document'

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
