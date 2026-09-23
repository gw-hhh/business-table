# BusinessTable

企业级、配置驱动的 Vue 3 通用业务表格二次封装。业务页面提供数据、字段和业务动作；查询、分页、列设置和视图状态由组件管理，持久化通过独立适配器接入。

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

新项目可以使用 `ConfiguredBusinessTable`，通过 `definition.settings` 声明同一套设置，由 Preference 保存差量。版本、列权限、Feature Gate 和 Registry 的完整接入示例见 [配置入口](docs/CONFIGURATION.md)。开发服务的 `/?example=config` 默认开放全部已实现设置；`&mode=readonly` 演示只读，`&mode=unconfigured` 演示未配置时隐藏。另有自定义、Headless、Core-only 和远端关闭示例；报价 Demo 在首页，默认也开放全部已实现设置。

工具栏设置和真实按钮共用 `tools` 声明及 `presentation.toolbar`。工具名称、顺序、显示位置和展示形式的调整会应用到按钮；没有工具的区域不显示。业务工具需要提供真实 `handler`；`features.toolbar: true` 在未传表格工具时提供内置刷新。

Search 开启后可用 `searchDefinition` 声明稳定字段 ID、类型、默认值和高级条件；例如 `items: [{ id: 'customer', label: '客户', kind: 'select', field: 'customer', operator: 'eq', options: [{ value: 'C01', label: '客户一' }] }]`。默认界面、Custom 和 Headless 共用同一个 Search Context。自定义界面需将 `features.search` 设为 `{ enabled: true, mode: 'custom' }` 并提供 `#search`；Headless 使用 `mode: 'headless'` 和 `#before="{ search }"`。`setValue` 只改草稿，`submit` 才更新查询；`reset` 按 `resetBehavior` 恢复默认值或清空。View 将已应用值写入 `search.values`，与列筛选和组合筛选分开保存。

当前最高优先级规范为 [Master Handoff](docs/BUSINESS-TABLE-CODEX-MASTER-HANDOFF.md)。它描述最终目标，当前实现范围以迁移矩阵及本批验收记录为准。

## 当前进度

Query Runtime 和 Search Feature 已接入通用组件；完整的 View 创建、修改、默认视图和持久化属于下一项 BT-02。报价 Demo 用于验证迁移，尚未完成旧版全部功能与视觉验收。实际进度见 [当前状态](docs/CODEX-CURRENT-STATE.md)和[迁移矩阵](docs/LEGACY-MIGRATION.md)。

设置中的映射、格式、模板和规则试算已有基础实现；当前“试算”用于核对列显示和导出结果，BT-08 的计算字段与公式引擎仍待实施。

## Release gate

先运行 `npx pnpm@10.17.1 exec playwright install chromium` 安装浏览器。`npm run verify:release` 必须同时通过 portability audit、SFC audit、vue-tsc、Vitest、组件库构建、Demo 构建和 Playwright Chromium E2E，才允许从 development 合并 main。

Playwright 同时检查开发页面和构建后的 Demo，捕获 console.error、pageerror、原生 window error 和 unhandledrejection。单独运行 E2E 前先执行 `npm run build:demo`。

迁移范围、旧版功能/UI/交互差异及分批计划见 [迁移矩阵](docs/LEGACY-MIGRATION.md)。[旧版原包](reference/legacy-v3.1/README.md)仅作参考，不参与正式构建。Provider 生命周期与分页行为见 [使用说明](docs/USAGE.md)。
