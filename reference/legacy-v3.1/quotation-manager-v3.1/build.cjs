'use strict';
// 使用同一套源文件生成离线单文件，不维护第二套业务实现。
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, name) => `<style>\n${fs.readFileSync(path.join(root, name), 'utf8')}\n</style>`);
html = html.replace(/<script src="([^"]+)" defer><\/script>/g, (_, name) => `<script>\n${fs.readFileSync(path.join(root, name), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);
const destination = path.join(root, 'quotation-manager.html');
fs.writeFileSync(destination, html, 'utf8');
console.log(`Generated ${destination} (${Buffer.byteLength(html)} bytes)`);
