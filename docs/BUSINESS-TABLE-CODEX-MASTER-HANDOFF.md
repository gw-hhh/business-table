# BusinessTable — Codex 最终总交接文档

> **用途：直接交给 Codex 作为 BusinessTable 项目的最终总需求、架构、迁移、配置、容灾、组件实现和执行规范。**
>
> 本文不是某一轮对话的摘要，而是基于：
>
> 1. 旧版 `quotation-manager-v3.1`
> 2. 当前 Vue BusinessTable 1.0.0
> 3. 已有 `docs/CODEX-PROJECT-CONTEXT.md`
> 4. `docs/LEGACY-MIGRATION.md`
> 5. `reference/legacy-v3.1/README.md`
> 6. 后续围绕配置体系、Feature Gate、View、Preference、Toolbar、Search、Action、Slot、Headless、按需加载、容灾和组件拆分的全部讨论
>
> 统一整理而成。
>
> **如果历史文档、旧对话、旧方案与本文冲突，以本文为最高优先级。**

---

# 1. 项目背景与最终定位

BusinessTable 不是“报价管理页面”，也不是某个项目专用表格，而是一套：

> **企业级、跨项目复用、配置驱动、能力可声明、按需启用、运行时可扩展、UI 可替换、支持用户偏好和命名视图的 Vue 3 通用业务表格组件。**

报价管理只是：

- 第一个 Demo；
- 旧版 UI / 交互 / 产品能力参考；
- 首个迁移验证场景。

未来应该能直接应用到：

- 资产管理
- 设备管理
- 用户管理
- 医院资产盘点
- 环境监测
- 订单管理
- 财务类后台
- 其他企业管理系统

而不是每个页面重新实现：

- 分页
- 列设置
- View
- Search
- Toolbar
- Row Actions
- 用户偏好
- 导出
- 高级筛选
- 配置持久化

---

# 2. Codex 上次已收到的基础交接要求

以下内容继续有效，并作为执行前提：

1. 先完整阅读：
   - `docs/CODEX-PROJECT-CONTEXT.md`
   - `docs/LEGACY-MIGRATION.md`
   - `reference/legacy-v3.1/README.md`
   - 当前 `README.md`
2. 检查：
   - `main`
   - `development`
   - 当前 Vue BusinessTable 源码
   - Demo
   - Vitest
   - Playwright
   - GitHub Actions
3. 将旧版 `quotation-manager-v3.1` 完整原样放入 `reference/legacy-v3.1/`
4. 旧版只作为：
   - 产品功能基准
   - UI 视觉基准
   - 布局基准
   - 交互基准
   - 功能完整性基准
5. 旧版不参与正式 build
6. 正式 `src/` 禁止依赖旧版实现
7. 不机械把旧 JS 翻译成 Vue
8. 第一阶段先做完整差异分析和迁移矩阵
9. 然后从最新 main 创建 feature 分支
10. 按 `feature → development → main` 流程实施
11. 新功能和 Bug 按 TDD
12. 每批必须跑：
    - vue-tsc
    - Vitest
    - build
    - Playwright
13. `console.error=0`
14. `pageerror=0`
15. Release Gate 没真实 PASS 不得声称完成
16. 不为了追求“最新版”擅自升级核心依赖
17. 不停留在给方案，分析完成后直接开始第一批代码实现
18. 每批汇报：
    - 完成了什么
    - 修改哪些文件
    - 新增哪些测试
    - Release Gate 结果
    - 迁移矩阵更新情况
    - 下一批计划

---

# 3. 当前正式技术基线

当前正式基线：

```text
Vue 3
TypeScript 6.x
Vite 8
VXE Table 4.21.x
VXE PC UI（类型依赖）
Zod
pnpm
Vitest
Vue Test Utils
Playwright
GitHub Actions
```

当前正式版本：

```text
1.0.0
```

当前仓库：

```text
gw-hhh/business-table
```

当前 main 基线：

```text
1f62254b72078f47f0aa53b713be521fad3168f9
```

不要升级 TypeScript 7，除非未来工具链真实验证通过。

---

# 4. 最终产品目标

BusinessTable 必须支持 4 个使用层级。

## Level 1：最基础

```vue
<BusinessTable
  :columns="columns"
  :data="rows"
/>
```

只运行：

```text
Core
Columns
Data
Basic Pagination
Loading
Empty
Error
```

不初始化其他高级能力。

## Level 2：基础配置增强

```vue
<BusinessTable
  table-key="asset.list"
  :columns="columns"
  :data-source="dataSource"
  :features="{
    search: true,
    columnSettings: true,
    toolbar: true
  }"
/>
```

默认使用 BusinessTable 自带 UI。

## Level 3：完整配置驱动

```vue
<ConfiguredBusinessTable
  :definition="effectiveDefinition"
  :data-source="dataSource"
  :runtime="runtime"
  :preference="preference"
/>
```

适合大型企业系统。

## Level 4：高度自定义 / Headless

```vue
<MySearch :runtime="table.search" />
<MyHeaderActions :runtime="table.headerActions" />
<BusinessTableGrid :runtime="table" />
```

页面自己排版，但继续复用：

```text
Runtime
View
Preference
Capability
Query
DataSource
容灾
```

---

# 5. 总体架构原则

BusinessTable 最终采用：

```text
Core Runtime
+
Feature Modules
+
Capability Resolver
+
Feature Resolver
+
Runtime Registry
+
Preference
+
View
+
Default UI
+
Custom UI
+
Headless
```

禁止发展成：

```text
BusinessTable.vue
10000~15000 行
```

应该拆分。

---

# 6. 前后端职责边界

当前重点是前端 BusinessTable。

后端负责根据：

```text
系统默认
租户 / 项目
角色
用户
业务权限
```

最终计算当前用户针对某个 `TableKey` 的：

```text
Effective Definition / Capabilities
```

前端不负责理解：

- 为什么这个角色有某列
- 为什么这个用户不能导出
- 角色和用户谁优先
- 医院、院区、科室怎么继承
- 后端数据库怎么存

前端只消费：

> 当前用户最终有什么、哪些能力允许怎么配置。

但前端仍必须做：

- Schema Validation
- Schema Migration
- Capability Guard
- Runtime Registry 匹配
- Feature Gate
- Fallback
- 容灾

---

# 7. 最终运行链路

```text
Local Definition / Feature Declaration
                ↓
Remote Override（可选）
                ↓
Schema Validation / Migration
                ↓
Feature Gate
                ↓
Capability Guard
                ↓
User Preference Delta
                ↓
Current View Delta
                ↓
Runtime Registry
                ↓
Feature Resolver
                ↓
Effective Runtime Config
                ↓
Default UI / Custom UI / Headless
```

---

# 8. Core 与 Feature Modules

## Core

只保留：

- Data
- DataSource
- Query
- Columns
- Pagination
- Loading
- Empty
- Error
- 基础状态

## Feature Modules

以下都必须是独立 Feature：

- Title
- Views
- Search
- Filters
- Header Actions
- Toolbar
- Column Settings
- Table Settings
- Row Actions
- Selection
- Export
- Import
- Grouping
- Summary
- Compare
- Conditional Formatting
- History
- RichText

---

# 9. Feature Gate —— 当前最终硬规则

**代码配置是基础，后台配置是可选 Override。**

核心公式：

```ts
effectiveEnabled =
  local.enabled === true &&
  remote?.enabled !== false
```

真值：

| 代码 | 后台 | 后台 enabled | 最终 |
|---|---|---|---|
| false | 无 | — | 关闭 |
| false | 有 | true / false | 关闭 |
| true | 无 | — | 开启 |
| true | 有但没写 enabled | undefined | 开启 |
| true | 有 | false | 关闭 |
| true | 有 | true | 开启 |

规则：

1. 代码没有开启，后台不能强行开启。
2. 代码开启，后台完全没有返回该 Feature：
   - 沿用代码配置；
   - Feature 继续开启。
3. 后台有该 Feature，但没有 `enabled`：
   - 不覆盖代码。
4. 后台明确 `enabled=false`：
   - 关闭。
5. 两边开启：
   - 才继续读取详细配置。

Feature 最终关闭后：

```text
STOP
```

不得：

- 读取详细配置
- 初始化 Store
- 建立 watcher
- 注册无用事件
- 动态 import Feature Module
- 渲染 DOM

---

# 10. Remote Config 是 Override，不是完整第二份 Definition

Remote missing：

```text
沿用 Local
```

Remote undefined：

```text
沿用 Local
```

Remote false：

```text
明确关闭
```

Remote value：

```text
在 Capability 允许范围内覆盖
```

代码主要负责：

```text
mode
component
slot
renderer
loadStrategy
registry
```

后台主要负责：

```text
enabled
visible
order
label override
defaultValue
allowed items
用户偏好
布局偏好
```

后台不应该决定：

```text
当前页面是不是使用 custom Vue component
当前页面是否提供某个 Slot
```

---

# 11. Feature Render Mode

统一：

```ts
type FeatureRenderMode =
  | 'default'
  | 'custom'
  | 'headless'
```

## default

BusinessTable 使用官方 UI。

## custom

业务通过 Slot / Registry 替换 UI。

但仍共享：

- Runtime
- State
- View
- Preference
- Query
- Capability

## headless

能力仍然存在，但 BusinessTable 不渲染默认 UI。

---

# 12. Feature Load Strategy

```ts
type FeatureLoadStrategy =
  | 'eager'
  | 'after-definition'
  | 'on-visible'
  | 'on-interaction'
```

建议：

```text
Search             eager
Views              after-definition
ColumnSettings     on-interaction
TableSettings      on-interaction
Export             on-interaction
Import             on-interaction
RichText           on-visible / on-interaction
Grouping           on-interaction
Compare            on-interaction
History            on-interaction
```

例如：

```text
TableSettings enabled
→ 显示入口
→ 用户没点，不加载 Drawer
→ 第一次点，再读取详细配置 + 动态加载模块
```

---

# 13. Feature 配置简单写法与完整写法

允许：

```ts
features: {
  search: true,
  toolbar: true,
  views: false
}
```

内部 normalize：

```text
true
→ {
  enabled: true,
  mode: 'default'
}

false
→ {
  enabled: false
}
```

高级页面：

```ts
features: {
  search: {
    enabled: true,
    mode: 'custom',
    loadStrategy: 'eager'
  },

  toolbar: {
    enabled: true,
    mode: 'headless'
  },

  tableSettings: {
    enabled: true,
    mode: 'default',
    loadStrategy: 'on-interaction'
  }
}
```

---

# 14. 四级定制体系

统一：

```text
Config
  ↓
Registry
  ↓
Slot
  ↓
Headless Runtime
```

这套体系应该覆盖：

- Search
- Header Actions
- Toolbar
- Cell Renderer
- Row Actions
- Column Settings
- Table Settings
- View Switcher
- Pagination
- Empty / Error / Loading
- 其他 UI 区域

---

# 15. 允许替换 UI，但不要轻易替换 State Ownership

这是核心规则。

比如自定义 Search：

不要：

```ts
const myName = ref('')
```

然后完全脱离 BusinessTable。

应该：

```ts
SearchContext {
  values
  getValue()
  setValue()
  reset()
  submit()
}
```

这样仍然兼容：

- View
- Preference
- Reset
- Query
- Capability
- 容灾

---

# 16. Runtime Registry

统一：

```text
Toolbar Registry
Header Actions Registry
Row Actions Registry
Search Registry
Renderer Registry
Editor Registry
Filter Registry
Exporter Registry
```

稳定 ID：

```text
column.id
toolbarItem.id
action.id
searchItem.id
view.id
renderer.id
editor.id
filter.id
exporter.id
```

禁止：

- title 文案
- 数组 index
- 当前显示顺序

作为配置主键。

---

# 17. Slot 体系

至少规划：

```text
#title
#title-extra

#views
#view-item

#search
#search-item-{id}
#search-actions

#header-actions
#header-action-{id}

#toolbar
#toolbar-item-{id}

#header-{columnId}
#cell-{columnId}

#row-actions
#row-action-{id}

#column-settings
#table-settings

#empty
#loading
#error

#pagination
#footer
```

未提供 Slot：

```text
回退 Default UI
```

---

# 18. 配置 Scope

## Definition

决定：

- 表是什么
- Feature 是否存在
- Column 是否存在
- Capability
- 默认布局

## Preference

保存长期个人偏好：

- 列宽
- 显隐
- 顺序
- 冻结
- Density
- PageSize
- Toolbar 布局

## View

保存某一工作状态：

- Search Values
- Filters
- Sorts
- Columns
- PageSize
- 允许跟随 View 的 UI 状态

## Runtime

瞬时：

- 当前 page
- 当前选中行
- Dialog
- Hover
- Loading

## Runtime Registry

业务代码：

- handler
- component
- renderer
- editor

---

# 19. Table Title

支持：

```ts
title: {
  enabled: true,
  text: '资产列表',
  subtitle: '在用资产',
  showTotal: true,
  showRefreshTime: false
}
```

没配置：

```text
不渲染标题区域
```

复杂内容：

```text
Slot / Registry
```

Title 默认不跟 View。

---

# 20. 页面布局

第一阶段不要做任意 Layout Builder。

先固定成熟区域：

```text
Title Area
View Area
Search Area
Header Actions / Toolbar Area
Table Area
Pagination Area
```

允许有限位置配置即可。



# 21. Search 体系

Search 是可选 Feature。

配置示例：

```ts
search: {
  enabled: true,
  mode: 'default',

  collapsible: true,

  defaultCollapsed: false,

  toggleButton: {
    enabled: true,
    position: 'right',
    showText: true
  }
}
```

---

# 22. search-toggle-button 的归属

建议：

```text
是否有 Search
→ Definition

是否可以折叠
→ Definition

Toggle Button 是否存在
→ Definition

位置 / 显示方式
→ Layout / Definition

用户平时展开 / 收起
→ Preference

当前实时状态
→ Runtime

是否跟随 View
→ ViewPersistencePolicy
```

不要默认把：

```text
有没有 search-toggle-button
```

交给 View。

---

# 23. Search 可以完全自定义

支持：

## 内置

```text
text
select
date
date-range
number
...
```

## Registry

```ts
runtime.search.register(
  'Department',
  {
    component: DepartmentTreeSelect
  }
)
```

## Slot

```vue
<template #search="{ context }">
  <MySearchPanel :context="context" />
</template>
```

## Headless

```vue
<MyPageSearch
  :runtime="table.search"
/>
```

---

# 24. View 中保存 Search Value，而不是组件

例如：

```json
{
  "search": {
    "values": {
      "Department": "D001",
      "Name": "张三"
    }
  }
}
```

BusinessTable 根据 ID：

```text
Department
Name
```

匹配 Registry。

---

# 25. Search Value 序列化

复杂 Search 可以：

```ts
serialize()
deserialize()
toQuery()
```

例如：

```text
UI Value
→ Department Tree Node

Persistence Value
→ D001

Query Value
→ departmentIds: [...]
```

三者可以解耦。

---

# 26. Search 默认值

支持：

```ts
{
  id: 'Status',
  defaultValue: 1
}
```

建议优先级：

```text
Definition Default
→ Page Initial
→ Preference（如允许）
→ Current View
→ Runtime Override
```

通常：

```text
Current View
```

应该覆盖普通 Preference。

---

# 27. Search Reset

默认：

```text
恢复当前有效默认值
```

而不是：

```text
全部清空
```

可以：

```ts
resetBehavior:
  | 'default'
  | 'empty'
```

---

# 28. Header Actions

Header Actions 偏业务操作：

- 新增
- 批量转移
- 提交审核
- 生成盘点单

它不是 Toolbar 的简单同义词。

---

# 29. Toolbar

Toolbar 偏表格工具：

- 刷新
- 列设置
- 表格设置
- 密度
- 导出
- 全屏

Header Actions 与 Toolbar 可以共享底层 Action Core。

---

# 30. Action Core

建议统一：

```ts
ActionDefinition {
  id
  label
  icon
  placement
  order
  visible
  disabled
  danger
}
```

Placement：

```text
header
toolbar
row-inline
row-more
batch
```

Runtime：

```ts
handler(context)
```

---

# 31. Header Action / Toolbar 配置与 Runtime

后台：

```json
{
  "headerActions": {
    "enabled": true,

    "items": [
      {
        "id": "add",
        "visible": true,
        "order": 10
      }
    ]
  }
}
```

代码：

```ts
runtime.headerActions.register(
  'add',
  {
    handler() {
      openCreate()
    }
  }
)
```

最终：

```text
Allowed
∩ Registered
∩ Visible
```

---

# 32. Action Context

Header Action 建议：

```ts
{
  selectedRows
  selectedKeys
  query
  currentView
  execute()
  reload()
  clearSelection()
}
```

Row Action：

```ts
{
  row
  rowKey
  reload()
  updateRow()
  removeRow()
}
```

避免业务页面到处：

```text
tableRef.value.xxx
```

---

# 33. Columns 必须显式定义

正式生产：

```text
禁止根据 API 返回字段自动全部生成列
```

因为：

```text
API Data Fields ≠ Table Columns
```

Columns 可以来自：

- 页面代码
- 后端 Effective Definition

---

# 34. Columns 两种正式模式

## 代码定义

```vue
<BusinessTable
  :columns="columns"
  :data-source="dataSource"
/>
```

## 后台配置定义

```vue
<ConfiguredBusinessTable
  :definition="definition"
  :data-source="dataSource"
  :runtime="runtime"
/>
```

---

# 35. inferColumns 只能用于 Demo / 调试

可以提供：

```ts
inferColumns(data)
```

但不要作为企业正式模式。

---

# 36. Displayed Columns 与 Required Fields 分离

例如：

```text
ID 不显示
```

但：

```text
Edit Action 仍然需要 row.id
```

所以：

```text
Displayed Columns ≠ Required Data Fields
```

未来可以支持：

```text
requiredFields
```

但不能简单只请求当前显示字段。

---

# 37. Column 五层模型

每列：

```text
Access
Default
Capabilities
Constraints
Preference
```

---

# 38. Access

当前用户有没有这列。

无权访问的敏感列：

```text
最好后端就不返回 Definition
```

例如：

```text
InternalCost
```

不要只：

```text
visible=false
```

因为：

> 隐藏不是权限。

---

# 39. Default

系统默认：

```ts
default: {
  visible: true,
  width: 160,
  fixed: false,
  align: 'left'
}
```

---

# 40. Capabilities

用户允许配置什么。

例如：

```ts
configurable: {
  visible: true,
  order: true,
  width: true,
  fixed: true,
  rename: true
}
```

---

# 41. Constraints

例如：

```ts
width: {
  enabled: true,
  min: 80,
  max: 300
}
```

---

# 42. Preference

用户最终做了哪些合法修改。

---

# 43. 系统固定 ID 列

例如：

```ts
{
  id: 'Id',
  field: 'id',
  title: 'ID',

  default: {
    visible: true,
    width: 100,
    fixed: 'left',
    align: 'center'
  },

  configurable: {
    visible: false,
    order: false,

    width: {
      enabled: true,
      min: 80,
      max: 180
    },

    fixed: false,
    rename: false,
    align: false,
    style: false
  }
}
```

---

# 44. visible 与 configurable.visible 完全不同

```text
visible=false
```

表示：

> 当前不显示。

```text
configurable.visible=false
```

表示：

> 用户不允许修改显示状态。

---

# 45. 列设置 UI 锁定表现

例如：

```text
☑ ID                 ◧
☑ 资产编号            ◧ ◨
☑ 资产名称            ◧ ◨
☐ 规格型号            ◧ ◨
```

ID：

- checkbox checked + disabled
- 左冻结 active + disabled
- width 若可改，仍然开放

Tooltip：

```text
系统固定列，不支持隐藏
```

不要把锁定项完全隐藏。

---

# 46. Column Capabilities

至少：

```text
visible
order
width
fixed
rename
align

font
fontSize
fontWeight
textColor
backgroundColor
wrap

sort
filter

format
valueMap
conditionalStyle

renderer
editor

export
import
```

---

# 47. 支持能力与可配置能力分开

例如：

```ts
sortable: true
configurable.sort: false
```

表示：

- 支持排序
- 用户不能关闭排序

---

# 48. Column Constraints

例如：

```ts
fixed: {
  enabled: true,
  allowedValues: [
    false,
    'left',
    'right'
  ]
}
```

```ts
format: {
  enabled: true,
  allowedTypes: [
    'number',
    'currency'
  ]
}
```

---

# 49. 系统列

建议：

```text
$selection
$index
$expand
$actions
```

---

# 50. 操作列

`$actions`：

- 可以固定右侧
- 不允许拖走
- 可以允许改宽度
- 里面按钮不属于 Column Config

按钮属于：

```text
Action Config
```



# 51. Preference

Preference 是：

> 用户偏好，不是权限。

建议只保存 Delta。

例如默认：

```text
visible=true
width=180
align=left
```

用户只改 width：

```json
{
  "width": 260
}
```

不要保存完整快照。

---

# 52. Preference 可以保存什么

建议：

- 列显隐
- 列顺序
- 列宽
- 冻结
- 重命名
- 样式
- density
- pageSize
- Toolbar 布局偏好
- Action 布局偏好
- Search collapsed（如果定义为 Preference）

---

# 53. Preference 不保存什么

不要保存：

- 当前 page
- 当前选中行
- 当前 hover
- 当前 More
- Dialog
- Loading
- 临时错误状态

---

# 54. Preference 不能突破 Capability

如果：

```text
Id.visible
```

不可配置，

旧 Preference：

```json
{
  "Id": {
    "visible": false
  }
}
```

必须：

```text
忽略非法 Delta
```

---

# 55. Reset 语义

必须区分：

```text
恢复当前列默认
恢复当前 View 默认
恢复表格默认
清除个人设置
```

清除个人设置：

```text
删除 Preference Delta
→ 重新从 Definition + View 计算
```

---

# 56. View 是可选 Feature

只有：

```text
Local views.enabled = true
+
Remote 没明确 false
```

才初始化。

关闭时：

- 不读 View
- 不初始化 View Store
- 不恢复 View
- 不监听 View
- 不渲染 View UI

---

# 57. View 的定义

View 是：

> 一组可恢复的 Table State Delta。

不是简单的筛选条件。

---

# 58. View 需要支持的信息

至少：

```text
id
name
isDefault
isSystem
isReadOnly

columns
search values
filters
sorts

pagination.pageSize

可选：
density
toolbar layout
action layout
searchCollapsed
...
```

---

# 59. View 示例

```json
{
  "id": "zhangsan",
  "name": "张三相关",

  "isDefault": false,

  "columns": {
    "UserId": {
      "visible": true,
      "order": 0,
      "width": 100,
      "fixed": "left"
    },

    "Name": {
      "visible": true,
      "order": 1,
      "width": 180
    },

    "Phone": {
      "visible": false
    }
  },

  "search": {
    "values": {
      "Name": "张三"
    }
  },

  "sorts": [
    {
      "field": "Name",
      "order": "asc"
    }
  ],

  "pagination": {
    "pageSize": 50
  }
}
```

---

# 60. View 切换行为

切换：

```text
恢复合法配置
→ 当前 page 归 1
→ 重新 Query
```

View 保存：

```text
pageSize
```

不保存：

```text
page=7
```

---

# 61. ViewPersistencePolicy

建议：

```ts
{
  columns: true,
  searchValues: true,
  filters: true,
  sorts: true,
  pageSize: true,

  density: false,
  searchCollapsed: false,
  toolbarLayout: false,
  actionLayout: false
}
```

不是所有状态都默认跟 View。

---

# 62. View 不能突破 Capability

如果 View：

```json
{
  "Id": {
    "visible": false,
    "fixed": false
  }
}
```

但 Id 强制显示、左冻结：

```text
Guard
→ 丢弃
```

---

# 63. 默认 View 容灾

多个：

```text
isDefault=true
```

处理：

```text
取第一个合法 default
其他 warning
```

没有 default：

```text
第一个可用 View
或系统基础 View
```

上次 View 已删除：

```text
fallback
```

---

# 64. View 中旧 ID

例如：

```text
OldDepartment
```

已经不存在。

处理：

```text
忽略
warning
其他配置继续
```

不能整 View 崩。

---

# 65. Table Settings

Table Settings 必须是 Feature。

例如：

```ts
tableSettings: {
  enabled: true,
  mode: 'default',
  loadStrategy: 'on-interaction'
}
```

后台没配置：

```text
按代码开启
```

后台：

```json
{
  "tableSettings": {
    "enabled": false
  }
}
```

则：

```text
入口都不显示
模块也不加载
```

---

# 66. Column Settings

同样 Feature Gate。

可以：

```text
default
custom
headless
```

Custom：

```vue
<template #column-settings="{ context }">
  <MyColumnSettingsDrawer
    :context="context"
  />
</template>
```

但：

- 哪些列允许隐藏
- 哪些列能冻结
- 哪些列能改名

仍由 Capability 决定。

---

# 67. Filters

Search 与高级 Filters 不要强绑定。

简单页面：

```text
只有 Search
```

复杂页面：

```text
Search + Advanced Filters
```

Filters 未开启：

```text
不加载组合条件 / AND OR / Range
```

---

# 68. Filter 类型

至少：

```text
text
select
multi-select
number
number-range
date
date-range
boolean
remote-options
```

选项来源：

```text
static
valueMap
API
```

---

# 69. 数字格式

支持：

- number
- thousand separator
- min/max fraction digits
- currency
- percent
- prefix
- suffix

百分比必须区分：

```text
ratio
0.1234
→ 12.34%

percent
12.34
→ 12.34%
```

禁止猜。

---

# 70. Value Mapping

保留原始类型：

```text
1
"1"
"01"
true
false
null
```

不能全部转 string。

支持：

- label
- textColor
- background
- border
- icon
- empty rule
- unmatched rule

---

# 71. Renderer / Editor Registry

复杂显示：

```ts
rendererRegistry.register(
  'device-status',
  renderer
)
```

Column：

```ts
{
  renderer: 'device-status'
}
```

数据库只保存 ID。

禁止保存：

- Vue template
- JS code
- eval
- new Function

---

# 72. 富文本

富文本应该是：

```text
Renderer / Editor Plugin
```

不是 Core 强耦合。

Feature 未启用：

```text
不加载富文本编辑器依赖
```

---

# 73. 导出

需要：

```text
CSV
XLSX
模板下载
```

范围：

```text
当前页
当前查询结果
选中数据
全部数据
```

---

# 74. 大数据导出

禁止浏览器：

```text
拉几十万行
```

提供：

```text
ExporterAdapter
```

服务端执行大型导出。

---

# 75. Excel 模板

模板字段不能依赖用户当前列显隐。

例如：

```text
AssetNo
```

是导入必填字段。

即使用户隐藏：

```text
仍必须在模板中
```

---

# 76. 分组 / Summary / Compare / History

这些全部属于高级 Feature。

默认：

```text
OFF
```

只有显式开启才加载。

---

# 77. 配置 SchemaVersion

所有持久化配置都需要：

```json
{
  "schemaVersion": 3
}
```

必须有：

```text
v1
→ migrate
v2
→ migrate
v3
```

不能某天字段改名后让历史配置全部失效。

---

# 78. JSON 校验

使用安全 Schema：

```text
safeParse
```

不要直接信任 JSON。

---

# 79. 容灾总原则

> **配置错误尽量局部失败，Core Table 尽量继续工作。**

---

# 80. JSON parse 失败

处理：

```text
ConfigParseError
→ fallback 默认配置
→ Core 继续
```

---

# 81. 局部 Schema 错

处理：

```text
错误模块回退
其他合法模块继续
```

不要整份配置作废。

---

# 82. Registry ID 不存在

例如：

```text
toolbar add
```

后台有，但页面没注册。

处理：

```text
开发环境 warning
生产环境 skip
可选 telemetry
```

不能白屏。

---

# 83. Renderer 不存在

处理：

```text
fallback text renderer
+
warning
```

---

# 84. 非法 PageSize

例如：

```text
37
```

但允许：

```text
20 / 50 / 100
```

处理：

```text
fallback 默认合法值
```

---

# 85. 重复稳定 ID

Definition 校验阶段：

```text
报告错误
```

禁止静默覆盖。

---

# 86. Remote Config API 失败

如果远端配置读取失败：

```text
degraded
```

根据业务：

- 回退代码配置
- 或禁用该扩展模块

但：

```text
Core Table 尽量继续
```

---

# 87. Feature State

建议：

```ts
type FeatureState =
  | 'disabled'
  | 'enabled'
  | 'degraded'
  | 'unavailable'
```

---

# 88. Provider 并发

必须防止：

```text
A 请求
B 请求
B 先回来
A 后回来
A 覆盖 B
```

使用：

```text
AbortController
+
request sequence
```

---

# 89. 性能硬规则

1. Feature OFF 不初始化
2. Feature Gate 在详细配置读取前执行
3. 高成本模块 dynamic import
4. `on-interaction` Feature 用户不打开就不加载
5. Definition 与 Data API 解耦
6. 翻页不重复加载整个 Definition
7. Preference/View 使用 Delta
8. 避免配置变化导致整表重建
9. 大数据排序/筛选/导出交给后端
10. XLSX / RichText / Compare 不进入基础 bundle

---

# 90. 推荐启动流程

```text
① Core 初始化
② 获取 / 接收 Effective Definition / Remote Override
③ Schema Validation + Migration
④ 计算 Feature Gate
⑤ 关闭的 Feature 立即短路
⑥ 按需读取开启 Feature 配置
⑦ 加载 Preference
⑧ View 开启时加载 View
⑨ Capability-aware Merge
⑩ Runtime Registry 匹配
⑪ Feature Resolver
⑫ Effective Runtime Config
⑬ 按 LoadStrategy 加载 Feature Module
⑭ 生成 Query
⑮ DataSource 请求
⑯ 渲染
```

---

# 91. Action / Search / View 都必须使用稳定 ID

统一：

```text
ID 是配置和代码之间的桥梁。
```

不要用：

```text
显示名称
```

匹配。

---

# 92. 推荐错误类型

至少：

```text
ConfigParseError
SchemaValidationError
MigrationError
UnknownRegistryId
CapabilityViolation
FeatureDisabled
RemoteConfigError
DataSourceError
```

开发环境给出清晰 warning。

生产环境：

```text
可接 telemetry
```

---

# 93. TDD 必测场景

必须覆盖：

- Local false + Remote true → 仍关闭
- Local true + Remote missing → 开启
- Local true + Remote false → 关闭
- Local true + Remote true → 开启
- Feature OFF 不读详细配置
- default/custom/headless
- on-interaction 未点击不加载
- Allowed ∩ Registered
- Registry 缺失
- JSON 损坏
- Schema migration
- 非法 Preference 被 Guard
- View 过期 ID
- 多 default View
- Search View Value 恢复
- View pageSize 恢复
- 固定列不能被 View / Preference 解锁
- 自定义 Search 仍兼容 View / Reset / Query
- Custom Toolbar 仍兼容 Action Resolver
- Provider race
- Renderer fallback
- console.error=0
- pageerror=0

---

# 94. Release Gate

正式交付必须：

```text
pnpm install                 PASS
portability audit            PASS
vue-tsc                      PASS
Vitest                       PASS
mount test                   PASS
declaration build            PASS
Vite library build           PASS
Vite Demo build              PASS
Playwright Chromium          PASS
console.error                0
pageerror                    0
```

任何一项失败：

> 不得声称完成。

---

# 95. Git 流程

固定：

```text
main
→ feature/xxx
→ development
→ CI
→ main
```

feature 不直接 main。

---

# 96. Codex 实施优先级

## P0：架构地基

优先实现：

- FeatureConfig normalize
- FeatureGate
- Remote Override Resolver
- Capability-aware Merge
- SchemaVersion
- Zod Schema
- Migration
- Runtime Registry
- Provider 并发取消
- 基础错误 / telemetry 模型

## P1：列与设置

- Column Access / Default / Capability / Constraint / Preference
- 显隐
- 顺序
- Width
- 双冻结
- Rename
- Align
- Font / Color / Background
- Sort Config
- Filter Config
- Number Format
- Value Mapping
- ColumnSettings default/custom/headless

## P2：Search / View / Actions

- Search Registry
- Search 自定义组件
- Search Slot / Headless
- View CRUD
- 默认 / 系统 / 个人 View
- ViewPersistencePolicy
- Toolbar
- Header Actions
- Row Actions
- Action Core
- default/custom/headless

## P3：输出 / 高级能力

- CSV
- XLSX
- 模板
- ExporterAdapter
- Grouping
- Summary
- Compare
- Conditional Formatting
- History
- Renderer / Editor Registry
- RichText

---

# 97. Codex 每批必须汇报

每批都要告诉用户：

```text
完成内容
修改文件
新增/修改测试
Release Gate / CI
迁移矩阵变化
兼容性 / 风险
下一批计划
```

---

# 98. 最终验收标准

BusinessTable 成功的标准不是：

> 报价 Demo 功能很多。

而是：

> 第二、第三个业务项目不修改 BusinessTable Core，只通过数据、Definition、Preference、View、Runtime Registry、Slot/Renderer 和少量业务组件，就能快速获得完整、稳定、可配置的业务表格能力；简单页面又不会承担高级能力的性能成本。

---

# 99. Codex 当前第一条执行指令

请：

1. 先完整阅读本文
2. 对照旧版 reference
3. 对照当前 Vue 1.0.0
4. 更新 `docs/LEGACY-MIGRATION.md`
5. 明确当前源码距离本文架构的差异
6. 不停留在方案
7. 从最新 main 创建 feature 分支
8. 从 P0 开始按 TDD 实际修改代码
9. 每完成一批跑完整 Release Gate
10. development 全绿后再进入 main

---

# 100. 最重要的几条硬规则

最后再次强调：

1. **旧版已有能力只增不减**
2. **代码 Feature 是第一道门**
3. **后台缺失 Feature 配置时沿用代码**
4. **后台明确 enabled=false 时关闭**
5. **代码没开启，后台不能开启**
6. **Feature OFF 后续逻辑全部短路**
7. **配置是数据，不是代码**
8. **UI 可自定义，但 State / Runtime 尽量统一**
9. **Preference / View 永远不能突破 Capability**
10. **简单场景必须保持简单**
11. **高级能力按需启用、按需加载**
12. **没有真实测试 PASS 不得称完成**
