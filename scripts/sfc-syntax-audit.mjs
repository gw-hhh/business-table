import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const root=path.resolve(process.cwd())
const req=createRequire(path.join(root,'package.json'))
let ts
try{const mod=req('typescript');ts=mod.default??mod}catch(e){console.error('[BusinessTable] Project-local TypeScript is missing. Run npm install first.');process.exit(1)}
const files=[]
function walk(dir){if(!fs.existsSync(dir))return;for(const n of fs.readdirSync(dir)){const f=path.join(dir,n),s=fs.statSync(f);if(s.isDirectory())walk(f);else if(n.endsWith('.vue'))files.push(f)}}
walk('src');walk('demo')
const failures=[]
for(const file of files){const source=fs.readFileSync(file,'utf8');const m=source.match(/<script\s+setup(?:\s+lang=["']ts["'])?[^>]*>([\s\S]*?)<\/script>/i);if(m){const r=ts.transpileModule(m[1],{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext},reportDiagnostics:true,fileName:file+'.ts'});for(const d of r.diagnostics??[])failures.push(file+': '+ts.flattenDiagnosticMessageText(d.messageText,' '))}if(!/<template>[\s\S]*<\/template>/.test(source))failures.push(file+': missing template')}
if(failures.length){console.error('SFC SYNTAX AUDIT FAILED');failures.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('SFC SYNTAX AUDIT OK:',files.length,'Vue SFCs')
