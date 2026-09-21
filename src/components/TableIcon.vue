<script setup lang="ts">
withDefaults(defineProps<{name:string;size?:number}>(),{size:16})
const paths:Record<string,string>={
  file:'M7 3h7l4 4v14H7z M14 3v5h5 M10 12h5 M10 16h5',
  download:'M12 3v12 m-4-4 4 4 4-4 M5 15v5h14v-5',
  upload:'M12 16V4 m-4 4 4-4 4 4 M5 15v5h14v-5',
  plus:'M12 5v14 M5 12h14',more:'M5 12h.01 M12 12h.01 M19 12h.01',
  info:'M12 11v6 M12 7h.01 M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0',
  search:'M21 21l-5-5 M18 10a8 8 0 1 0-16 0 8 8 0 0 0 16 0',
  'chevron-down':'m7 10 5 5 5-5','chevron-up':'m7 14 5-5 5 5',
  'chevron-left':'m14 7-5 5 5 5','chevron-right':'m10 7 5 5-5 5',
  close:'m6 6 12 12 M6 18 18 6',bookmark:'M6 3h12v18l-6-4-6 4z',
  star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z',
  edit:'m15 4 5 5 M4 20l5-1L21 7l-5-5L4 14z',trash:'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  copy:'M9 9h12v12H9z M5 16H3V3h13v2',
  refresh:'M20 10a8 8 0 0 0-14-5L3 8 m0-5v5h5 M4 14a8 8 0 0 0 14 5l3-3 m0 5v-5h-5',
  density:'M5 5h14 M5 12h14 M5 19h14',sort:'M8 3v18 m-4-4 4 4 4-4 M16 21V3 m-4 4 4-4 4 4',
  columns:'M4 4h16v16H4z M9 4v16 M15 4v16',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.4 1.4 M17.6 17.6 19 19 M5 19l1.4-1.4 M17.6 6.4 19 5',
  filter:'M3 4h18l-7 8v8l-4-2v-6z',
  grip:'M9 5h.01 M15 5h.01 M9 12h.01 M15 12h.01 M9 19h.01 M15 19h.01',
  check:'m5 12 4 4L19 6',user:'M16 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  'pin-left':'M3.75 3.75v16.5h16.5V3.75H3.75zm3 15V5.25h3v13.5h-3z',
  'pin-right':'M20.25 3.75v16.5H3.75V3.75h16.5zm-3 15V5.25h-3v13.5h3z',
  'align-left':'M4 5h16 M4 10h10 M4 15h16 M4 20h10',
  'align-center':'M4 5h16 M7 10h10 M4 15h16 M7 20h10',
  'align-right':'M4 5h16 M10 10h10 M4 15h16 M10 20h10',
  batch:'M3 3h4v4H3z M3 10h4v4H3z M3 17h4v4H3z M12 5h9 M12 12h9 M12 19h9',
}
</script>
<template><svg class="bt-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name]??paths.file" :fill="name.startsWith('pin-')?'currentColor':'none'" :stroke="name.startsWith('pin-')?'none':'currentColor'" fill-rule="evenodd"/></svg></template>
