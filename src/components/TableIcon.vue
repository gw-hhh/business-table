<script setup lang="ts">
import { computed } from 'vue'
const props=withDefaults(defineProps<{name:string;size?:number}>(),{size:16})
const filled=computed(()=>props.name==='pin-left'||props.name==='pin-right')
// Approved static icon drawings; no dependency on the legacy runtime.
const paths:Record<string,string>={
  file:'M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h6',
  download:'M12 3v12m-5-5 5 5 5-5M5 15v5h14v-5',
  upload:'M12 16V4m-5 5 5-5 5 5M5 16v4h14v-4',
  plus:'M12 5v14M5 12h14',more:'M5 12h.01M12 12h.01M19 12h.01',
  info:'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  search:'m21 21-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  'chevron-down':'m6 9 6 6 6-6','chevron-up':'m6 15 6-6 6 6',
  'chevron-left':'m15 6-6 6 6 6','chevron-right':'m9 6 6 6-6 6',
  close:'m6 6 12 12M6 18 18 6',bookmark:'M6 3h12v18l-6-4-6 4V3Z',
  star:'m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.3-.9L12 3Z',
  edit:'m15 5 4 4M4 20l4-1 12-12-4-4L4 15v5Z',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  copy:'M8 8h13v13H8V8Zm8-4V2H2v14h2',
  refresh:'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11-2l3 3M4 16l3 3a7 7 0 0 0 11-2',
  density:'M4 5h16M4 12h16M4 19h16',sort:'m8 4-3 3m3-3 3 3M8 4v16m8 0-3-3m3 3 3-3m-3 3V4',
  columns:'M3 4h18v16H3V4Zm6 0v16m6-16v16',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  filter:'M3 4h18l-7 8v7l-4 2v-9L3 4Z',
  grip:'M9 4h.01M15 4h.01M9 12h.01M15 12h.01M9 20h.01M15 20h.01',
  check:'m5 12 4 4L19 6',user:'M16 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  'pin-left':'M160 160v704h704V160H160zm128 640V224h128v576H288z',
  'pin-right':'M864 160v704H160V160h704zm-128 640V224H608v576h128z',
  'align-left':'M4 5h16 M4 10h10 M4 15h16 M4 20h10',
  'align-center':'M4 5h16 M7 10h10 M4 15h16 M7 20h10',
  'align-right':'M4 5h16 M10 10h10 M4 15h16 M10 20h10',
  batch:'M4 4h5v5H4V4Zm0 11h5v5H4v-5Zm9-9h7m-7 12h7',
}
</script>
<template><svg class="bt-icon" :width="size" :height="size" :viewBox="filled?'0 0 1024 1024':'0 0 24 24'" fill="none" stroke="currentColor" :stroke-width="name==='more'||name==='grip'?3:1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path :d="paths[name]??paths.file" :fill="filled?'currentColor':'none'" :stroke="filled?'none':'currentColor'" fill-rule="evenodd"/></svg></template>
