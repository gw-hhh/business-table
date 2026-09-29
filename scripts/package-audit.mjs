import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
for (const entry of [pkg.main, pkg.module, pkg.types, pkg.exports['./style.css'],pkg.exports['./runtime'].import,pkg.exports['./runtime'].types,pkg.exports['./components'].import,pkg.exports['./components'].types]) {
  assert(existsSync(join(root, entry)), `Missing packaged entry: ${entry}`)
}
const workspace = mkdtempSync(join(tmpdir(), 'business-table-consumer-'))
try {
  // On Windows `npm` is a command shim, which execFileSync cannot spawn directly.
  const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const npmCommand = existsSync(npmCli) ? process.execPath : 'npm'
  const npmArgs = [...(existsSync(npmCli) ? [npmCli] : []), 'pack', '--json', '--pack-destination', workspace]
  const [pack] = JSON.parse(execFileSync(npmCommand, npmArgs, { cwd: root, encoding: 'utf8' }))
  assert(pack.files.some(file => file.path === pkg.types), 'Type entry not included by npm pack')
  assert(!pack.files.some(file => file.path.startsWith('src/') || file.path.startsWith('reference/')), 'Source/reference must not enter the runtime package')
  const consumerPackage = join(workspace, 'node_modules', ...pkg.name.split('/'))
  mkdirSync(consumerPackage, { recursive: true })
  execFileSync('tar', ['xzf', join(workspace, pack.filename), '-C', consumerPackage, '--strip-components=1'])
  // Install only the existing locked peers into this independent consumer.
  for (const name of new Set(['vue','vxe-table','vxe-pc-ui',...Object.keys(pkg.dependencies)])) {
    const target = join(workspace, 'node_modules', ...name.split('/'))
    mkdirSync(resolve(target, '..'), { recursive: true })
    symlinkSync(join(root, 'node_modules', ...name.split('/')), target, process.platform === 'win32' ? 'junction' : 'dir')
  }
  writeFileSync(join(workspace, 'package.json'), JSON.stringify({ type: 'module' }))
  // Executing the independent headless entry also catches accidental DOM/CSS dependencies.
  execFileSync(process.execPath,['--input-type=module','-e',`import {useTableRuntime} from '${pkg.name}/runtime'; if(typeof useTableRuntime!=='function') process.exit(1)`],{cwd:workspace,stdio:'pipe'})
  writeFileSync(join(workspace, 'consumer.ts'), `
    import { h } from 'vue'
    import { BusinessTable, ConfiguredBusinessTable, QuerySummary, SearchSummary, type SearchContext, type ToolDefinition, type ColumnConfig, type FilterState, type FiltersContext, type FilterGroup, type FilterPlanPersistence, createRegistry } from '${pkg.name}'
    const columns: ColumnConfig<{id:string}>[] = [{id:'id', field:'id', title:'编号'}]
    const table = h(BusinessTable, {columns, data:[{id:'1'}]})
    const registry = createRegistry<{id:string}>()
    const group: FilterGroup = {logic:'and', rules:[{field:'id', operator:'eq', value:'1'}]}
    const state: FilterState = {columnFilters:[], filterGroup:group}
    const plans: FilterPlanPersistence = {load: async () => null, save: async (_tableKey, _envelope) => {}}
    const configured = h(ConfiguredBusinessTable, {definition:{schemaVersion:3,tableKey:'independent',columns,features:{filters:true}},filterPlanPersistence:plans,querySummary:true,data:[{id:'1'}]})
    function applyFilter(context: FiltersContext) { return context.apply(state) }
    async function applyPlan(context: FiltersContext, id: string) { await context.plans?.load(); return context.apply(context.readPlan(id)) }
    function summary(context: SearchContext) { return [h(QuerySummary, {context, hasConditions:true, clear:context.reset}, {default:() => '附加条件'}), h(SearchSummary, {context})] }
    const tools: ToolDefinition[] = [{id:'data',label:'数据工具',children:[{id:'clear',label:'清除',handler:async()=>{}}]}]
    export { table, configured, registry, applyFilter, applyPlan, summary, tools }
  `)
  // Compile the actual shipped tutorials against public package exports, including Vue templates.
  const examplePrefix = 'docs/03-业务模块/01-接入示例/'
  const examples = pack.files.filter(file => file.path.startsWith(examplePrefix) && /\.(ts|vue)$/.test(file.path))
  assert(examples.length > 0, 'Packaged documentation examples are missing')
  writeFileSync(join(workspace, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
    lib: ['ES2023', 'DOM', 'DOM.Iterable'], skipLibCheck: false, noEmit: true, jsx: 'preserve',
  }, files: ['consumer.ts', ...examples.map(file => join(consumerPackage, file.path))] }))
  execFileSync(process.execPath, [join(root, 'node_modules/vue-tsc/bin/vue-tsc.js'), '-p', join(workspace, 'tsconfig.json')], { cwd: workspace, stdio: 'pipe' })
  console.log(`PACKAGE AUDIT OK: ${pack.files.length} packed files; independent consumer and ${examples.length} documentation examples (TypeScript + Vue templates)`)
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout)
  throw error
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
