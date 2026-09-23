import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const sourceScript = resolve('scripts/docs-audit.mjs')
const prefix = 'business-table-docs-audit-'
const categories = [
  '01-项目入门', '02-架构与规范', '03-业务模块', '04-版本记录',
  '05-实施计划', '06-验收记录', '07-参考与归档',
]
const month = '2026-09'

function write(project: string, relative: string, content: string) {
  const file = join(project, relative)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content, 'utf8')
}

function makeProject(project: string) {
  mkdirSync(join(project, 'scripts'), { recursive: true })
  copyFileSync(sourceScript, join(project, 'scripts', 'docs-audit.mjs'))
  const guide = `docs/${encodeURIComponent('01-项目入门')}/${encodeURIComponent('01-中文标题.md')}#${encodeURIComponent('重复标题-1')}`
  write(project, 'README.md', `# 项目\n\n[文档](docs/README.md)\n[重复标题][指南]\n![图像](assets/图标.svg)\n[外链](https://example.org/)\n\n[指南]: ${guide}\n\n\`[忽略](missing-inline.md)\`\n\n\`\`\`md\n[忽略](missing-fenced.md)\n\`\`\`\n`)
  write(project, 'AGENTS.md', '# 规则\n')
  write(project, 'CHANGELOG.md', '# 版本\n')
  write(project, 'assets/图标.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n')
  write(project, 'docs/README.md', `# 文档导航\n\n${categories.map(category => `- [${category}](${category}/README.md)`).join('\n')}\n`)
  write(project, 'docs/01-项目入门/README.md', '# 项目入门\n\n[中文标题][条目]\n\n[条目]: 01-中文标题.md\n')
  write(project, 'docs/01-项目入门/01-中文标题.md', '# 重复标题\n\n## 重复标题\n')
  write(project, 'docs/02-架构与规范/README.md', '# 架构与规范\n')
  write(project, 'docs/03-业务模块/README.md', '# 业务模块\n')
  write(project, 'docs/04-版本记录/README.md', `# 版本记录\n\n- [模板](00-版本说明模板.md)\n- [${month}](${month}/README.md)\n`)
  write(project, 'docs/04-版本记录/00-版本说明模板.md', '# 模板\n')
  write(project, `docs/04-版本记录/${month}/README.md`, '# 九月版本\n\n[记录](2026-09-23-01-首个版本.md)\n')
  write(project, `docs/04-版本记录/${month}/2026-09-23-01-首个版本.md`, '# 首个版本\n')
  write(project, 'docs/05-实施计划/README.md', `# 实施计划\n\n[${month}](${month}/README.md)\n`)
  write(project, `docs/05-实施计划/${month}/README.md`, '# 九月计划\n\n[计划](2026-09-23-首个计划.md)\n')
  write(project, `docs/05-实施计划/${month}/2026-09-23-首个计划.md`, '# 首个计划\n')
  write(project, 'docs/06-验收记录/README.md', `# 验收记录\n\n[${month}](${month}/README.md)\n`)
  write(project, `docs/06-验收记录/${month}/README.md`, '# 九月验收\n\n[验收](2026-09-23-首次验收/README.md)\n')
  write(project, `docs/06-验收记录/${month}/2026-09-23-首次验收/README.md`, '# 首次验收\n')
  write(project, 'docs/07-参考与归档/README.md', '# 参考与归档\n')
}

function withProject<T>(use: (project: string) => T): T {
  const tempParent = realpathSync(tmpdir())
  const project = mkdtempSync(join(tempParent, prefix))
  try {
    makeProject(project)
    return use(project)
  } finally {
    const actual = realpathSync(project)
    if (dirname(actual) !== tempParent || !basename(actual).startsWith(prefix) || lstatSync(project).isSymbolicLink())
      throw new Error(`Refusing to remove unexpected temporary directory: ${project}`)
    rmSync(project, { recursive: true, force: true })
  }
}

function audit(project: string) {
  return spawnSync(process.execPath, [join(project, 'scripts', 'docs-audit.mjs')], {
    cwd: project, encoding: 'utf8', timeout: 10_000,
  })
}

describe('docs audit', () => {
  it('accepts encoded Chinese links, duplicate heading anchors, references and existing images while ignoring code', () => withProject(project => {
    const result = audit(project)
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('DOCS AUDIT OK')
  }))

  it('reports a broken relative link', () => withProject(project => {
    write(project, 'README.md', `${readFileSync(join(project, 'README.md'), 'utf8')}\n[失效](docs/01-项目入门/99-失效.md)\n`)
    const result = audit(project)
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/README\.md.*链接目标不存在.*99-失效\.md/)
  }))

  it('reports a missing heading anchor', () => withProject(project => {
    write(project, 'README.md', `${readFileSync(join(project, 'README.md'), 'utf8')}\n[失效](docs/01-项目入门/01-中文标题.md#不存在)\n`)
    const result = audit(project)
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/README\.md.*目标标题锚点不存在.*#不存在/)
  }))

  it.each(['04-版本记录', '05-实施计划', '06-验收记录'])('requires the %s month README', category => withProject(project => {
    unlinkSync(join(project, 'docs', category, month, 'README.md'))
    const result = audit(project)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`docs/${category}/${month}/README.md: 缺少必需的文档。`)
  }))

  it.each([
    'C:/docs/README.md',
    String.raw`C:\docs\README.md`,
    '/docs/README.md',
    String.raw`\\server\share\README.md`,
    'file:///C:/docs/README.md',
  ])('rejects absolute Markdown destination %s', destination => withProject(project => {
    write(project, 'README.md', `${readFileSync(join(project, 'README.md'), 'utf8')}\n[绝对路径](${destination})\n`)
    const result = audit(project)
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/相对链接|绝对路径/)
    expect(result.stderr).toContain(destination)
  }))

  it('requires each document to be listed by its own directory README even when globally reachable', () => withProject(project => {
    write(project, 'docs/01-项目入门/README.md', '# 项目入门\n')
    write(project, 'docs/02-架构与规范/README.md', '# 架构与规范\n\n[跨目录链接](../01-项目入门/01-中文标题.md)\n')
    const result = audit(project)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('01-中文标题.md')
    expect(result.stderr).toMatch(/索引|目录.*README/)
  }))
})
