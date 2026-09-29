import {createApp} from 'vue'
import BusinessTablePlugin from '../src'

// Each loader owns its preload dependencies; conditional import expressions can
// make the production transform preload another example's feature modules.
const examples={
  quotation:()=>import('./App.vue'),
  config:()=>import('./ConfigExample.vue'),
  composition:()=>import('./CompositionExample.vue'),
  performance:()=>import('./PerformanceExample.vue'),
}
function isExample(value:string|null):value is keyof typeof examples{return value!==null&&Object.hasOwn(examples,value)}
const example=new URLSearchParams(location.search).get('example')
const {default:App}=await examples[isExample(example)?example:'quotation']()
try{const app=createApp(App);app.config.errorHandler=e=>{console.error('[BusinessTable]',e);document.body.dataset.startupError=String(e)};app.use(BusinessTablePlugin);app.mount('#app')}catch(e){console.error('[BusinessTable startup]',e);document.getElementById('app')!.innerHTML=`<pre>BusinessTable Demo 启动失败\n${String(e)}</pre>`}
