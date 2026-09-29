# 可复制的物料接入示例

这些示例使用与报价无关的物料/设备数据，导入路径均为公开包 `@company/business-table` 或其公开子入口。每个 Vue 文件可单独作为页面使用；ComposedTable 另有仓库内双实例预览。先按[逐步接入教程](../../01-项目入门/06-逐步接入教程.md)安装包、注册插件并加载样式，再复制本目录到自己的 `src/examples/`。

## 文件清单与试用顺序

| 文件 | 说明 | 依赖与可观察结果 |
| --- | --- | --- |
| [assets.ts](assets.ts) | 公共行类型、三条物料数据、四个字段 | 状态原值为数字 0/1，显示草稿/已确认 |
| [MinimalTable.vue](MinimalTable.vue) | 最小本地表格 | 仅依赖 assets；显示行、分页与格式化金额 |
| [ConfiguredTable.vue](ConfiguredTable.vue) | 完整配置入口 | 全部设置模块、查询/筛选、查看动作、刷新、四项数据工具；本地保存 PreferenceV3 |
| [CustomSearch.vue](CustomSearch.vue) | 自定义搜索外观 | 自定义表单复用 Search Context；输入不立即查询，提交后摘要更新 |
| [ComposedTable.vue](ComposedTable.vue) | 独立组件组合 | runtime/components 子入口；外置搜索、隐藏保留草稿、工具、表体和分页共用实例；instanceKey 隔离多个列表 |
| [ViewsTable.vue](ViewsTable.vue) | 命名视图管理 | 查询后另存视图，切换、重命名、默认、删除；刷新后从本地加载 |
| [ExportTable.vue](ExportTable.vue) | 导出与模板下载 | 导出当前完整查询；模板固定字段与个人布局分离 |
| [asset-source.ts](asset-source.ts) | HTTP 适配器 | 请求取消、响应检查、完整读取、候选原值/标签回查 |
| [RemoteTable.vue](RemoteTable.vue) | 服务端分页接入 | 依赖 assets 与 asset-source；必须有符合协议的真实或模拟后台 |

## 如何切换页面

将目标示例作为自己的 App 根组件或路由组件，例如入口导入 `ConfiguredTable.vue`，然后 `createApp(ConfiguredTable).use(BusinessTablePlugin).mount('#app')`。入口完整代码见[教程](../../01-项目入门/06-逐步接入教程.md#在另一个-vue-项目使用)。每次选择一个示例即可，不需要把多个表格堆到同一页。

当前仓库已提供的浏览器入口是 `/?example=config`，其中含默认、只读、未配置、自定义、Headless、后台关闭和最简模式。路径与检查步骤见[操作教程](../../01-项目入门/05-使用操作教程.md)。这些现有入口用于快速体验，本目录用于复制接入。

`/?example=composition` 渲染两个 ComposedTable，用不同 instanceKey 验证查询、显隐和分页的实例隔离。组件边界、默认值和远程关闭分页的契约见[组件组合与分页](../../02-架构与规范/12-组件组合与分页.md)。

## 持久化和业务边界

- ConfiguredTable 在浏览器保存个人设置；ViewsTable 另存命名视图，使用不同键。示例键仅用于演示，正式项目需要租户、账号、页面隔离。
- 配置入口提供 `savePreference` 后才有可等待的外部保存结果；仅监听 `preferenceChange` 不能确认后台已写入。
- “查看”动作只展示所选物料名称，是实际可观察的示例行为。新增、编辑、删除等业务 API 由项目自身提供。
- 导出示例在点击时读取查询结果快照；没有开放列个性化设置，所以导出字段使用固定 columns。需要继承用户列配置时，从 `getState().columns` 按稳定 ID 合并，参考[导出配方](../../02-架构与规范/11-场景配置配方.md#导出与模板)。
- RemoteTable 的 `/api/assets/*` 是示例协议，不是本仓库已实现的服务。部署、鉴权、完整查询与多客户端冲突须单独验收。

## 示例检查

`npm run build:lib` 的包审计会解包实际发布包，对本目录全部 `.ts`、`.vue` 运行严格 `vue-tsc`，同时检查 Vue 模板及公开导出。`npm run verify:release` 包含该检查。示例均随 docs 进入发布包，不依赖仓库私有 `src/` 导入。

类型检查不等于真实后台验收；浏览器回归覆盖仓库现有 Demo。原有示例验证见[2026-09-28 验收](../../06-验收记录/2026-09/2026-09-28-使用与配置文档完善/README.md)，组件组合新增范围及实际执行状态见[本批验收](../../06-验收记录/2026-09/2026-09-29-组件组合与交互基础升级/README.md)。

[返回业务模块](../README.md)
