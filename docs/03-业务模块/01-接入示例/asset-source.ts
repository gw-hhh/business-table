import type { DataSource, FilterOption, Query, QueryResult } from '@company/business-table'
import type { Asset } from './assets'

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function isAsset(value: unknown): value is Asset {
  return object(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && typeof value.status === 'number' && Number.isFinite(value.status)
    && typeof value.amount === 'number' && Number.isFinite(value.amount)
}
function readRows(value: unknown): Asset[] {
  if (!Array.isArray(value) || !value.every(isAsset)) throw new Error('物料数据格式无效')
  return value
}
function readResult(value: unknown): QueryResult<Asset> {
  if (!object(value) || typeof value.total !== 'number' || !Number.isSafeInteger(value.total) || value.total < 0) {
    throw new Error('分页结果格式无效')
  }
  return { rows: readRows(value.rows), total: value.total }
}
function readOptions(value: unknown): FilterOption[] {
  if (!Array.isArray(value)) throw new Error('候选项格式无效')
  return value.map((item: unknown) => {
    if (!object(item) || typeof item.label !== 'string'
      || !(item.value === null || typeof item.value === 'string' || typeof item.value === 'boolean'
        || typeof item.value === 'number' && Number.isFinite(item.value))) throw new Error('候选项格式无效')
    if (item.count !== undefined && (typeof item.count !== 'number' || !Number.isSafeInteger(item.count) || item.count < 0)) {
      throw new Error('候选项计数无效')
    }
    return { value: item.value, label: item.label, ...(typeof item.count === 'number' ? { count: item.count } : {}) }
  })
}
function queryBody(query: Query) {
  // AbortSignal 是请求控制对象，不序列化进 JSON。
  const { signal: _signal, ...body } = query
  return body
}

/** 示例协议，需接入方实现对应后台；本仓库不提供这些 HTTP 路由。 */
export function createAssetSource(baseUrl = '/api/assets', fetcher: typeof fetch = fetch): DataSource<Asset> {
  const base = baseUrl.replace(/\/$/, '')
  async function post(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const response = await fetcher(`${base}/${path}`, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`物料接口失败 HTTP ${response.status}`)
    return response.json()
  }
  return {
    async query(query) { return readResult(await post('query', queryBody(query), query.signal)) },
    async readAll(query, { limit, signal }) {
      const result = readRows(await post('read-all', { query: queryBody(query), limit }, signal))
      if (result.length > limit) throw new Error(`结果超过 ${limit} 条，请缩小查询范围`)
      return result
    },
    async options(column, query, { search, signal, values }) {
      return readOptions(await post('options', {
        columnId: column.id, field: column.field, query: queryBody(query), search, values,
      }, signal))
    },
  }
}
