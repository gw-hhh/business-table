import {resolvePresentation,presentationDelta,defaultPresentation,type TablePresentation} from '../features/presentation/model'
import { z } from 'zod'
import {ruleFieldSchemas} from '../features/columns/schema'
import {readConditionalRules,type ConditionalRule} from '../features/conditional-formatting/model'
import type { TableConfig } from '../types'
import type { UserColumnConfig } from '../types'
import type { ConfigDiagnostic, DiagnosticReporter } from './diagnostics'
import type { ColumnCapabilities, ConfigurableColumn, PreferenceV2, PreferenceV3, ResolveConfigurationInput, ResolvedConfiguration } from './types'
import { applyColumnPatches, columnTextStyleSchema, guardColumnPatch, isColumnCapabilityApplicable, isRecord, own, parseColumnPatch } from './columns'
import type {ConfigurationObserver, ConfigurationObservers} from './observation'

const kind = 'business-table-preference' as const
const positiveInteger = z.number().int().positive()
const fixed = z.union([z.literal(false), z.literal('left'), z.literal('right')])
const definitionEnvelope = z.object({ schemaVersion: z.literal(3), tableKey: z.string().min(1) })
const preferenceEnvelope = z.object({ schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]), tableKey: z.string().min(1) })
const requiredColumn = z.object({ id: z.string().min(1), field: z.string().min(1), title: z.string() })
const controlFields = { enabled: z.boolean(), visible: z.boolean().optional(), disabled: z.boolean().optional() }
const controlCapability = z.union([z.boolean(), z.object(controlFields)])
const widthCapability = z.object({ ...controlFields, min: z.number().positive().optional(), max: z.number().positive().optional() })
  .refine(value => value.min === undefined || value.max === undefined || value.min <= value.max)
const fixedCapability = z.object({ ...controlFields, allowedValues: z.array(fixed).optional() })
const capabilitySchemas = { content:controlCapability,format:controlCapability,mapping:controlCapability,template:controlCapability,filter:controlCapability,trial:controlCapability,visible:controlCapability,order:controlCapability,rename:controlCapability,align:controlCapability,sortable:controlCapability,headerStyle:controlCapability,cellStyle:controlCapability,width:z.union([z.boolean(),widthCapability]),fixed:z.union([z.boolean(),fixedCapability]) }
const optionalColumnSchemas = {
  ...ruleFieldSchemas,kind:z.enum(['data','actions']),
  type: z.enum(['text', 'number', 'currency', 'percent', 'date', 'enum', 'boolean']),
  width: z.number().positive(), minWidth: z.number().positive(), grow: z.number().nonnegative(), visible: z.boolean(), fixed,
  align: z.enum(['left', 'center', 'right']), sortable: z.boolean(), filterable: z.boolean(), emptyText: z.string(),
  headerStyle:columnTextStyleSchema,cellStyle:columnTextStyleSchema,
  numberFormat: z.object({ style: z.enum(['decimal', 'currency', 'percent']).optional(), currency: z.string().regex(/^[a-zA-Z]{3}$/).optional(), useGrouping: z.boolean().optional(), minimumFractionDigits: z.number().int().min(0).max(20).optional(), maximumFractionDigits: z.number().int().min(0).max(20).optional(), percentBase: z.enum(['ratio', 'percent']).optional(), prefix: z.string().optional(), suffix: z.string().optional() })
    .refine(value => value.minimumFractionDigits === undefined || value.maximumFractionDigits === undefined || value.minimumFractionDigits <= value.maximumFractionDigits),
  valueMap: z.array(z.object({ value: z.union([z.string(), z.number(), z.boolean(), z.null()]), label: z.string(), color: z.string().optional(), background: z.string().optional() })),
}

function issue(report: DiagnosticReporter | undefined, path: string, message: string, code: ConfigDiagnostic['code'] = 'SchemaValidationError') {
  report?.({ code, path, message })
}

function readObject(input: unknown, path: string, report?: DiagnosticReporter, code: ConfigDiagnostic['code'] = 'SchemaValidationError'): Record<string, unknown> | null {
  let value = input
  if (typeof value === 'string') {
    try { value = JSON.parse(value) }
    catch { issue(report, path, '配置 JSON 无法解析，已使用默认配置。', 'ConfigParseError'); return null }
  }
  if (!isRecord(value)) { issue(report, path, '配置必须是对象。', code); return null }
  return value
}

function parsePatches(input: unknown, path: string, report?: DiagnosticReporter, observer?: ConfigurationObserver): Record<string, UserColumnConfig> {
  const result: Record<string, UserColumnConfig> = Object.create(null)
  if (!isRecord(input)) { issue(report, path, '列配置必须是按列 ID 索引的对象。'); return result }
  for (const id of Object.keys(input)) {
    if (!id) { issue(report, path, '列 ID 不能为空。'); continue }
    const prefix = `${path}.${id}`
    const patch = parseColumnPatch(input[id], observer ? diagnostic => {
      report?.(diagnostic)
      const field = diagnostic.path.slice(prefix.length + 1)
      observer.reject(['columns', id, ...(field ? [field] : [])], diagnostic)
    } : report, prefix)
    if (Object.keys(patch).length) result[id] = patch
  }
  return result
}

function parsePageSize(value: unknown, path: string, report?: DiagnosticReporter): number | undefined {
  if (value === undefined) return undefined
  const parsed = positiveInteger.safeParse(value)
  if (parsed.success) return parsed.data
  issue(report, path, '每页条数必须是正整数。')
  return undefined
}

export function parsePreference(input: unknown, tableKey: string, report?: DiagnosticReporter, observer?: ConfigurationObserver): PreferenceV3 | null {
  if (input === null || input === undefined) return null
  const externalReport = report
  if (observer) report = diagnostic => {
    externalReport?.(diagnostic)
    if (diagnostic.path.startsWith('preference.columns.')) return
    const path = diagnostic.path.startsWith('preference.pagination.') ? ['pagination', diagnostic.path.slice('preference.pagination.'.length)]
      : diagnostic.path === 'preference.pageSize' ? ['pagination', 'pageSize']
      : diagnostic.path === 'preference.columns' ? ['columns'] : diagnostic.path.split('.')
    observer.reject(path, diagnostic)
  }
  const value = readObject(input, 'preference', report)
  if (!value) return null
  const envelope = preferenceEnvelope.safeParse({ schemaVersion: own(value, 'schemaVersion'), tableKey: own(value, 'tableKey') })
  if (!envelope.success) {
    issue(report, 'preference', '偏好版本或表格标识无效，无法迁移。', 'MigrationError')
    return null
  }
  const version = envelope.data.schemaVersion
  if ((version === 1 && own(value, 'kind') !== undefined) || (version !== 1 && own(value, 'kind') !== kind)) {
    issue(report, 'preference.kind', '此配置来源不是 BusinessTable 用户偏好。', 'MigrationError')
    return null
  }
  if (envelope.data.tableKey !== tableKey) { issue(report, 'preference.tableKey', '此偏好属于其他表格。'); return null }
  const columns = parsePatches(own(value, 'columns'), 'preference.columns', report, observer)
  let conditionalFormatting:ConditionalRule[]|undefined
  if(Object.hasOwn(value,'conditionalFormatting')){
    try{conditionalFormatting=readConditionalRules(own(value,'conditionalFormatting'))}
    catch{issue(report,'preference.conditionalFormatting','条件标记规则无效，已忽略这一项。')}
  }
  // Migrate the actual Vue v1 payload through the explicit v2 protocol, never an old quotation payload.
  let current: PreferenceV2 | PreferenceV3
  if (version === 1 || version === 2) {
    const pageSize = parsePageSize(own(value, 'pageSize'), 'preference.pageSize', report)
    current = { kind, schemaVersion: 2, tableKey, columns, ...(pageSize === undefined ? {} : { pageSize }) }
  } else {
    let pageSize: number | undefined
    const pagination = own(value, 'pagination')
    if (pagination !== undefined) {
      if (isRecord(pagination)) pageSize = parsePageSize(own(pagination, 'pageSize'), 'preference.pagination.pageSize', report)
      else issue(report, 'preference.pagination', '分页偏好必须是对象。')
    }
    current = { kind, schemaVersion: 3, tableKey, columns, ...(pageSize === undefined ? {} : { pagination: { pageSize } }) }
  }
  if(own(value,'presentation')!==undefined){
    const accepted: string[][] | undefined = observer ? [] : undefined
    const presentationObserver: ConfigurationObserver | undefined = observer ? {
      ...observer, accept: path => accepted?.push([...path]),
    } : undefined
    current.presentation=presentationDelta(resolvePresentation(own(value,'presentation'), undefined, presentationObserver))
    if (observer && accepted) for (const path of accepted) {
      let child: unknown = current.presentation
      for (const key of path.slice(1)) child = isRecord(child) ? own(child, key) : undefined
      if (child === undefined) observer.omit(path, '此值在偏好差量归一化时被省略，未覆盖当前基线。')
    }
  }
  if (current.schemaVersion === 2) return {...(current.presentation?{presentation:current.presentation}:{}),...(conditionalFormatting===undefined?{}:{conditionalFormatting}), kind, schemaVersion: 3, tableKey, columns: current.columns, ...(current.pageSize === undefined ? {} : { pagination: { pageSize: current.pageSize } }) }
  return {...current,...(conditionalFormatting===undefined?{}:{conditionalFormatting})}
}

function parseCapabilities(input: unknown, path: string, report?: DiagnosticReporter): ColumnCapabilities {
  const result: ColumnCapabilities = {}
  if (input === undefined) return result
  if (!isRecord(input)) { issue(report, path, '列能力必须是对象，已锁定该列配置。'); return result }
  for (const key of Object.keys(capabilitySchemas) as (keyof ColumnCapabilities)[]) {
    const value = own(input, key)
    if (value === undefined) continue
    const parsed = capabilitySchemas[key].safeParse(value)
    if (!parsed.success) { issue(report, `${path}.${key}`, '列能力约束无效，已关闭该能力。'); continue }
    Object.defineProperty(result, key, { value: parsed.data, enumerable: true, configurable: true, writable: true })
  }
  return result
}

function parseColumns(input: unknown, report?: DiagnosticReporter, observers?: ConfigurationObservers): ConfigurableColumn[] {
  if (!Array.isArray(input)) {
    issue(report, 'definition.columns', '表格列必须是数组。')
    observers?.declaration.reject(['columns'], {code: 'SchemaValidationError', path: 'definition.columns', message: '表格列必须是数组。'})
    return []
  }
  const ids = new Set<string>()
  const columns: { column: ConfigurableColumn; index: number; order: number }[] = []
  input.forEach((value, index) => {
    const path = `definition.columns.${index}`
    let columnId: string | undefined
    const reportColumn: DiagnosticReporter = diagnostic => {
      report?.(diagnostic)
      const tail = diagnostic.path.slice(path.length + 1).split('.').filter(Boolean)
      observers?.declaration.reject(columnId === undefined ? ['definition', 'columns', String(index), ...tail] : ['columns', columnId, ...tail], diagnostic)
    }
    if (!isRecord(value)) { issue(reportColumn, path, '列定义必须是对象。'); return }
    const core = requiredColumn.safeParse({ id: own(value, 'id'), field: own(value, 'field'), title: own(value, 'title') })
    if (!core.success) { issue(reportColumn, path, '列必须包含有效的 ID、字段名和标题。'); return }
    columnId = core.data.id
    if (ids.has(core.data.id)) { issue(reportColumn, `${path}.id`, '列 ID 重复，已保留第一次定义。'); return }
    ids.add(core.data.id)
    const access = own(value, 'access')
    if (access !== undefined && typeof access !== 'boolean') { issue(reportColumn, `${path}.access`, '列访问权限无效，已移除此列。'); return }
    if (access === false) {
      observers?.declaration.reject(['columns', core.data.id], {code: 'CapabilityViolation', path: `${path}.access`, message: '列访问权限关闭，已移除此列。'})
      return
    }
    // Keep trusted local extension functions opaque; never serialize or JSON-clone code declarations.
    const column: Record<string, unknown> = { ...value, ...core.data }
    delete column.access
    delete column.default
    if (observers) for (const [key, field] of Object.entries(core.data)) observers.declaration.accept(['columns', core.data.id, key], field)
    for (const key of Object.keys(optionalColumnSchemas) as (keyof typeof optionalColumnSchemas)[]) {
      const field = own(value, key)
      if (field === undefined) continue
      const parsed = optionalColumnSchemas[key].safeParse(field)
      if (parsed.success) {
        column[key] = parsed.data
        observers?.declaration.accept(['columns', core.data.id, key], parsed.data)
      } else {
        delete column[key]; issue(reportColumn, `${path}.${key}`, '列字段无效，已使用默认值。')
      }
    }
    column.configurable = parseCapabilities(own(value, 'configurable'), `${path}.configurable`, reportColumn)
    const defaults = own(value, 'default')
    const { order, ...fields } = defaults === undefined ? {} : parseColumnPatch(defaults, observers ? diagnostic => {
      report?.(diagnostic)
      const field = diagnostic.path.slice(`${path}.default`.length + 1)
      observers.default.reject(['columns', core.data.id, ...(field ? [field] : [])], diagnostic)
    } : report, `${path}.default`)
    if (observers) {
      observers.declaration.accept(['columns', core.data.id, 'configurable'], column.configurable)
      for (const [key, field] of Object.entries(fields)) observers.default.accept(['columns', core.data.id, key], field)
      observers.declaration.accept(['columns', core.data.id, 'order'], columns.length)
      if (order !== undefined) observers.default.accept(['columns', core.data.id, 'order'], order)
    }
    columns.push({ column: { ...column, ...fields } as unknown as ConfigurableColumn, index, order: order ?? index })
  })
  const positions = observers ? new Map(columns.map((entry, index) => [entry.column.id, index])) : undefined
  return columns.sort((a, b) => a.order - b.order || a.index - b.index).map((entry, index) => {
    if (positions && index !== positions.get(entry.column.id) && entry.order === entry.index) observers?.default.accept(['columns', entry.column.id, 'order'], index)
    observers?.default.effective(['columns', entry.column.id, 'order'], index)
    return entry.column
  })
}

function parsePagination(input: unknown, fallback: Partial<import('../types').Pagination> & { pageSize: number; pageSizeOptions: number[] }, path: string, report?: DiagnosticReporter, observer?: ConfigurationObserver) {
  const reportIssue: DiagnosticReporter = diagnostic => {
    report?.(diagnostic)
    observer?.reject(['pagination', ...diagnostic.path.slice(path.length + 1).split('.').filter(Boolean)], diagnostic)
  }
  const result = { ...fallback, pageSize: fallback.pageSize, pageSizeOptions: [...fallback.pageSizeOptions] }
  if (input === undefined) return result
  if (!isRecord(input)) { issue(reportIssue, path, '分页配置必须是对象。'); return result }
  const extras={page:positiveInteger,enabled:z.boolean(),visible:z.boolean(),hideOnSinglePage:z.boolean(),showTotal:z.boolean(),showPageSize:z.boolean(),showPageNumbers:z.boolean(),showJumper:z.boolean(),align:z.enum(['left','center','right']),variant:z.enum(['simple','full']),unpagedLimit:positiveInteger.max(10000)}
  for(const [key,schema] of Object.entries(extras)){
    const value=own(input,key)
    if(value===undefined)continue
    const parsed=schema.safeParse(value)
    if(parsed.success){Object.assign(result,{[key]:parsed.data});observer?.accept(['pagination',key],parsed.data)}
    else issue(reportIssue,`${path}.${key}`,'分页配置无效，已保留默认值。')
  }
  const options = own(input, 'pageSizeOptions')
  if (options !== undefined) {
    if (Array.isArray(options)) {
      const valid = options.flatMap((value, index) => {
        const size = parsePageSize(value, `${path}.pageSizeOptions.${index}`, reportIssue)
        return size === undefined ? [] : [size]
      })
      if (valid.length) {result.pageSizeOptions = [...new Set(valid)];observer?.accept(['pagination','pageSizeOptions'],result.pageSizeOptions)}
      else issue(reportIssue, `${path}.pageSizeOptions`, '没有合法的每页条数选项，已保留默认选项。')
    } else issue(reportIssue, `${path}.pageSizeOptions`, '每页条数选项必须是数组。')
  }
  if (!result.pageSizeOptions.includes(result.pageSize)) {
    result.pageSize = result.pageSizeOptions[0]!
    observer?.accept(['pagination','pageSize'],result.pageSize)
  }
  const size = parsePageSize(own(input, 'pageSize'), `${path}.pageSize`, reportIssue)
  if (size !== undefined) {
    if (result.pageSizeOptions.includes(size)) {result.pageSize = size;observer?.accept(['pagination','pageSize'],size)}
    else issue(reportIssue, `${path}.pageSize`, '每页条数不在允许的选项中，已保留合法值。')
  }
  return result
}

function applyObservedColumns(columns: ConfigurableColumn[], patches: unknown, report: DiagnosticReporter, observer?: ConfigurationObserver) {
  if (!observer) return applyColumnPatches(columns, patches, report)
  const ordered = new Set<string>()
  const result = applyColumnPatches(columns, patches, report, observer ? {
    accept(id, patch) {
      for (const [key, value] of Object.entries(patch)) {
        observer.accept(['columns', id, key], value)
        if (key === 'order') ordered.add(id)
      }
    },
    reject(id, diagnostic) {
      const prefix = id === undefined ? 'columns' : `columns.${id}`
      const field = diagnostic.path.slice(prefix.length + 1)
      observer.reject(['columns', ...(id === undefined ? [] : [id]), ...(field ? [field] : [])], diagnostic)
    },
  } : undefined)
  if (observer) result.forEach((column, index) => {
    if (columns[index]?.id !== column.id && !ordered.has(column.id)) observer.accept(['columns', column.id, 'order'], index)
    observer.effective(['columns', column.id, 'order'], index)
  })
  return result
}

function observeDefaults(value: unknown, path: readonly string[], observer: ConfigurationObserver) {
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) observeDefaults(child, [...path, key], observer)
  } else observer.accept(path, value)
}

export function resolveConfiguration(input: ResolveConfigurationInput, report?: DiagnosticReporter, observers?: ConfigurationObservers): ResolvedConfiguration {
  const diagnostics: ConfigDiagnostic[] = []
  const collect: DiagnosticReporter = diagnostic => { diagnostics.push(diagnostic); report?.(diagnostic) }
  const local = readObject(input.definition, 'definition', diagnostic => {
    collect(diagnostic); observers?.declaration.reject(['definition'], diagnostic)
  })
  let columns: ConfigurableColumn[] = []
  let pagination = { pageSize: 20, pageSizeOptions: [20, 50, 100] }
  let tableKey = ''
  let presentation=defaultPresentation()
  if (observers) {
    observeDefaults(presentation, ['presentation'], observers.default)
    observeDefaults(pagination, ['pagination'], observers.default)
  }
  if (local) {
    // Deliberately project the envelope. A broad parse/spread would read disabled Feature getters.
    const envelope = definitionEnvelope.safeParse({ schemaVersion: own(local, 'schemaVersion'), tableKey: own(local, 'tableKey') })
    if (envelope.success) {
      tableKey = envelope.data.tableKey
      columns = parseColumns(own(local, 'columns'), collect, observers)
      if(own(local,'presentation')!==undefined)presentation=resolvePresentation(own(local,'presentation'),presentation,observers?.declaration)
      pagination = parsePagination(own(local, 'pagination'), pagination, 'definition.pagination', collect, observers?.declaration)
    } else {
      issue(collect, 'definition', '表格定义版本或标识无效。')
      observers?.declaration.reject(['definition'], {code: 'SchemaValidationError', path: 'definition', message: '表格定义版本或标识无效。'})
    }
  }
  if (input.remoteOverride !== undefined && input.remoteOverride !== null) {
    const remote = readObject(input.remoteOverride, 'remoteOverride', diagnostic => {collect(diagnostic);observers?.remote.reject(['remoteOverride'],diagnostic)}, 'RemoteConfigError')
    if (remote) {
      const scoped: DiagnosticReporter = diagnostic => collect({ ...diagnostic, path: `remoteOverride.${diagnostic.path}` })
      columns = applyObservedColumns(columns, own(remote, 'columns'), scoped, observers?.remote)
      if(own(remote,'presentation')!==undefined)presentation=resolvePresentation(own(remote,'presentation'),presentation,observers?.remote)
      pagination = parsePagination(own(remote, 'pagination'), pagination, 'remoteOverride.pagination', collect, observers?.remote)
    }
  }
  const baseColumns = columns
  presentation={...presentation,appearance:{...presentation.appearance,pageSize:pagination.pageSize}}
  // This is a resolver-derived presentation value, whose input is the resolved pagination.
  observers?.default.derive(['presentation','appearance','pageSize'],['pagination','pageSize'],pagination.pageSize)
  const basePresentation=presentation
  const basePageSize = pagination.pageSize
  const parsedPreference = tableKey ? parsePreference(input.preference, tableKey, collect, observers?.preference) : null
  if (!tableKey && input.preference !== undefined && input.preference !== null) observers?.preference.omit(['preference'], '表格定义标识无效，未读取用户偏好。')
  let preference: PreferenceV3 | null = null
  if (parsedPreference) {
    if(parsedPreference.presentation)presentation=resolvePresentation(parsedPreference.presentation,presentation,observers?.preference)
    columns = applyObservedColumns(columns, parsedPreference.columns, diagnostic => collect({ ...diagnostic, path: `preference.${diagnostic.path}` }), observers?.preference)
    pagination = parsePagination(parsedPreference.pagination, pagination, 'preference.pagination', collect, observers?.preference)
    preference = createPreferenceDelta(tableKey, baseColumns, { schemaVersion: 1, tableKey, columns: parsedPreference.columns, pageSize: pagination.pageSize, presentation:presentationDelta(presentation,basePresentation),...(parsedPreference.conditionalFormatting===undefined?{}:{conditionalFormatting:parsedPreference.conditionalFormatting}) }, basePageSize,basePresentation)
  }
  columns = applyObservedColumns(columns, input.viewColumns, diagnostic => collect({ ...diagnostic, path: `view.${diagnostic.path}` }), observers?.view)
  return { columns, baseColumns, preference, basePageSize, presentation,basePresentation,...pagination,paginationOptions:pagination, diagnostics }
}

export function createPreferenceDelta(tableKey: string, baseColumns: ConfigurableColumn[], config: TableConfig, pageSize = 20, basePresentation:TablePresentation=defaultPresentation()): PreferenceV3 {
  const columns: Record<string, UserColumnConfig> = Object.create(null)
  const result: PreferenceV3 = { kind, schemaVersion: 3, tableKey, columns }
  const current = applyColumnPatches(baseColumns, config.columns)
  const positions = new Map(current.map((column, index) => [column.id, index]))
  baseColumns.forEach((column, index) => {
    const patch = isRecord(config.columns) ? own(config.columns, column.id) : undefined
    const guarded = patch === undefined ? {} : guardColumnPatch(column, patch, undefined, 'read')
    const delta: UserColumnConfig = {}
    const base: UserColumnConfig = { title: column.title, visible: column.visible ?? true, width: column.width, fixed: column.fixed ?? false, align: column.align ?? 'left', sortable:column.sortable??false, headerStyle:column.headerStyle??{}, cellStyle:column.cellStyle??{}, content:column.content,mapping:column.mapping,numberRule:column.numberRule,template:column.template,filter:column.filter,filterable:column.filterable,emptyText:column.emptyText,numberFormat:column.numberFormat,valueMap:column.valueMap }
    for (const key of Object.keys(guarded) as (keyof UserColumnConfig)[]) {
      if (key === 'order' || Object.is(guarded[key], base[key])) continue
      if ((key==='headerStyle'||key==='cellStyle') && Object.keys({...guarded[key],...base[key]}).every(field=>guarded[key]?.[field as keyof NonNullable<UserColumnConfig[typeof key]>]===base[key]?.[field as keyof NonNullable<UserColumnConfig[typeof key]>])) continue
      Object.defineProperty(delta, key, { value: guarded[key], enumerable: true, configurable: true, writable: true })
    }
    const order = positions.get(column.id)!
    if (isColumnCapabilityApplicable(column, 'order') && order !== index) delta.order = order
    if (Object.keys(delta).length) columns[column.id] = delta
  })
  const size = parsePageSize(config.pageSize, 'preference.pagination.pageSize')
  if (size !== undefined && size !== pageSize) result.pagination = { pageSize: size }
  if(config.presentation){const delta=presentationDelta(resolvePresentation(config.presentation,basePresentation),basePresentation);if(Object.keys(delta).length)result.presentation=delta}
  if(config.conditionalFormatting!==undefined)result.conditionalFormatting=readConditionalRules(config.conditionalFormatting)
  return result
}
