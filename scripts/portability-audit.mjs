import fs from 'node:fs';import path from 'node:path'
const roots=['src','demo','scripts','tests','docs'];const files=['package.json','vite.config.ts','vite.demo.config.ts','verify-release.cmd','verify-release.sh','start-demo.cmd','start-demo.sh'];const patterns=[/\/opt\/nvm\//i,/C:\\Users\\/i,/C:\\opt\\nvm\\/i,/file:\/\/[A-Za-z]:\//i];const hits=[]
function scan(f){if(!fs.existsSync(f))return;const s=fs.readFileSync(f,'utf8');for(const p of patterns)if(p.test(s))hits.push(f+': '+p)}
function walk(d){if(!fs.existsSync(d))return;for(const n of fs.readdirSync(d)){const f=path.join(d,n),s=fs.statSync(f);if(s.isDirectory())walk(f);else scan(f)}}
roots.forEach(walk);files.forEach(scan);if(hits.length){console.error('PORTABILITY AUDIT FAILED');hits.forEach(x=>console.error('- '+x));process.exit(1)}console.log('PORTABILITY AUDIT OK')
