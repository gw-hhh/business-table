import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
for (const entry of [pkg.main, pkg.module, pkg.types, pkg.exports['./style.css']]) {
  assert(existsSync(join(root, entry)), `Missing packaged entry: ${entry}`)
}
const workspace = mkdtempSync(join(tmpdir(), 'business-table-consumer-'))
try {
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', workspace], { cwd: root, encoding: 'utf8' }))
  assert(pack.files.some(file => file.path === pkg.types), 'Type entry not included by npm pack')
  assert(!pack.files.some(file => file.path.startsWith('src/') || file.path.startsWith('reference/')), 'Source/reference must not enter the runtime package')
  const consumerPackage = join(workspace, 'node_modules', ...pkg.name.split('/'))
  mkdirSync(consumerPackage, { recursive: true })
  execFileSync('tar', ['xzf', join(workspace, pack.filename), '-C', consumerPackage, '--strip-components=1'])
  // Install only the existing locked peers into this independent consumer.
  for (const name of ['vue','vxe-table','vxe-pc-ui','zod','@vxe-ui/core','xe-utils','dom-zindex']) {
    const target = join(workspace, 'node_modules', ...name.split('/'))
    mkdirSync(resolve(target, '..'), { recursive: true })
    symlinkSync(join(root, 'node_modules', ...name.split('/')), target, 'dir')
  }
  writeFileSync(join(workspace, 'package.json'), JSON.stringify({ type: 'module' }))
  writeFileSync(join(workspace, 'consumer.ts'), `
    import { h } from 'vue'
    import { BusinessTable, ConfiguredBusinessTable, type ColumnConfig, type FilterState, type FiltersContext, type FilterGroup, type FilterPlanPersistence, createRegistry } from '${pkg.name}'
    const columns: ColumnConfig<{id:string}>[] = [{id:'id', field:'id', title:'编号'}]
    const table = h(BusinessTable, {columns, data:[{id:'1'}]})
    const registry = createRegistry<{id:string}>()
    const group: FilterGroup = {logic:'and', rules:[{field:'id', operator:'eq', value:'1'}]}
    const state: FilterState = {columnFilters:[], filterGroup:group}
    const plans: FilterPlanPersistence = {load: async () => null, save: async (_tableKey, _envelope) => {}}
    const configured = h(ConfiguredBusinessTable, {definition:{schemaVersion:3,tableKey:'independent',columns,features:{filters:true}},filterPlanPersistence:plans,data:[{id:'1'}]})
    function applyFilter(context: FiltersContext) { return context.apply(state) }
    export { table, configured, registry, applyFilter }
  `)
  writeFileSync(join(workspace, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
    lib: ['ES2023', 'DOM', 'DOM.Iterable'], skipLibCheck: false, noEmit: true,
  }, files: ['consumer.ts'] }))
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(workspace, 'tsconfig.json')], { cwd: workspace, stdio: 'pipe' })
  console.log(`PACKAGE AUDIT OK: ${pack.files.length} packed files; declared entries and independent TypeScript consumer`)
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout)
  throw error
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
