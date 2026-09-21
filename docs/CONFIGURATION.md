# 配置入口与功能开关

当前提供配置解析、能力约束、运行时注册表，以及快捷列面板和设置抽屉的草稿、应用、取消闭环。报价页面作为宿主 Demo 展示通用布局插槽。完整 Search/View/Data Headless Runtime、高级筛选、映射、模板等仍按迁移矩阵继续。

## 最简入口与旧 API

```vue
<BusinessTable :columns="columns" :data="rows" />
```

默认只初始化 Core 查询、列、分页、加载、空状态和错误状态。rowKey 默认 id；tableKey 在无持久化时可省略，接入持久化必须提供稳定的非空标识。

原1.0的 title/views/actions 显式 props 仍作为对应功能的代码声明。Search、Toolbar、ColumnSettings 需要显式 features 开关。原 Demo 和查询测试已调整声明，原能力保留。这是最简入口默认行为的兼容变化，已有调用方升级时应按 README 补充开关。

## Definition 与 Preference

```ts
import {type TableDefinition} from '@company/business-table'

const definition: TableDefinition = {
  schemaVersion: 3,
  tableKey: 'asset.list',
  columns: [
    {
      id: 'id', field: 'id', title: '编号', width: 180, fixed: 'left',
      configurable: {width: {enabled: true, min: 120, max: 260}},
    },
    {
      id: 'name', field: 'name', title: '名称',
      configurable: {visible: true, rename: true, order: true, width: true, fixed: true, align: true},
    },
  ],
  features: {search: true, toolbar: true, columnSettings: true},
}
```

```vue
<ConfiguredBusinessTable
  :definition="definition" :data-source="dataSource"
  :remote-override="remoteOverride" :preference="preference"
  @preference-change="savePreference"
  @diagnostic="recordDiagnostic"
/>
```

配置顺序为 Local Definition → Remote Override → Preference → View。宿主后台负责角色/项目/用户优先级，不在组件中复制后端权限决策。所有覆盖都经过同一个列 Guard。

- access=false 的列不进入最终列集合。
- default 设置代码默认值；未开放的 configurable 能力默认锁定。旧平面 ColumnConfig 无 configurable 时仍保留原先可编辑行为。
- visible/order/rename/align/sortable/headerStyle/cellStyle 是布尔能力；width 支持 enabled/min/max；fixed 支持 enabled/allowedValues。
- 宽度默认可调范围80–500，并遵守 minWidth。越界字段忽略并诊断，不丢弃同一个 patch 的合法字段。
- 锁定顺序的列保持所在位置，其他列排序不会挤走它。
- 表格显示、个人偏好和 View 不修改输入 Definition，也不持久化 VXE 私有对象。

远端列配置使用按稳定列 ID 索引的差量：

```json
{"columns":{"name":{"width":240}},"features":{"columnSettings":{"enabled":false}}}
```

Preference v3 示例：

```json
{"kind":"business-table-preference","schemaVersion":3,"tableKey":"asset.list","columns":{"name":{"width":240}}}
```

只输出相对 Local + Remote 基线有变化且能力允许的字段。分页变化位于 pagination.pageSize。未知列、错误字段、非法分页单独回退，保留其余合法字段。

迁移支持当前 Vue schema1 TableConfig → 自有 kind 的 schema2 中间协议（columns/pageSize）→ schema3（columns/pagination）。旧报价项目同名 schema2/3 不属于该协议，必须先由独立适配器转换，不能仅改版本号。

原 Persistence 继续收发 schema1。ConfiguredBusinessTable 通过 preferenceChange 发出 schema3，宿主负责新偏好存储与版本冲突处理。本批不包含远端409冲突工作流。存储读取或保存异常会发诊断，Core 数据仍可用。

## Gate 与加载

```ts
features: {
  columnSettings: {enabled: true, mode: 'custom', loadStrategy: 'on-interaction'},
  search: false,
}
```

最终 enabled = 代码启用且远端未明确关闭。远端缺失或没有 enabled 沿用代码；远端不能强行开启未声明的能力，也不能改变代码的 mode/loadStrategy。OFF 不读取 details、不创建该功能模块、不渲染功能界面。

加载策略为 eager / after-definition / on-visible / on-interaction。列设置默认 on-interaction；View 默认 after-definition；其余本批模块默认 eager。第一次激活才读取 details、创建上下文和加载默认 UI，后续复用。加载失败提供重试，关闭或卸载会丢弃迟到结果。

ESM 库与浏览器 Demo 拆分 UI 模块，未触发列设置时不请求其模块。UMD 保留旧单文件分发方式，不能提供独立网络分块；需要网络按需加载的宿主应使用 ESM 入口。XLSX/RichText/Compare 本批尚未实现，也未引入基础包。

## 自定义与 Headless 列设置

```vue
<ConfiguredBusinessTable ref="table" :definition="definition" :data="rows">
  <template #column-settings="{context}">
    <button @click="context.patch('id',{width:240})">调整编号列宽</button>
    <button @click="context.close()">关闭</button>
  </template>
</ConfiguredBusinessTable>
```

mode=custom 使用宿主 Slot，仍经过相同能力 Guard。mode=headless 无默认入口或面板，宿主可调用 await table.activateFeature('columnSettings') 获取上下文；getFeatureContext 读取已加载上下文。原有 columns、patch(id, delta)、close 保持兼容；新增 baseColumns、apply(patches)、sorts/setSorts、previewRows/previewCell 和 openMode。columns 是当前视图覆盖后的结果，apply 对所有列逐项 Guard 后一次保存。它是列设置上下文，不代表所有高级能力的完整 Headless API。

默认 UI 中，“列设置”打开快捷面板，“表格设置”打开完整抽屉。显隐、顺序、左右冻结、名称、宽度和文字样式先写草稿；确认/应用后才更新正式表。快捷面板的“更多设置”沿用同一草稿，取消丢弃，抽屉关闭且有未应用修改时提示放弃或继续。排序规则也先在预览中生效；应用后进入现有 Query.sorts，不另造持久化排序协议。

列的 headerStyle/cellStyle 使用 ColumnTextStyle：字体只接受 inherit/sans-serif/serif/monospace，字号 10–32，字重 normal/500/600/bold，颜色为六位十六进制，对齐 left/center/right。配置解析和写入都校验，不接受任意 CSS 字符串。对应 configurable 能力未开放时，UI 可见且禁用，写入仍受 Guard 约束。

修改当前视图覆盖的字段时，仅解除该字段的临时视图覆盖，使手动修改即时生效；不改宿主传入的 View 对象，不自动保存该视图，其余视图覆盖仍保留。保存视图由宿主明确执行。

## 页面布局、查询与预览

BusinessTable 的 selection、fill 和 density 均为可选项。selection 使用稳定 rowKey 保存选中记录并发出 selectionChange；翻页保留、改变查询或视图清空。fill 使表体占满有确定高度的宿主容器；density 支持 compact/default/comfortable。最简入口默认不创建选择栏或报价页面。

宿主可使用 before、toolbar-start、toolbar-end、toolbar-after、after-toolbar、cell、summary 插槽；toolbar-after 位于内置设置入口之后。toolbar-start/summary 提供总数和当前行，summary 另提供页码和每页条数；cell 提供 row/column/value/text。查询字段、状态标签、合计、业务表单均由宿主实现。

BusinessTable 的组件引用新增 setQuery({keyword,filters,sorts,viewId})、applyView(view?, keyword?)、getState()、getSelectedRows()、clearSelection()、openColumnSettings('quick'|'drawer')。setQuery/applyView 返回本次加载 Promise，复用原有取消及乱序保护；getState 包含最终列（含隐藏列），便于宿主保存完整视图。配置入口 ConfiguredBusinessTable 原有公开方法不因此自动扩展。

previewCell(value,row,column) 是宿主显式提供的纯展示函数。预览复用相同格式化和列样式，表格内容 inert，不绑定业务处理函数。自定义 renderer 必须自行保持正文样式继承，且不得在渲染时执行业务操作；不能把有副作用的正式操作处理函数传入预览。

## Registry 与动作

```ts
const registry = createRegistry<Asset>()
registry.register('rowAction', 'edit', {
  id: 'edit', label: '修改',
  disabled: row => row.locked,
  handler: row => openEditor(row),
})
// 对应 Definition:
features: {rowActions: {enabled: true, details: {allowedItems: ['edit']}}}
```

最终动作来自代码 allowedItems ∩ 已注册 ID ∩ 可见项。远端 details.allowedItems 只能进一步缩小范围。注册项支持 visible/disabled 布尔值或行谓词；禁用动作保留界面但不执行，直接调用解析后的 handler 也重新检查。

Action 新增 icon、separator、children，描述图标、分隔线和子菜单。More 浮层脱离单元格裁切，超长菜单在视口内滚动；支持方向键、Home/End、Escape、Tab 与关闭回焦。点击子项时重新检查当前动作树的所有祖先 visible/disabled 和当前处理函数，权限收窄后旧菜单不能继续执行。

重复 ID 保留首次注册并诊断；未知 ID 跳过。Registry 包含 toolbar/headerAction/rowAction/search/renderer/editor/filter/exporter 类型槽，本批真正接入的是 rowAction 和 renderer，其余槽供后续 Runtime 使用。

列 renderer 使用稳定字符串 ID 指向代码 renderer；未知 ID 回退文本。渲染函数返回 Vue VNode 或文本，不执行配置字符串，不使用动态 template/eval/innerHTML。Registry 自身的诊断通过 createRegistry({onDiagnostic}) 接收；表格配置诊断由 diagnostic 事件接收。

## 验证与交付

运行完整 verify:release，必须真实通过类型检查、Vitest、构建及开发/生产预览的 Playwright；console.error、pageerror、原生window error、unhandledrejection均为0。源码、Demo和构建入口不得引用 reference。

依用户最新安排，本批本地提交、提供预览，验收后才推送GitHub。远端仍遵循 feature → development → main，不把本地 PASS 写成远端 CI PASS。
