import {resolvePresentation,presentationDelta,defaultPresentation,type TablePresentation} from '../features/presentation/model'
import { z } from 'zod'
import {ruleFieldSchemas} from '../features/columns/schema'
import type { TableConfig } from '../types'
import type { UserColumnConfig } from '../types'
import type { ConfigDiagnostic, DiagnosticReporter } from './diagnostics'
import type { ColumnCapabilities, ConfigurableColumn, PreferenceV2, PreferenceV3, ResolveConfigurationInput, ResolvedConfiguration } from './types'
import { applyColumnPatches, columnTextStyleSchema, guardColumnPatch, isColumnCapabilityApplicable, isRecord, own, parseColumnPatch } from './columns'

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
  width: z.number().positive(), minWidth: z.number().positive(), visible: z.boolean(), fixed,
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

function parsePatches(input: unknown, path: string, report?: DiagnosticReporter): Record<string, UserColumnConfig> {
  const result: Record<string, UserColumnConfig> = Object.create(null)
  if (!isRecord(input)) { issue(report, path, '列配置必须是按列 ID 索引的对象。'); return result }
  for (const id of Object.keys(input)) {
    if (!id) { issue(report, path, '列 ID 不能为空。'); continue }
    const patch = parseColumnPatch(input[id], report, `${path}.${id}`)
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

export function parsePreference(input: unknown, tableKey: string, report?: DiagnosticReporter): PreferenceV3 | null {
  if (input === null || input === undefined) return null
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
  const columns = parsePatches(own(value, 'columns'), 'preference.columns', report)
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
  if(own(value,'presentation')!==undefined)current.presentation=presentationDelta(resolvePresentation(own(value,'presentation')))
  if (current.schemaVersion === 2) return {...(current.presentation?{presentation:current.presentation}:{}), kind, schemaVersion: 3, tableKey, columns: current.columns, ...(current.pageSize === undefined ? {} : { pagination: { pageSize: current.pageSize } }) }
  return current
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

function parseColumns(input: unknown, report?: DiagnosticReporter): ConfigurableColumn[] {
  if (!Array.isArray(input)) { issue(report, 'definition.columns', '表格列必须是数组。'); return [] }
  const ids = new Set<string>()
  const columns: { column: ConfigurableColumn; index: number; order: number }[] = []
  input.forEach((value, index) => {
    const path = `definition.columns.${index}`
    if (!isRecord(value)) { issue(report, path, '列定义必须是对象。'); return }
    const core = requiredColumn.safeParse({ id: own(value, 'id'), field: own(value, 'field'), title: own(value, 'title') })
    if (!core.success) { issue(report, path, '列必须包含有效的 ID、字段名和标题。'); return }
    if (ids.has(core.data.id)) { issue(report, `${path}.id`, '列 ID 重复，已保留第一次定义。'); return }
    ids.add(core.data.id)
    const access = own(value, 'access')
    if (access !== undefined && typeof access !== 'boolean') { issue(report, `${path}.access`, '列访问权限无效，已移除此列。'); return }
    if (access === false) return
    // Keep trusted local extension functions opaque; never serialize or JSON-clone code declarations.
    const column: Record<string, unknown> = { ...value, ...core.data }
    delete column.access
    delete column.default
    for (const key of Object.keys(optionalColumnSchemas) as (keyof typeof optionalColumnSchemas)[]) {
      const field = own(value, key)
      if (field === undefined) continue
      const parsed = optionalColumnSchemas[key].safeParse(field)
      if (parsed.success) column[key] = parsed.data
      else { delete column[key]; issue(report, `${path}.${key}`, '列字段无效，已使用默认值。') }
    }
    column.configurable = parseCapabilities(own(value, 'configurable'), `${path}.configurable`, report)
    const defaults = own(value, 'default')
    const { order, ...fields } = defaults === undefined ? {} : parseColumnPatch(defaults, report, `${path}.default`)
    columns.push({ column: { ...column, ...fields } as unknown as ConfigurableColumn, index, order: order ?? index })
  })
  return columns.sort((a, b) => a.order - b.order || a.index - b.index).map(entry => entry.column)
}

function parsePagination(input: unknown, fallback: { pageSize: number; pageSizeOptions: number[] }, path: string, report?: DiagnosticReporter) {
  const result = { pageSize: fallback.pageSize, pageSizeOptions: [...fallback.pageSizeOptions] }
  if (input === undefined) return result
  if (!isRecord(input)) { issue(report, path, '分页配置必须是对象。'); return result }
  const options = own(input, 'pageSizeOptions')
  if (options !== undefined) {
    if (Array.isArray(options)) {
      const valid = options.flatMap((value, index) => {
        const size = parsePageSize(value, `${path}.pageSizeOptions.${index}`, report)
        return size === undefined ? [] : [size]
      })
      if (valid.length) result.pageSizeOptions = [...new Set(valid)]
      else issue(report, `${path}.pageSizeOptions`, '没有合法的每页条数选项，已保留默认选项。')
    } else issue(report, `${path}.pageSizeOptions`, '每页条数选项必须是数组。')
  }
  if (!result.pageSizeOptions.includes(result.pageSize)) result.pageSize = result.pageSizeOptions[0]!
  const size = parsePageSize(own(input, 'pageSize'), `${path}.pageSize`, report)
  if (size !== undefined) {
    if (result.pageSizeOptions.includes(size)) result.pageSize = size
    else issue(report, `${path}.pageSize`, '每页条数不在允许的选项中，已保留合法值。')
  }
  return result
}

export function resolveConfiguration(input: ResolveConfigurationInput, report?: DiagnosticReporter): ResolvedConfiguration {
  const diagnostics: ConfigDiagnostic[] = []
  const collect: DiagnosticReporter = diagnostic => { diagnostics.push(diagnostic); report?.(diagnostic) }
  const local = readObject(input.definition, 'definition', collect)
  let columns: ConfigurableColumn[] = []
  let pagination = { pageSize: 20, pageSizeOptions: [20, 50, 100] }
  let tableKey = ''
  let presentation=defaultPresentation()
  if (local) {
    // Deliberately project the envelope. A broad parse/spread would read disabled Feature getters.
    const envelope = definitionEnvelope.safeParse({ schemaVersion: own(local, 'schemaVersion'), tableKey: own(local, 'tableKey') })
    if (envelope.success) {
      tableKey = envelope.data.tableKey
      columns = parseColumns(own(local, 'columns'), collect)
      if(own(local,'presentation')!==undefined)presentation=resolvePresentation(own(local,'presentation'),presentation)
      pagination = parsePagination(own(local, 'pagination'), pagination, 'definition.pagination', collect)
    } else issue(collect, 'definition', '表格定义版本或标识无效。')
  }
  if (input.remoteOverride !== undefined && input.remoteOverride !== null) {
    const remote = readObject(input.remoteOverride, 'remoteOverride', collect, 'RemoteConfigError')
    if (remote) {
      const scoped: DiagnosticReporter = diagnostic => collect({ ...diagnostic, path: `remoteOverride.${diagnostic.path}` })
      columns = applyColumnPatches(columns, own(remote, 'columns'), scoped)
      if(own(remote,'presentation')!==undefined)presentation=resolvePresentation(own(remote,'presentation'),presentation)
      pagination = parsePagination(own(remote, 'pagination'), pagination, 'remoteOverride.pagination', collect)
    }
  }
  const baseColumns = columns
  presentation={...presentation,appearance:{...presentation.appearance,pageSize:pagination.pageSize}}
  const basePresentation=presentation
  const basePageSize = pagination.pageSize
  const parsedPreference = tableKey ? parsePreference(input.preference, tableKey, collect) : null
  let preference: PreferenceV3 | null = null
  if (parsedPreference) {
    if(parsedPreference.presentation)presentation=resolvePresentation(parsedPreference.presentation,presentation)
    columns = applyColumnPatches(columns, parsedPreference.columns, diagnostic => collect({ ...diagnostic, path: `preference.${diagnostic.path}` }))
    pagination = parsePagination(parsedPreference.pagination, pagination, 'preference.pagination', collect)
    preference = createPreferenceDelta(tableKey, baseColumns, { schemaVersion: 1, tableKey, columns: parsedPreference.columns, pageSize: pagination.pageSize, presentation:presentationDelta(presentation,basePresentation) }, basePageSize,basePresentation)
  }
  columns = applyColumnPatches(columns, input.viewColumns, diagnostic => collect({ ...diagnostic, path: `view.${diagnostic.path}` }))
  return { columns, baseColumns, preference, basePageSize, presentation,basePresentation,...pagination, diagnostics }
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
  return result
}
