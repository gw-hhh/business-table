import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { shallowReactive } from 'vue'
import type { ColumnConfig, RowData } from '../src/types'
import GroupingFeature from '../src/features/reports/GroupingFeature.vue'
import CompareFeature from '../src/features/reports/CompareFeature.vue'
import type { ReportsContext } from '../src/features/reports/context'
import type { CompareDefinition, GroupingDefinition } from '../src/features/reports/model'
import { downloadReport } from '../src/features/reports/export'
import * as exporter from '../src/features/export/model'

vi.mock('../src/features/reports/export', async importOriginal => ({ ...await importOriginal<typeof import('../src/features/reports/export')>(), downloadReport: vi.fn().mockResolvedValue('downloaded') }))
const columns: ColumnConfig[] = [
  { id: 'code', field: 'code', title: '编号' }, { id: 'name', field: 'name', title: '项目' },
  { id: 'team', field: 'team', title: '分部', visible: false }, { id: 'cost', field: 'cost', title: '成本', type: 'number', numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
]
const rows: RowData[] = Array.from({ length: 105 }, (_, i) => ({ code: `R${String(i + 1).padStart(3, '0')}`, name: `项目${i + 1}`, team: i < 2 ? '甲' : '乙', cost: i + 0.1 }))
const wrappers: VueWrapper[] = []
const dialog = (title: string) => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${title}"]`)!
async function click(panel: Element, text: string) {
  const button = Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === text)
  expect(button, text).toBeTruthy(); button!.click(); await flushPromises()
}
async function change(panel: Element, label: string, value: string) {
  const input = panel.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!
  expect(input, label).toBeTruthy(); input.value = value
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await flushPromises()
}
function context<D>(definition: D, data: readonly RowData[] = rows): ReportsContext<D> & { disabled: boolean; rows: readonly RowData[]; definition: D; error: string; loading: boolean } {
  return shallowReactive({ definition, columns, rows: data, selectedIds: ['R003', 'R001', 'R002'], loading: false, error: '', disabled: false, rowId: (row: RowData) => String(row.code), reload: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), close: vi.fn() })
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ''; vi.clearAllMocks(); vi.restoreAllMocks() })

async function delayedExport() {
  const actual = await vi.importActual<typeof import('../src/features/reports/export')>('../src/features/reports/export')
  const generate = vi.spyOn(exporter, 'downloadExport').mockImplementation(() => {})
  let finish!: () => void, settled!: () => void
  const done = new Promise<void>(resolve => { settled = resolve })
  const ready = new Promise<void>(resolve => { finish = resolve })
  vi.mocked(downloadReport).mockImplementationOnce(async (...args) => { await ready; try { return await actual.downloadReport(...args) } finally { settled() } })
  return { generate, finish, done }
}

describe('read-only data report panels', () => {
  it('shows two configurable grouping levels, expands details and exports only leaf summaries', async () => {
    const ctx = context<GroupingDefinition>({ groupColumns: ['team', 'name'], defaultGroups: ['team'], detailColumns: [{ columnId: 'code' }, { columnId: 'cost' }], summaryColumns: [{ columnId: 'cost', label: '成本合计' }] }, rows.slice(0, 3))
    wrappers.push(mount(GroupingFeature, { props: { context: ctx }, attachTo: document.body })); await flushPromises()
    const panel = dialog('分组汇总'); expect(panel.textContent).toContain('完整查询结果 3 条'); expect(ctx.reload).toHaveBeenCalledOnce()
    expect(panel.querySelector('[aria-label="第一分组"]')?.getAttribute('disabled')).toBeNull()
    expect(panel.querySelectorAll('details')).toHaveLength(2); expect(panel.querySelector('details')?.open).toBe(false)
    await click(panel, '展开全部'); expect(Array.from(panel.querySelectorAll('details')).every(item => item.open)).toBe(true)
    await click(panel, '收起全部'); expect(Array.from(panel.querySelectorAll('details')).every(item => !item.open)).toBe(true)
    await change(panel, '第二分组', 'name'); expect(panel.querySelectorAll('details')).toHaveLength(5)
    await click(panel, '导出汇总')
    const book = vi.mocked(downloadReport).mock.calls[0]?.[0]; expect(book?.sheets[0]?.rows).toHaveLength(4)
    expect(book?.sheets[0]?.rows[1]?.[0]?.text).toBe('分部：甲 / 项目：项目1')
    expect(dialog('分组汇总')).toBe(panel)
    ctx.disabled = true; await flushPromises()
    expect(panel.querySelector<HTMLSelectElement>('[aria-label="第一分组"]')?.disabled).toBe(true)
    expect(panel.querySelector<HTMLSelectElement>('[aria-label="第二分组"]')?.disabled).toBe(true)
    await click(panel, '关闭'); expect(ctx.close).toHaveBeenCalledOnce()
  })
  it('compares initial selected records in query order, preserves hidden search picks and enforces the four record limit', async () => {
    const ctx = context<CompareDefinition>({ searchColumns: ['code', 'name'], labelColumns: ['code', 'name'], recordLabelColumn: 'code', differenceColumns: [{ columnId: 'cost', label: '成本差' }], searchPlaceholder: '搜索编号 / 项目' })
    wrappers.push(mount(CompareFeature, { props: { context: ctx }, attachTo: document.body })); await flushPromises()
    const panel = dialog('记录对比')
    expect(panel.textContent).toContain('仅列出前 100 条'); expect(panel.querySelectorAll('[data-report-pick]')).toHaveLength(100)
    expect(Array.from(panel.querySelectorAll('thead th')).map(item => item.textContent)).toEqual(['字段', 'R001（基准）', 'R002', 'R003'])
    await change(panel, '对比基准', 'R003')
    expect(Array.from(panel.querySelectorAll('thead th')).map(item => item.textContent)).toEqual(['字段', 'R003（基准）', 'R001', 'R002'])
    await change(panel, '搜索记录', 'R004')
    const pick = panel.querySelector<HTMLInputElement>('[data-report-pick="R004"]')!; pick.click(); await flushPromises()
    await change(panel, '搜索记录', 'R005')
    expect(panel.querySelector<HTMLInputElement>('[data-report-pick="R005"]')?.disabled).toBe(true)
    expect(panel.querySelectorAll('thead th')).toHaveLength(5)
    await change(panel, '搜索记录', 'R003'); panel.querySelector<HTMLInputElement>('[data-report-pick="R003"]')!.click(); await flushPromises()
    expect(panel.querySelector<HTMLSelectElement>('[aria-label="对比基准"]')?.value).toBe('R001')
    expect(ctx.selectedIds).toEqual(['R003', 'R001', 'R002'])
    await click(panel, '导出对比'); expect(downloadReport).toHaveBeenCalledOnce(); expect(dialog('记录对比')).toBe(panel)
    ctx.disabled = true; await flushPromises()
    expect(panel.querySelector<HTMLInputElement>('[aria-label="搜索记录"]')?.disabled).toBe(true)
    expect(panel.querySelector<HTMLSelectElement>('[aria-label="对比基准"]')?.disabled).toBe(true)
  })
  it('renders errors, unavailable fields and empty data explicitly without fabricated report actions', async () => {
    const ctx = context<GroupingDefinition>({ groupColumns: ['unknown'] }, [])
    wrappers.push(mount(GroupingFeature, { props: { context: ctx }, attachTo: document.body })); await flushPromises()
    const panel = dialog('分组汇总'); expect(panel.textContent).toContain('没有可用的分组字段')
    expect(Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === '导出汇总')?.disabled).toBe(true)
    ctx.error = '无法读取完整结果'; await flushPromises(); expect(panel.querySelector('[role="alert"]')?.textContent).toContain('无法读取完整结果')
    await click(panel, '重新读取'); expect(ctx.reload).toHaveBeenCalledTimes(2)
    wrappers[0]!.unmount(); wrappers.length = 0; expect(ctx.pause).toHaveBeenCalledOnce()
  })
  it('reflects dynamic field revocation without displaying stale comparison values', async () => {
    const ctx = context<CompareDefinition>({ searchColumns: ['code'], labelColumns: ['code'], recordLabelColumn: 'code' }, rows.slice(0, 3))
    wrappers.push(mount(CompareFeature, { props: { context: ctx }, attachTo: document.body })); await flushPromises()
    expect(dialog('记录对比').querySelector('table')).toBeTruthy()
    ctx.definition = { labelColumns: ['missing'], recordLabelColumn: 'missing' }; await flushPromises()
    expect(dialog('记录对比').textContent).toContain('没有可用的对比字段')
    expect(dialog('记录对比').querySelector('table')).toBeNull()
  })
  it('keeps the panel open and reports a download failure', async () => {
    vi.mocked(downloadReport).mockRejectedValueOnce(new Error('导出失败，请重试'))
    const ctx = context<CompareDefinition>({ recordLabelColumn: 'code' }, rows.slice(0, 3))
    wrappers.push(mount(CompareFeature, { props: { context: ctx }, attachTo: document.body })); await flushPromises()
    await click(dialog('记录对比'), '导出对比')
    expect(dialog('记录对比').querySelector('[role="alert"]')?.textContent).toContain('导出失败，请重试')
    expect(ctx.close).not.toHaveBeenCalled()
  })
  it.each(['第一分组', '第二分组'])('cancels the pending group export after changing %s and allows a fresh export', async label => {
    const ctx = context<GroupingDefinition>({ groupColumns: ['team', 'name'], defaultGroups: ['team'], summaryColumns: [{ columnId: 'cost' }] }, rows.slice(0, 3))
    wrappers.push(mount(GroupingFeature, { props: { context: ctx }, attachTo: document.body })); await flushPromises()
    const pending = await delayedExport(), panel = dialog('分组汇总')
    await click(panel, '导出汇总'); await change(panel, label, 'name')
    pending.finish(); await pending.done; await flushPromises()
    expect(pending.generate).not.toHaveBeenCalled()
    expect(panel.querySelector('[role="status"]')?.textContent).toContain('导出已取消')
    expect(Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === '导出汇总')?.disabled).toBe(false)
    await click(panel, '导出汇总'); expect(panel.querySelector('[role="status"]')).toBeNull()
  })
  it.each(['chosen', 'baseline', 'differences'])('cancels the pending comparison export after changing %s', async option => {
    const ctx = context<CompareDefinition>({ recordLabelColumn: 'code' }, rows.slice(0, 4))
    wrappers.push(mount(CompareFeature, { props: { context: ctx }, attachTo: document.body })); await flushPromises()
    const pending = await delayedExport(), panel = dialog('记录对比')
    await click(panel, '导出对比')
    if (option === 'baseline') await change(panel, '对比基准', 'R003')
    else { panel.querySelector<HTMLInputElement>(option === 'chosen' ? '[data-report-pick="R004"]' : '[aria-label="只看不同项"]')!.click(); await flushPromises() }
    pending.finish(); await pending.done; await flushPromises()
    expect(pending.generate).not.toHaveBeenCalled()
    expect(panel.querySelector('[role="status"]')?.textContent).toContain('导出已取消')
    expect(ctx.close).not.toHaveBeenCalled()
  })
  it('exports the current comparison when only candidate search changes while the writer loads', async () => {
    const ctx = context<CompareDefinition>({ recordLabelColumn: 'code', searchColumns: ['code'] }, rows.slice(0, 4))
    wrappers.push(mount(CompareFeature, { props: { context: ctx }, attachTo: document.body })); await flushPromises()
    const pending = await delayedExport(), panel = dialog('记录对比')
    await click(panel, '导出对比'); await change(panel, '搜索记录', 'R004')
    pending.finish(); await pending.done; await flushPromises()
    expect(pending.generate).toHaveBeenCalledOnce()
    expect(panel.querySelector('[role="status"]')).toBeNull()
  })
  it('does not revive a cancelled export when the baseline changes back before the writer loads', async () => {
    const ctx = context<CompareDefinition>({ recordLabelColumn: 'code' }, rows.slice(0, 3))
    wrappers.push(mount(CompareFeature, { props: { context: ctx }, attachTo: document.body })); await flushPromises()
    const pending = await delayedExport(), panel = dialog('记录对比')
    await click(panel, '导出对比'); await change(panel, '对比基准', 'R003'); await change(panel, '对比基准', 'R001')
    pending.finish(); await pending.done; await flushPromises()
    expect(pending.generate).not.toHaveBeenCalled()
    expect(panel.querySelector('[role="status"]')?.textContent).toContain('导出已取消')
  })
})
