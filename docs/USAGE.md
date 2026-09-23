# 使用说明

简单页面传 `data`；服务端分页传 `dataSource.query(query)`。列使用稳定 `id` 保存配置。支持列显隐、列宽、左右冻结、排序、数字/货币/百分比、值映射、视图和行操作。`Persistence` 可接 LocalStorage 或后端数据库 API。Windows 运行 `verify-release.cmd`，CI 在 development/main push 与 PR 时执行相同 release gate。

## Provider 查询

组件每次发起查询都会取消上一次的 `query.signal`。适配器应把它传给请求客户端，例如 `fetch(url, { signal: query.signal })`。即使适配器暂时不支持取消，组件也只接受最新请求的结果、错误和 loading 状态；卸载、替换 Provider 或切回本地 data 后，旧结果不会写回。

`queryChange` 事件和 Provider 各自收到独立的查询快照，筛选值使用可结构化克隆的数据（例如字符串、数字、日期、数组和普通对象）。两者修改参数不会改变组件内部查询或输入 View。当前请求失败时保留上一次显示的数据，并提供错误提示；点击刷新可重试。

## 分页与加载

搜索、排序、切换 View 和修改每页条数都会回到第 1 页，每次操作只发起一次查询。本地数据减少时页码收敛到最后有效页，空数据使用第 1 / 1 页。远程返回的 total 如果使当前页越界，组件会自动补查最后有效页。

组件内置加载提示与 `aria-busy`，不要求宿主额外注册 VXE Loading 组件。表格使用内容自然高度；如需固定高度或虚拟滚动，应另外设计明确的高度配置，不能在无固定高度的自适应父容器中使用 VXE `height="auto"`。

宿主重新渲染时，即使重新创建 pagination 对象或 pageSizeOptions 数组，只要分页默认值和可选项内容相同，组件会保留当前分页与已应用设置。实际改变默认每页条数或允许范围时，才按新配置重新校验。

## 设置与工具

先开启 `features.columnSettings`，再声明需要的设置：直接 `BusinessTable` 使用 `settingsDefinition`，`ConfiguredBusinessTable` 使用 `definition.settings`。设置页由 pages 声明，列模块由 columnSections 声明，具体可配置字段由 column.configurable 声明；列设置取三层交集。

未配置、false、enabled:false 或 visible:false 都隐藏。true 表示显示并允许修改；`{enabled: true, disabled: true}` 表示显示只读。远端只能继续收窄。只读会拦截界面和设置命令的写入，但保留已有合法偏好与 View 值；应用设置不会自动保存命名 View。完整示例见 [配置入口](CONFIGURATION.md)。

工具设置和真实按钮必须共用 `tools` 声明及 `presentation.toolbar` 布局。工具需有稳定 ID 和真实 handler；没有工具的区域不显示。报价 Demo 使用共享 ToolStrip，默认显式开放全部已实现设置；在工具栏页调整名称、顺序、位置和形式后，点击应用即可查看实际按钮变化。配置示例 `/?example=config&mode=readonly` 展示只读，`/?example=config&mode=unconfigured` 展示未配置时隐藏。

列内“试算”用于给出一个临时原值，核对显示文本、导出值与 Excel 格式，不修改业务数据。BT-08 的计算字段和公式引擎仍未实施。

## 列筛选、组合筛选与方案

筛选为显式开启的组件能力，不在默认基础表格里初始化编辑器：

```vue
<BusinessTable
  table-key="tenant-user.assets"
  :columns="columns"
  :data="rows"
  :features="{ filters: true }"
/>
```

列的 `type` 决定默认编辑器；`filterable: false` 禁用该列筛选。`column.filter` 可声明 `type`（text/number/date/single/multi/boolean）、`source`（data/mapping/manual/remote）、`operators`、`search`、`counts`、`options`。稳定 `column.id` 用于能力白名单，条件中的 `field` 对应数据字段。关闭的 Feature 不读取详情、不创建编辑器状态、不加载筛选 UI。

默认 UI 包含表头列筛选、组合筛选、独立条件标签和方案管理。也支持 `filters: { enabled: true, mode: 'custom' }` 配合 `filters` slot，或者 `mode: 'headless'` 后通过 `activateFeature('filters')` 取得 `FiltersContext`。`openFilters(columnId?)` 打开列或组合编辑器；`setFilterState({ columnFilters, filterGroup })` 作为受校验的 Runtime 命令，不需要在业务页面另存一份正式筛选状态。

基础查询、列条件与组合条件互相独立，最终同时生效。`Query.filters` 包含手动基础条件和 Search Feature 投影出的条件；`Query.columnFilters` 单独保存列筛选条件，Provider 需要将两者各执行一次。`Query.filterGroup` 是递归 `{ logic: 'and' | 'or', rules: (FilterConfig | FilterGroup)[] }`，服务端需按组逻辑处理，并对字段、操作符和访问权限再次验证。金额/百分比条件中的 value 已转换为原值，不要根据显示格式重复换算。

候选项优先使用 `DataSource.options(column, query, { search, signal })`；手工/映射源直接按配置取值。数据源没有 `options` 时，data 源使用 `readAll(query, { limit, signal })` 读取完整数据（上限 10000），不会用当前页替代全集。`options` 返回 `{ value: string | number | boolean | null, label: string, count?: number }[]`，原值类型必须保留。

有 tableKey 时默认按表格隔离保存在 LocalStorage；需要账号隔离时使用包含租户与用户范围的 tableKey，或传入业务适配器。`filter-plan-persistence` 同时支持 BusinessTable 与 ConfiguredBusinessTable，传 `null` 隐藏方案管理，只保留筛选：

```ts
import type { FilterPlanPersistence, FilterPlansEnvelope } from '@company/business-table'

const filterPlanPersistence: FilterPlanPersistence = {
  async load(tableKey, options) {
    const response = await fetch(`/api/table/filter-plans?key=${encodeURIComponent(tableKey)}`, {
      signal: options?.signal,
    })
    if (!response.ok) throw new Error('筛选方案读取失败，请重试。')
    return await response.json() as FilterPlansEnvelope | null
  },
  async save(tableKey, value) {
    const response = await fetch(`/api/table/filter-plans?key=${encodeURIComponent(tableKey)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    })
    if (!response.ok) throw new Error('筛选方案保存失败，请重试。')
  },
}
```

适配器存储完整 `FilterPlansEnvelope`；读取返回 null 表示暂无方案。读取失败不会被当作空数据覆盖保存；保存失败不会关闭编辑窗口。后端还需处理账号鉴权以及多客户端版本冲突，不能把前端写队列作为跨客户端互斥。

本次验证范围及未完成的完整迁移项见 [FILTER-MIGRATION-ACCEPTANCE.md](FILTER-MIGRATION-ACCEPTANCE.md)。
