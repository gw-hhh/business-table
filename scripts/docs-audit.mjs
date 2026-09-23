import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docsRoot = path.join(root, 'docs')
const referenceRoot = path.join(root, 'reference')
const categories = [
  '01-项目入门', '02-架构与规范', '03-业务模块', '04-版本记录',
  '05-实施计划', '06-验收记录', '07-参考与归档',
]
const errors = []
const markdown = new Map()
const docs = []
const edges = new Map()

const display = file => path.relative(root, file).split(path.sep).join('/') || '.'
const report = (file, line, message) => errors.push(`${display(file)}${line ? `:${line}` : ''}: ${message}`)
const within = (directory, file) => file === directory || file.startsWith(directory + path.sep)
const chinese = value => /\p{Script=Han}/u.test(value)
const numberedChinese = value => /^\d{2}-.+/u.test(value) && chinese(value.slice(3))
const monthName = value => /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function inspectDirectory(directory) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) { report(file, 0, '文档目录不应使用符号链接。'); continue }
    if (entry.isDirectory()) inspectDirectory(file)
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) docs.push(file)
  }
}

function requireFile(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) report(file, 0, '缺少必需的文档。')
}

function validateNames() {
  requireFile(path.join(docsRoot, 'README.md'))
  for (const category of categories) requireFile(path.join(docsRoot, category, 'README.md'))
  requireFile(path.join(docsRoot, '04-版本记录', '00-版本说明模板.md'))

  const dailyVersions = new Map()
  for (const file of docs) {
    const parts = path.relative(docsRoot, file).split(path.sep)
    if (parts.length === 1) {
      if (parts[0] !== 'README.md') report(file, 0, 'docs 根目录只保留 README.md；其他文档应归入七个编号分类。')
      continue
    }
    const [category, ...rest] = parts
    if (!categories.includes(category)) { report(file, 0, '文档必须位于 01–07 的中文编号分类中。'); continue }
    const name = rest.at(-1)
    const subdirs = rest.slice(0, -1)
    if (category === '04-版本记录') {
      if (!subdirs.length) {
        if (name !== 'README.md' && name !== '00-版本说明模板.md') report(file, 0, '版本记录根目录只允许 README.md 和 00-版本说明模板.md。')
      } else if (subdirs.length !== 1 || !monthName(subdirs[0])) {
        report(file, 0, '版本记录必须放在 YYYY-MM 月份目录。')
      } else if (name !== 'README.md') {
        const match = /^(\d{4}-\d{2}-\d{2})-(\d{2})-(.+)\.md$/u.exec(name)
        if (!match || !validDate(match[1]) || !match[1].startsWith(subdirs[0] + '-') || !chinese(match[3]) || match[2] === '00') {
          report(file, 0, '版本文件应命名为 YYYY-MM-DD-当日两位顺序-中文主题.md，且日期属于所在月份。')
        } else {
          const key = `${subdirs[0]}/${match[1]}`
          dailyVersions.set(key, [...(dailyVersions.get(key) ?? []), Number(match[2])])
        }
      }
      continue
    }
    if (category === '05-实施计划') {
      if (!subdirs.length) {
        if (name !== 'README.md') report(file, 0, '实施计划根目录只允许 README.md。')
      } else if (subdirs.length !== 1 || !monthName(subdirs[0])) {
        report(file, 0, '实施计划必须放在 YYYY-MM 月份目录。')
      } else if (name !== 'README.md') {
        const match = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/u.exec(name)
        if (!match || !validDate(match[1]) || !match[1].startsWith(subdirs[0] + '-') || !chinese(match[2]))
          report(file, 0, '计划文件应命名为 YYYY-MM-DD-中文主题.md，且日期属于所在月份。')
      }
      continue
    }
    if (category === '06-验收记录') {
      if (!subdirs.length) {
        if (name !== 'README.md') report(file, 0, '验收记录根目录只允许 README.md。')
      } else if (subdirs.length === 1 && monthName(subdirs[0])) {
        if (name !== 'README.md') report(file, 0, '验收记录应位于月份下的 日期-主题/README.md。')
      } else if (subdirs.length !== 2 || !monthName(subdirs[0])) {
        report(file, 0, '验收记录应位于 YYYY-MM/YYYY-MM-DD-中文主题/README.md。')
      } else {
        const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/u.exec(subdirs[1])
        if (!match || !validDate(match[1]) || !match[1].startsWith(subdirs[0] + '-') || !chinese(match[2]) || name !== 'README.md')
          report(file, 0, '验收记录应位于 YYYY-MM/YYYY-MM-DD-中文主题/README.md。')
      }
      continue
    }
    if (subdirs.some(part => !numberedChinese(part)) || name !== 'README.md' && (!name.endsWith('.md') || !numberedChinese(name.slice(0, -3))))
      report(file, 0, '文档与子目录应使用两位编号加中文主题；目录索引用 README.md。')
  }

  for (const [day, sequence] of dailyVersions) {
    const sorted = [...sequence].sort((a, b) => a - b)
    if (sorted.some((value, index) => value !== index + 1))
      report(path.join(docsRoot, '04-版本记录', day.split('/')[0]), 0, `${day.split('/')[1]} 的版本顺序应从 01 连续编号。`)
  }

  for (const category of categories) {
    const directory = path.join(docsRoot, category)
    if (!fs.existsSync(directory)) continue
    const visit = (parent, depth = 0) => {
      for (const child of fs.readdirSync(parent, { withFileTypes: true })) {
        if (!child.isDirectory()) continue
        const childPath = path.join(parent, child.name)
        if (depth === 0 && ['04-版本记录', '05-实施计划', '06-验收记录'].includes(category)) {
          if (!monthName(child.name)) report(childPath, 0, '月份目录应命名为 YYYY-MM。')
          requireFile(path.join(childPath, 'README.md'))
        } else if (category === '06-验收记录' && depth === 1) {
          const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/u.exec(child.name)
          if (!match || !validDate(match[1]) || !match[1].startsWith(path.basename(parent) + '-') || !chinese(match[2]))
            report(childPath, 0, '验收子目录应命名为 YYYY-MM-DD-中文主题，且日期属于所在月份。')
          requireFile(path.join(childPath, 'README.md'))
        } else if (!['04-版本记录', '05-实施计划', '06-验收记录'].includes(category) && !numberedChinese(child.name)) {
          report(childPath, 0, '子目录应使用两位编号加中文主题。')
        } else if (['04-版本记录', '05-实施计划', '06-验收记录'].includes(category)) {
          report(childPath, 0, '该分类存在多余的目录层级。')
        }
        visit(childPath, depth + 1)
      }
    }
    visit(directory)
  }
}

function visibleLines(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').split('\n')
  let fence, indented = false
  return lines.map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.char}{${fence.length},}[ \\t]*$`).test(line)) fence = undefined
      return ''
    }
    if (marker) { fence = { char: marker[1][0], length: marker[1].length }; return '' }
    if (/^(?: {4}|\t)/.test(line) && !/^\s*(?:[-+*]|\d+[.)])\s/.test(line)) { indented = true; return '' }
    if (line.trim()) indented = false
    if (indented) return ''
    return line
  })
}

function maskInlineCode(line) {
  let result = '', index = 0
  while (index < line.length) {
    if (line[index] !== '`') { result += line[index++]; continue }
    let end = index + 1
    while (line[end] === '`') end++
    const run = end - index
    const close = line.slice(end).search(new RegExp(`(?<!\x60)\x60{${run}}(?!\x60)`))
    if (close < 0) { result += line.slice(index, end); index = end; continue }
    const finish = end + close + run
    result += ' '.repeat(finish - index)
    index = finish
  }
  return result
}

function slug(text) {
  return text.replace(/<[^>]*>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '')
    .replace(/\s+/g, '-')
}

function referenceKey(value) { return value.trim().replace(/\s+/g, ' ').toLowerCase() }

function parseMarkdown(file) {
  if (markdown.has(file)) return markdown.get(file)
  const lines = visibleLines(file), anchors = new Set(), refs = new Map(), duplicates = new Map()
  let previous = ''
  for (const [index, line] of lines.entries()) {
    if (!line) { previous = ''; continue }
    const atx = /^ {0,3}#{1,6}(?:[ \t]+|$)(.*)$/.exec(line)
    const setext = /^ {0,3}(?:=+|-+)[ \t]*$/.test(line) && previous.trim()
    if (atx || setext) {
      const title = atx ? atx[1].replace(/[ \t]+#+[ \t]*$/, '') : previous
      const base = slug(title)
      if (base) {
        const count = duplicates.get(base) ?? 0
        anchors.add(count ? `${base}-${count}` : base)
        duplicates.set(base, count + 1)
      }
    }
    const outsideCode = maskInlineCode(line)
    for (const match of outsideCode.matchAll(/<(?:a|h[1-6]|span)\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi)) anchors.add(match[1])
    for (const match of outsideCode.matchAll(/<a\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>/gi)) anchors.add(match[1])
    const definition = /^ {0,3}\[([^\]]+)\]:[ \t]*(?:<([^>]+)>|(\S+))/.exec(line)
    if (definition) {
      const key = referenceKey(definition[1])
      if (!refs.has(key)) refs.set(key, { target: definition[2] ?? definition[3], line: index + 1 })
    }
    previous = line
  }
  const parsed = { lines, anchors, refs }
  markdown.set(file, parsed)
  return parsed
}

function closingBracket(line, start) {
  let depth = 0
  for (let index = start; index < line.length; index++) {
    if (line[index] === '\\') { index++; continue }
    if (line[index] === '[') depth++
    else if (line[index] === ']' && --depth === 0) return index
  }
  return -1
}

function inlineDestination(line, start) {
  let index = start + 1
  while (line[index] === ' ' || line[index] === '\t') index++
  if (line[index] === '<') {
    const end = line.indexOf('>', index + 1)
    if (end < 0) return
    const close = line.indexOf(')', end + 1)
    if (close < 0) return
    return { target: line.slice(index + 1, end), end: close }
  }
  const begin = index
  let depth = 0
  while (index < line.length) {
    const char = line[index]
    if (char === '\\') { index += 2; continue }
    if (char === '(') depth++
    else if (char === ')') {
      if (!depth) return { target: line.slice(begin, index), end: index }
      depth--
    } else if ((char === ' ' || char === '\t') && !depth) {
      const close = line.indexOf(')', index)
      return close < 0 ? undefined : { target: line.slice(begin, index), end: close }
    }
    index++
  }
}

function findLinks(file) {
  const { lines, refs } = parseMarkdown(file)
  const links = []
  for (const [index, original] of lines.entries()) {
    if (!original || /^ {0,3}\[[^\]]+\]:/.test(original)) continue
    const line = maskInlineCode(original)
    for (let offset = 0; offset < line.length; offset++) {
      if (line[offset] !== '[' || offset && line[offset - 1] === '\\') continue
      const close = closingBracket(line, offset)
      if (close < 0) continue
      const label = line.slice(offset + 1, close)
      const isImage = offset > 0 && line[offset - 1] === '!'
      if (line[close + 1] === '(') {
        const destination = inlineDestination(line, close + 1)
        if (destination) { links.push({ target: destination.target, line: index + 1, isImage }); offset = destination.end }
        continue
      }
      if (line[close + 1] === '[') {
        const end = closingBracket(line, close + 1)
        if (end < 0) continue
        const key = referenceKey(line.slice(close + 2, end) || label)
        const reference = refs.get(key)
        if (reference) links.push({ target: reference.target, line: index + 1, isImage })
        else report(file, index + 1, `未找到链接引用定义 [${key}]。`)
        offset = end
        continue
      }
      const reference = refs.get(referenceKey(label))
      if (reference) { links.push({ target: reference.target, line: index + 1, isImage }); offset = close }
    }
    for (const match of line.matchAll(/<(a|img)\b[^>]*\b(?:href|src)\s*=\s*["']([^"']+)["'][^>]*>/gi))
      links.push({ target: match[2], line: index + 1, isImage: match[1].toLowerCase() === 'img' })
  }
  return links
}

function inspectLink(source, line, destination, graphLink = false) {
  const target = destination.trim().replace(/\\([ ()])/g, '$1')
  const absoluteLocal = value => /^(?:[A-Za-z]:|file:)/i.test(value) || value.startsWith('/') || value.startsWith('\\')
  if (absoluteLocal(target)) { report(source, line, `本地绝对路径不可移植，请使用相对链接：${destination}`); return }
  if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) return
  const hash = target.indexOf('#')
  const rawPath = (hash < 0 ? target : target.slice(0, hash)).split('?')[0]
  const rawFragment = hash < 0 ? '' : target.slice(hash + 1)
  let decodedPath, fragment
  try {
    decodedPath = decodeURIComponent(rawPath)
    fragment = decodeURIComponent(rawFragment)
  } catch { report(source, line, `链接包含无效 URL 编码：${destination}`); return }
  if (absoluteLocal(decodedPath)) { report(source, line, `本地绝对路径不可移植，请使用相对链接：${destination}`); return }
  let resolved = rawPath ? path.resolve(path.dirname(source), decodedPath.replace(/\//g, path.sep)) : source
  if (!within(root, resolved)) { report(source, line, `链接超出项目目录：${destination}`); return }
  if (!fs.existsSync(resolved)) { report(source, line, `链接目标不存在：${destination}`); return }
  const actual = fs.realpathSync(resolved)
  if (!within(root, actual)) { report(source, line, `链接通过符号链接指向项目外：${destination}`); return }
  if (fs.statSync(resolved).isDirectory()) {
    const readme = path.join(resolved, 'README.md')
    if (!fs.existsSync(readme)) { report(source, line, `链接目录缺少 README.md：${destination}`); return }
    resolved = readme
  }
  if (graphLink && within(docsRoot, resolved) && resolved.toLowerCase().endsWith('.md')) edges.get(source)?.add(resolved)
  if (!fragment || within(referenceRoot, actual)) return
  if (resolved.toLowerCase().endsWith('.md')) {
    const anchors = parseMarkdown(resolved).anchors
    if (!anchors.has(fragment) && !anchors.has(fragment.toLowerCase())) report(source, line, `目标标题锚点不存在：${destination}`)
  } else if (/^L(\d+)(?:-L(\d+))?$/i.test(fragment)) {
    const match = /^L(\d+)(?:-L(\d+))?$/i.exec(fragment)
    const count = fs.readFileSync(resolved, 'utf8').split(/\r\n?|\n/).length
    if (Number(match[1]) < 1 || Number(match[1]) > count || match[2] && (Number(match[2]) < Number(match[1]) || Number(match[2]) > count))
      report(source, line, `目标行号锚点不存在：${destination}`)
  } else report(source, line, `无法在非 Markdown 目标验证锚点：${destination}`)
}

function auditLinks() {
  const sources = [
    path.join(root, 'README.md'), path.join(root, 'AGENTS.md'), path.join(root, 'CHANGELOG.md'), ...docs,
  ].filter(file => fs.existsSync(file))
  for (const name of ['README.md', 'AGENTS.md', 'CHANGELOG.md']) requireFile(path.join(root, name))
  for (const file of docs) edges.set(file, new Set())
  for (const file of sources) {
    const parsed = parseMarkdown(file)
    for (const definition of parsed.refs.values()) inspectLink(file, definition.line, definition.target)
    for (const link of findLinks(file)) inspectLink(file, link.line, link.target, !link.isImage)
  }
}

function auditReachability() {
  const start = path.join(docsRoot, 'README.md')
  if (!edges.has(start)) return
  const seen = new Set([start]), queue = [start]
  while (queue.length) for (const next of edges.get(queue.shift()) ?? []) {
    if (seen.has(next)) continue
    seen.add(next); queue.push(next)
  }
  for (const file of docs) if (!seen.has(file)) report(file, 0, '无法从 docs/README.md 的文档链接索引到达。')
  for (const file of docs) {
    if (file === start) continue
    const directory = path.dirname(file)
    const index = path.basename(file) === 'README.md'
      ? path.join(path.dirname(directory), 'README.md')
      : path.join(directory, 'README.md')
    if (!edges.get(index)?.has(file)) report(file, 0, `未在所属目录索引 ${display(index)} 中列出。`)
  }
}

inspectDirectory(docsRoot)
validateNames()
auditLinks()
auditReachability()

if (errors.length) {
  for (const error of errors.sort()) console.error(error)
  console.error(`DOCS AUDIT FAILED: ${errors.length} 个问题，检查了 ${docs.length} 篇 docs Markdown。`)
  process.exitCode = 1
} else console.log(`DOCS AUDIT OK: ${docs.length} 篇 docs Markdown，目录、链接、锚点和索引均有效。`)
