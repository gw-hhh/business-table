# 剩余数据工具对齐验收

## 范围与依据

本批在 `development` 接入条件标记、分组汇总、记录对比和区域选择。设置历史按用户最新决定排除，不作入口或存储。实施边界见[计划](../../../05-实施计划/2026-09/2026-09-23-剩余数据工具对齐计划.md)，协议与兼容见[版本说明](../../../04-版本记录/2026-09/2026-09-23-07-剩余数据工具对齐.md)。旧版 `reference/legacy-v3.1/quotation-manager-v3.1/index.html` 只作行为与布局对照，不导入运行代码。

## 验收项目

- 条件标记：默认、个人和 View 规则优先级；按原值类型首条命中；只读、字段撤销、关闭 Gate、保存失败不发布；刷新后未打开 UI 仍显示；保存中切换 View 或 tableKey 不回灌旧覆盖。
- 分组汇总：当前完整 Query、最多两级、按原值类型分组、原始十进制合计、明细与汇总显示、导出文件内容；接口缺失、超限与迟到请求。
- 记录对比：当前完整 Query 中选择 2–4 条、搜索、基准、只看不同项、差额和 XLSX；取消/关闭或查询变化后不沿用旧数据。
- 区域选择：仅当前页可见数据列，鼠标及键盘矩形、当前页变化清空、复制 TSV、剪贴板拒绝后的手动复制、数值统计；与业务行选择互不影响。
- 入口与配置：默认关闭、远端只收窄、显式只读、按交互加载、默认／Custom／Headless 共用状态；Demo 只提供报价字段与工具动作。

## 本地验证记录

本批 2026-09-23 启动，2026-09-24 收尾。在本地 development 执行 `npm run verify:release`，退出码 0。最终日志为工作区中的 `verify-data-tools-frozen.log`（日志不入库）；补充 `npm run build:lib` 重新生成最终样式的发布包，独立消费审计通过，226 个打包文件。本批新增 64 项单元测试和开发／构建预览共 12 项浏览器测试。

| 层次 | 实际结果 | 证据或待补内容 |
| --- | --- | --- |
| 单元与组件测试 | 通过 | 66 个文件、529 项测试。覆盖标记条件及 UI、配置与 View、报告、选区、通用入口和权限回归。 |
| 类型、SFC、构建、发布包 | 通过 | 完整门禁包括可移植性、SFC、类型检查、库／声明／Demo 构建与独立包消费审计。 |
| 文档审计 | 通过 | `npm run audit:docs` 退出码 0，59 篇 docs Markdown 的目录、链接、锚点和索引有效。 |
| Chromium 开发与构建预览 | 通过 | 131 项，运行错误采集为 0。`tests/e2e/data-tools.spec.ts` 的截图附件覆盖标记、分组、对比及选区；结果在本地 `test-results/`，可由测试重新生成。 |
| 旧版操作与布局对照 | 完成所列场景 | 实际打开旧版与 Vue，核对规则抽屉、分组展开、候选／基准、区域提示。1280 × 720 下分组抽屉、第一分组选择器、首组标题与明细首格，以及对比搜索框／基准选择器的几何差异 ≤ 1 CSS 像素；390 像素窄屏验证抽屉和关闭入口。该结论不扩大到全部浏览器或所有界面状态。 |
| 远端 CI | 未执行 | 本地检查不代替远端工作流。 |
| 真实后台 | 未验收 | 尚无本批真实 `readAll`、Preference 保存、权限及冲突接口。 |
| 用户视觉/业务验收 | 未验收 | 由用户在可运行版本上另行确认。 |

### 失败复现与修正

- TDD 先复现原值类型、保存失败与只读边界，再实现规则／报告／选区；新增保存中切换 View 的回归先失败，修复后保留新视图标记。
- 独立审查发现远端列白名单未参与工具 Context 收窄，以及导出过程中切换选项可能下载旧报表；均补失败用例后修复。FeatureHost 以受支持字段的语义签名跟踪权限，等值数组不会重新创建正在保存的界面。
- 浏览器复现拖动选区后键盘扩选从起点继续；改为使用实际选区终点。另补单元格留白开始框选、交互子元素不拦截的回归；高亮直接消费稳定列 ID 的选中状态，不通过重复 field 反推列。
- 中间一轮验证曾因开发期间的热更新关闭弹层而失败；触屏用例 trace 明确记录 `/demo/App.vue` 与 `/src/components/DataToolsHost.vue` 热更新。失败 trace 保留在系统临时目录 `business-table-data-tools-hmr-20260923`。停止修改后完整重跑，529 项单测及 131 项浏览器测试全部通过；不把中断轮次作为成功结果。

## 架构与提交

新增能力分别进入条件标记 Feature、报告 Feature 和区域选择 Feature，由 DataToolsHost 统一挂载。条件标记使用既有 Runtime 配置写队列、Preference 和 View；ConfiguredBusinessTable 的可选 savePreference 参与保存确认。Demo 只提供业务字段与打开工具的动作。

本批提交说明为 `feat: align remaining data tools and exclude settings history`，具体提交号以对应 Git 记录为准。提交到本地 development；未推送远端，未修改 main，reference 无变更。

## 修改范围

共享代码位于 `src/features/conditional-formatting/`、`src/features/reports/`、`src/features/range-selection/`、`src/components/DataToolsHost.vue`、`src/runtime/useTableRuntime.ts`、`src/config/`、`src/BusinessTable.vue` 与 `src/ConfiguredBusinessTable.vue`。报价 Demo 只声明字段和打开工具的动作。完整修改文件如下：

- [CHANGELOG.md](../../../../CHANGELOG.md)
- [demo/App.vue](../../../../demo/App.vue)
- [demo/ConfigExample.vue](../../../../demo/ConfigExample.vue)
- [demo/quotation/model.ts](../../../../demo/quotation/model.ts)
- [docs/01-项目入门/02-本地运行与接入.md](../../../../docs/01-项目入门/02-本地运行与接入.md)
- [docs/01-项目入门/03-当前状态.md](../../../../docs/01-项目入门/03-当前状态.md)
- [docs/01-项目入门/04-后续路线图.md](../../../../docs/01-项目入门/04-后续路线图.md)
- [docs/02-架构与规范/03-配置与能力规范.md](../../../../docs/02-架构与规范/03-配置与能力规范.md)
- [docs/02-架构与规范/07-数据工具接入与行为.md](../../../../docs/02-架构与规范/07-数据工具接入与行为.md)
- [docs/02-架构与规范/README.md](../../../../docs/02-架构与规范/README.md)
- [docs/03-业务模块/01-报价演示模块.md](../../../../docs/03-业务模块/01-报价演示模块.md)
- [docs/04-版本记录/2026-09/2026-09-23-07-剩余数据工具对齐.md](../../../../docs/04-版本记录/2026-09/2026-09-23-07-剩余数据工具对齐.md)
- [docs/04-版本记录/2026-09/README.md](../../../../docs/04-版本记录/2026-09/README.md)
- [docs/04-版本记录/README.md](../../../../docs/04-版本记录/README.md)
- [docs/05-实施计划/2026-09/2026-09-23-剩余数据工具对齐计划.md](../../../../docs/05-实施计划/2026-09/2026-09-23-剩余数据工具对齐计划.md)
- [docs/05-实施计划/2026-09/README.md](../../../../docs/05-实施计划/2026-09/README.md)
- [docs/06-验收记录/2026-09/2026-09-23-剩余数据工具对齐/README.md](../../../../docs/06-验收记录/2026-09/2026-09-23-剩余数据工具对齐/README.md)
- [docs/06-验收记录/2026-09/README.md](../../../../docs/06-验收记录/2026-09/README.md)
- [docs/06-验收记录/README.md](../../../../docs/06-验收记录/README.md)
- [docs/README.md](../../../../docs/README.md)
- [playwright.config.ts](../../../../playwright.config.ts)
- [README.md](../../../../README.md)
- [src/BusinessTable.vue](../../../../src/BusinessTable.vue)
- [src/components/DataToolsHost.vue](../../../../src/components/DataToolsHost.vue)
- [src/components/FeatureHost.vue](../../../../src/components/FeatureHost.vue)
- [src/config/features.ts](../../../../src/config/features.ts)
- [src/config/schema.ts](../../../../src/config/schema.ts)
- [src/config/types.ts](../../../../src/config/types.ts)
- [src/ConfiguredBusinessTable.vue](../../../../src/ConfiguredBusinessTable.vue)
- [src/features/conditional-formatting/conditional-formatting.css](../../../../src/features/conditional-formatting/conditional-formatting.css)
- [src/features/conditional-formatting/ConditionalFormattingFeature.vue](../../../../src/features/conditional-formatting/ConditionalFormattingFeature.vue)
- [src/features/conditional-formatting/context.ts](../../../../src/features/conditional-formatting/context.ts)
- [src/features/conditional-formatting/model.ts](../../../../src/features/conditional-formatting/model.ts)
- [src/features/data-tools.ts](../../../../src/features/data-tools.ts)
- [src/features/range-selection/context.ts](../../../../src/features/range-selection/context.ts)
- [src/features/range-selection/RangeSelectionFeature.vue](../../../../src/features/range-selection/RangeSelectionFeature.vue)
- [src/features/range-selection/surface.ts](../../../../src/features/range-selection/surface.ts)
- [src/features/reports/CompareFeature.vue](../../../../src/features/reports/CompareFeature.vue)
- [src/features/reports/context.ts](../../../../src/features/reports/context.ts)
- [src/features/reports/export.ts](../../../../src/features/reports/export.ts)
- [src/features/reports/GroupingFeature.vue](../../../../src/features/reports/GroupingFeature.vue)
- [src/features/reports/GroupTree.vue](../../../../src/features/reports/GroupTree.vue)
- [src/features/reports/model.ts](../../../../src/features/reports/model.ts)
- [src/features/reports/reports.css](../../../../src/features/reports/reports.css)
- [src/features/reports/ReportTable.vue](../../../../src/features/reports/ReportTable.vue)
- [src/features/views/runtime.ts](../../../../src/features/views/runtime.ts)
- [src/index.ts](../../../../src/index.ts)
- [src/runtime/useTableRuntime.ts](../../../../src/runtime/useTableRuntime.ts)
- [src/style.css](../../../../src/style.css)
- [src/types.ts](../../../../src/types.ts)
- [tests/conditional-formatting-ui.spec.ts](../../../../tests/conditional-formatting-ui.spec.ts)
- [tests/conditional-formatting.spec.ts](../../../../tests/conditional-formatting.spec.ts)
- [tests/conditional-runtime.spec.ts](../../../../tests/conditional-runtime.spec.ts)
- [tests/data-reports-ui.spec.ts](../../../../tests/data-reports-ui.spec.ts)
- [tests/data-reports.spec.ts](../../../../tests/data-reports.spec.ts)
- [tests/data-tools-integration.spec.ts](../../../../tests/data-tools-integration.spec.ts)
- [tests/data-tools-permissions.spec.ts](../../../../tests/data-tools-permissions.spec.ts)
- [tests/e2e/data-tools.spec.ts](../../../../tests/e2e/data-tools.spec.ts)
- [tests/range-selection.spec.ts](../../../../tests/range-selection.spec.ts)

## 仍需验证的边界

真实后台需验证完整查询的字段权限和上限、已选值类型、账号隔离、Preference 保存失败及多客户端冲突。分组/对比的本地模拟结果不等于服务端实现。自动浏览器测试不等于所有视口的逐像素一致，也不能代替用户实际体验。设置历史不属于本批，不以缺口形式继续排期。

[返回本月验收](../README.md)
