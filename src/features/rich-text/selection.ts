import type {TextRange} from './editor-model'
interface Point {node:Node;offset:number}
interface Segment {start:number;end:number;before:Point;after:Point;text?:Text}
/** DOM coordinates stay local to an editor instance, including atomic field chips. */
function coordinates(root:HTMLElement){
  const starts=new Map<Node,number>(),children=new Map<Node,number[]>(),segments:Segment[]=[]
  let cursor=0,last=''
  const around=(node:Node,after:boolean):Point=>({node:node.parentNode!,offset:Array.prototype.indexOf.call(node.parentNode!.childNodes,node)+(after?1:0)})
  const walk=(node:Node):void=>{
    starts.set(node,cursor)
    if(node.nodeType===Node.TEXT_NODE){const text=node as Text;segments.push({start:cursor,end:cursor+text.length,before:{node,offset:0},after:{node,offset:text.length},text});cursor+=text.length;last=text.data.slice(-1)||last;return}
    if(node instanceof Element&&node.hasAttribute('data-bt-field')){segments.push({start:cursor,end:cursor+1,before:around(node,false),after:around(node,true)});cursor++;last='\ufffc';return}
    if(node instanceof HTMLBRElement){segments.push({start:cursor,end:cursor+1,before:around(node,false),after:around(node,true)});cursor++;last='\n';return}
    const positions:number[]=[]
    for(const child of node.childNodes){positions.push(cursor);walk(child)}
    positions.push(cursor);children.set(node,positions)
    if(node!==root&&node instanceof Element&&['P','DIV','LI','H1','H2','H3','BLOCKQUOTE'].includes(node.tagName)&&last!=='\n'){
      segments.push({start:cursor,end:cursor+1,before:{node,offset:node.childNodes.length},after:around(node,true)});cursor++;last='\n'
    }
  }
  walk(root)
  return {starts,children,segments,size:cursor}
}
export function editorSelection(root:HTMLElement):TextRange|null{
  const selection=window.getSelection()
  if(!selection?.anchorNode||!selection.focusNode||!root.contains(selection.anchorNode)||!root.contains(selection.focusNode))return null
  const map=coordinates(root)
  const position=(node:Node,offset:number)=>node.nodeType===Node.TEXT_NODE?(map.starts.get(node)??0)+offset:map.children.get(node)?.[offset]??map.starts.get(node)??0
  const a=position(selection.anchorNode,selection.anchorOffset),b=position(selection.focusNode,selection.focusOffset)
  return {start:Math.min(a,b),end:Math.max(a,b)}
}
export function restoreEditorSelection(root:HTMLElement,range:TextRange):void{
  const {segments,size}=coordinates(root)
  const point=(position:number):Point=>{
    const target=Math.max(0,Math.min(size,position))
    for(const segment of segments){
      if(target<segment.start||target>segment.end)continue
      if(segment.text)return {node:segment.text,offset:Math.min(segment.text.length,target-segment.start)}
      return target===segment.start?segment.before:segment.after
    }
    return {node:root,offset:root.childNodes.length}
  }
  const start=point(range.start),end=point(range.end),selection=window.getSelection(),domRange=document.createRange()
  domRange.setStart(start.node,start.offset);domRange.setEnd(end.node,end.offset);selection?.removeAllRanges();selection?.addRange(domRange)
}
