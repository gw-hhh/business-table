import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {resolve} from 'node:path'

export default defineConfig(({mode})=>({
  plugins:[vue()],resolve:{alias:{'@company/business-table/runtime':fileURLToPath(new URL('./src/entries/runtime.ts',import.meta.url)),'@company/business-table/components':fileURLToPath(new URL('./src/entries/components.ts',import.meta.url))}},
  build:{
    emptyOutDir:mode!=='umd',manifest:mode!=='umd',
    lib:mode==='umd'
      ?{entry:resolve(import.meta.dirname,'src/index.ts'),name:'BusinessTable',formats:['umd'],fileName:()=> 'business-table.umd.cjs',cssFileName:'business-table'}
      :{entry:{'business-table':resolve(import.meta.dirname,'src/index.ts'),runtime:resolve(import.meta.dirname,'src/entries/runtime.ts'),components:resolve(import.meta.dirname,'src/entries/components.ts')},formats:['es'],fileName:(_format,name)=>`${name}.js`,cssFileName:'business-table'},
    rollupOptions:{external:['vue','vxe-table'],output:{exports:'named',globals:{vue:'Vue','vxe-table':'VxeUITable'}}},
  },
}))
