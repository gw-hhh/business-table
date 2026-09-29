import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {gzipSync} from 'node:zlib'
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist')
const manifest=JSON.parse(fs.readFileSync(path.join(dist,'.vite/manifest.json'),'utf8'))
function graph(key,seen=new Set()){
  if(seen.has(key))return seen
  assert(manifest[key],`Missing manifest entry ${key}`)
  seen.add(key)
  for(const child of manifest[key].imports??[])graph(child,seen)
  return seen
}
function readGraph(key){const keys=[...graph(key)];return {keys,text:keys.map(id=>fs.readFileSync(path.join(dist,manifest[id].file),'utf8')).join('\n')}}
const core=readGraph('src/entries/runtime.ts')
assert(!core.text.includes('ProseMirror'),'Headless runtime must not contain the editor')
assert(!/from\s*["']vxe-table["']/.test(core.text),'Headless runtime must not import VXE')
assert(core.keys.every(key=>!(manifest[key].css?.length)),'Headless runtime must not request CSS')
const standard=readGraph('src/index.ts')
assert(!standard.text.includes('ProseMirror'),'Default table must load the editor on interaction')
const editor=Object.values(manifest).find(entry=>entry.src?.endsWith('/RichEditor.vue'))
assert(editor?.isDynamicEntry,'Editor must be an asynchronous ESM entry')
const measurements={runtime:{bytes:Buffer.byteLength(core.text),gzip:gzipSync(core.text).length},defaultStatic:{bytes:Buffer.byteLength(standard.text),gzip:gzipSync(standard.text).length},editorEntry:editor.file}
console.log('BUNDLE AUDIT OK:',JSON.stringify(measurements))
