# BusinessTable

企业级、配置驱动的 Vue 3 通用业务表格二次封装。业务页面提供数据、字段和业务动作；查询、分页、列设置和视图状态由组件管理，持久化通过独立适配器接入。

## 文档与开发入口

完整说明见 [文档导航](docs/README.md)，开发规则见 [AGENTS.md](AGENTS.md)。最新开发内容在 `development`，`main` 保留正式基线。

## 本地预览

Windows 可双击 [start-demo.cmd](start-demo.cmd)。脚本会安装锁定版本的依赖、运行基础检查并启动开发服务；成功后打开命令窗口显示的本地地址，查看期间保持窗口打开。

也可以在项目目录运行：

```bash
npx pnpm@10.17.1 install --frozen-lockfile
npx pnpm@10.17.1 run dev -- --host 127.0.0.1
```

通常打开 http://127.0.0.1:5173/ ，实际地址以命令窗口提示为准。

## 快速接入

```vue
<BusinessTable :columns="columns" :data="rows" />
```

支持本地 data 或远程 dataSource。用户配置使用稳定 column.id 保存，不保存 VXE 内部对象。

最简入口只显示表格和分页。需要搜索、工具和设置时，先显式声明设置模块及列能力：

```ts
import type {ColumnConfig, SettingsDefinition} from '@company/business-table'

const columns: ColumnConfig[] = [
  {
    id: 'name', field: 'name', title: '名称', width: 180,
    configurable: {visible: true, rename: true, width: true, fixed: true, order: true},
  },
]
const settingsDefinition: SettingsDefinition = {
  pages: {columns: true, appearance: true, toolbar: true},
  columnSections: {basic: true},
}
```

```vue
<BusinessTable
  table-key="asset.list" row-key="id"
  :features="{search:true,toolbar:true,columnSettings:true}"
  :settings-definition="settingsDefinition"
  :columns="columns" :data-source="dataSource"
  :persistence="persistence" :views="views" :actions="actions"
/>
```

未配置的设置页、列模块和列能力不显示；`true` 表示显示且可编辑，`{enabled: true, disabled: true}` 表示显示只读。列设置由 `pages.columns`、`columnSections` 和 `column.configurable` 三层共同决定。`false`、`enabled: false` 或 `visible: false` 都表示隐藏。远端设置只能进一步隐藏或禁用。

新项目可以使用 `ConfiguredBusinessTable`，通过 `definition.settings` 声明同一套设置，由 Preference 保存差量。版本、列权限、Feature Gate 和 Registry 的完整接入示例见 [配置入口](docs/02-架构与规范/03-配置与能力规范.md)。开发服务的 `/?example=config` 默认开放全部已实现设置；`&mode=readonly` 演示只读，`&mode=unconfigured` 演示未配置时隐藏。另有自定义、Headless、Core-only 和远端关闭示例；报价 Demo 在首页，默认也开放全部已实现设置。

工具栏设置和真实按钮共用 `tools` 声明及 `presentation.toolbar`。工具名称、顺序、显示位置和展示形式的调整会应用到按钮；没有工具的区域不显示。业务叶子工具需要提供真实 `handler`；子菜单通过 `children` 声明，空菜单自动隐藏；`features.toolbar: true` 在未传表格工具时提供内置刷新。

表格设置的列编辑标题和模块导航固定，内容区域独立滚动；各级设置支持展开／收起，折叠保留未应用输入。列、操作按钮、工具、视图和导出字段排序时显示前／后插入线，松开后才改变顺序；只读项继续受权限限制。交互规则见[界面与交互规范](docs/02-架构与规范/05-界面与交互规范.md)。

Search 开启后可用 `searchDefinition` 声明稳定字段 ID、类型、默认值和高级条件；例如 `items: [{ id: 'customer', label: '客户', kind: 'select', field: 'customer', operator: 'eq', options: [{ value: 'C01', label: '客户一' }] }]`。默认界面、Custom 和 Headless 共用同一个 Search Context。自定义界面需将 `features.search` 设为 `{ enabled: true, mode: 'custom' }` 并提供 `#search`；Headless 使用 `mode: 'headless'` 和 `#before="{ search }"`。`setValue` 只改草稿，`submit` 才更新查询；`reset` 按 `resetBehavior` 恢复默认值或清空。View 将已应用值写入 `search.values`，与列筛选和组合筛选分开保存。

平台目标与总体设计见 [平台总体设计](docs/02-架构与规范/01-平台总体设计.md)。它描述最终目标，当前实现范围以迁移矩阵及本批验收记录为准。

## 当前进度

Query/Search、视图创建/更新/重命名/默认/重排/删除、列头菜单/列宽调整、设置预览、Excel/CSV 导出与模板下载已接入通用组件。报价详情、新增、修改、复制使用业务抽屉。此次按旧版实际操作修正首屏及交互；验证范围和结果见 [本批验收](docs/06-验收记录/2026-09/2026-09-23-旧版交互与视觉对齐/README.md)。实际进度见 [当前状态](docs/01-项目入门/03-当前状态.md)和[迁移历史](docs/07-参考与归档/01-旧版迁移历史.md)。

设置中的映射、格式、模板和规则试算已有基础实现；当前“试算”用于核对列显示和导出结果，BT-08 的计算字段与公式引擎仍待实施。

筛选选项使用 `{value: 1, label: 'A'}`：界面显示 A，Query/View/后台传输保留数字 1。`SearchContext.summaryItems` 分别提供 `value` 和 `displayValue`；远程列选项接口通过 `values` 找回已选值标签，详见 [使用说明](docs/01-项目入门/02-本地运行与接入.md)。

报价 Demo 的“数据工具”菜单已接入组合筛选、条件标记、分组汇总、记录对比、区域选择和工具栏设置。组合筛选支持 AND/OR、嵌套条件组、方案管理、统一查询摘要和 View 保存恢复；其既有验收见[组合筛选记录](docs/06-验收记录/2026-09/2026-09-23-组合筛选与查询摘要对齐/README.md)。声明 `query-summary` 可将基础查询、列筛选和组合条件放在同一行；“清除条件”一次重置查询，基础项遵循 `resetBehavior`。

四项新工具的默认 UI 按交互加载；条件标记随个人配置和 View 保存，分组/对比读取当前完整查询，区域选择只保留当前页临时选区。设置历史按用户本轮决定不迁移。配置与保存边界见[数据工具接入](docs/02-架构与规范/07-数据工具接入与行为.md)，本批本地验证与未完成项见[数据工具验收](docs/06-验收记录/2026-09/2026-09-23-剩余数据工具对齐/README.md)。真实后台和完整视觉验收尚未完成。

## 修改与同步

日常修改和提交优先在 `development`，默认不创建功能分支；先在本地预览并完成完整检查，再按用户授权推送。配置接口、功能或用法变化时同步相关说明和当前状态，新增独立版本记录并更新月份索引。保留 `main`，正式发布时另行安排合并；本地保存或提交不会自动更新 GitHub。

## Release gate

先运行 `npx pnpm@10.17.1 exec playwright install chromium` 安装浏览器。`npm run verify:release` 必须同时通过文档链接与索引审计、portability audit、SFC audit、vue-tsc、Vitest、组件库构建、Demo 构建和 Playwright Chromium E2E。main 的发布合并还需用户明确安排。

Playwright 同时检查开发页面和构建后的 Demo，捕获 console.error、pageerror、原生 window error 和 unhandledrejection。单独运行 E2E 前先执行 `npm run build:demo`。

旧版迁移过程和历史差异见 [迁移历史](docs/07-参考与归档/01-旧版迁移历史.md)。[旧版原包](reference/legacy-v3.1/README.md)仅作参考，不参与正式构建。Provider 生命周期与分页行为见 [使用说明](docs/01-项目入门/02-本地运行与接入.md)。

版本变化见 [版本记录](docs/04-版本记录/README.md)；单独检查文档使用 `npm run audit:docs`。
