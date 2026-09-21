import {defineComponent,type PropType,type VNodeChild} from 'vue'
import type {ColumnConfig,RowData} from '../types'
import type {ConfigDiagnostic} from '../config/diagnostics'
export default defineComponent({
  props:{
    value:null,
    row:{type:Object as PropType<RowData>,required:true},
    column:{type:Object as PropType<ColumnConfig>,required:true},
    renderer:{type:Function as PropType<(value:unknown,row:RowData,column:ColumnConfig)=>VNodeChild>,required:true},
  },
  emits:{diagnostic:(_diagnostic:ConfigDiagnostic)=>true},
  setup(props,{emit}){return ()=>{
    try{return props.renderer(props.value,props.row,props.column)}
    catch(cause){emit('diagnostic',{code:'RuntimeExtensionError',path:'renderer.'+props.column.id,message:cause instanceof Error?cause.message:String(cause)});return String(props.value??'—')}
  }},
})
