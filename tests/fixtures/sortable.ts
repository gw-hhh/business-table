import type Sortable from 'sortablejs'

/** Full library event shape for testing our callbacks at the engine boundary. */
export function sortableEvent(list:HTMLElement,item:HTMLElement,type:string):Sortable.SortableEvent{
  return Object.assign(Object.defineProperty(new Event('sort'),'target',{value:list,writable:true}),{
    item,from:list,to:list,target:list,originalEvent:new MouseEvent(type,{bubbles:true}),clone:item,items:[],
    oldIndex:0,newIndex:0,oldDraggableIndex:0,newDraggableIndex:0,pullMode:undefined,oldIndicies:[],newIndicies:[],swapItem:null,
  })
}
