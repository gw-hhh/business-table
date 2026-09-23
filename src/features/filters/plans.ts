import { readonly, shallowRef } from 'vue'
import { cloneData } from '../../runtime/value'
import { withDeadline } from '../../runtime/deadline'
import { readFilterState, type FilterState } from '../../runtime/filter-state'

export interface FilterPlan extends FilterState { id: string; name: string }
export interface FilterPlansEnvelope { kind: 'business-table-filter-plans'; version: 1; tableKey: string; plans: FilterPlan[] }
export interface FilterPlanPersistence {
  load(tableKey: string, options?: { signal?: AbortSignal }): Promise<unknown>
  save(tableKey: string, value: FilterPlansEnvelope): Promise<void>
}
export function createLocalFilterPlanPersistence(storage?: Pick<Storage, 'getItem' | 'setItem'>): FilterPlanPersistence {
  const key = (tableKey: string) => `business-table:${encodeURIComponent(tableKey)}:filter-plans:v1`
  return {
    async load(tableKey) { const saved = (storage ?? localStorage).getItem(key(tableKey)); return saved ? JSON.parse(saved) as unknown : null },
    async save(tableKey, value) { (storage ?? localStorage).setItem(key(tableKey), JSON.stringify(value)) },
  }
}
export function readFilterPlans(input: unknown, tableKey: string): FilterPlan[] {
  if (input === null || input === undefined) return []
  const value = typeof input === 'string' ? JSON.parse(input) as unknown : input
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('筛选方案配置无效。')
  const envelope = value as Partial<FilterPlansEnvelope>
  if (envelope.kind !== 'business-table-filter-plans' || envelope.version !== 1 || envelope.tableKey !== tableKey) throw new Error('筛选方案不属于当前表格。')
  if (!Array.isArray(envelope.plans) || envelope.plans.length > 50) throw new Error('筛选方案数量无效。')
  const ids = new Set<string>(), names = new Set<string>()
  return envelope.plans.map(plan => {
    if (!plan || typeof plan.id !== 'string' || !plan.id || plan.id.length > 160 || ids.has(plan.id)
      || typeof plan.name !== 'string' || !plan.name.trim() || plan.name.length > 40 || names.has(plan.name.trim())) throw new Error('筛选方案名称或标识重复。')
    ids.add(plan.id); names.add(plan.name.trim())
    return { id: plan.id, name: plan.name.trim(), ...readFilterState(plan) }
  })
}
/** Created on feature activation; mutations publish only after the adapter confirms durability. */
export function createFilterPlans(tableKey: string, persistence: FilterPlanPersistence) {
  const plans = shallowRef<FilterPlan[]>([]), loading = shallowRef(false), ready = shallowRef(false)
  let queue: Promise<void> = Promise.resolve(), pendingLoad: Promise<void> | undefined, epoch = 0, disposed = false, controller: AbortController | undefined
  function transaction(update: (current: FilterPlan[]) => FilterPlan[]) {
    const task = queue.catch(() => {}).then(async () => {
      if (disposed) throw new Error('筛选设置已关闭。')
      if (!ready.value || pendingLoad) await (pendingLoad ?? load())
      if (disposed) throw new Error('筛选设置已关闭。')
      if (!ready.value) throw new Error('请先重新读取筛选方案。')
      ++epoch; controller?.abort(); loading.value = false
      const next = update(cloneData(plans.value))
      await persistence.save(tableKey, { kind: 'business-table-filter-plans', version: 1, tableKey, plans: cloneData(next) })
      if (!disposed) { ++epoch; controller?.abort(); loading.value = false; plans.value = next; ready.value = true }
    })
    queue = task; return task
  }
  function validName(name: string, current: FilterPlan[], id?: string) {
    const label = name.trim()
    if (!label || label.length > 40) throw new Error('请填写 1–40 字的方案名称。')
    if (current.some(plan => plan.id !== id && plan.name === label)) throw new Error('已有同名筛选方案。')
    return label
  }
  function load(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (pendingLoad) return pendingLoad
    const request = ++epoch; controller?.abort(); controller = new AbortController()
    loading.value = true; ready.value = false
    const pending = withDeadline(signal => persistence.load(tableKey, { signal }), 10000, controller.signal, '筛选方案读取超时，请重试。').then(result => {
      if (!disposed && request === epoch) { plans.value = readFilterPlans(result, tableKey); ready.value = true }
    }).catch(cause => { if (!disposed && request === epoch) throw cause }).finally(() => {
      if (pendingLoad === pending) pendingLoad = undefined
      if (!disposed && request === epoch) loading.value = false
    })
    pendingLoad = pending; return pending
  }
  return {
    plans: readonly(plans), loading: readonly(loading), ready: readonly(ready), load,
    async save(name: string, state: FilterState, existingId?: string) {
      const snapshot = readFilterState(state), id = existingId ?? crypto.randomUUID()
      await transaction(current => {
        if (existingId && !current.some(plan => plan.id === existingId)) throw new Error('筛选方案已删除。')
        if (!existingId && current.length >= 50) throw new Error('最多保存 50 个筛选方案。')
        const plan = { id, name: validName(name, current, existingId), ...snapshot }
        return existingId ? current.map(item => item.id === id ? plan : item) : [...current, plan]
      })
      return id
    },
    async rename(id: string, name: string) {
      await transaction(current => {
        if (!current.some(plan => plan.id === id)) throw new Error('筛选方案已删除。')
        const label = validName(name, current, id)
        return current.map(plan => plan.id === id ? { ...plan, name: label } : plan)
      })
    },
    async remove(id: string) { await transaction(current => current.filter(plan => plan.id !== id)) },
    dispose() { disposed = true; ++epoch; controller?.abort(); loading.value = false; ready.value = false },
  }
}
