# 组合筛选与查询摘要对齐验收

## 范围与分工

本批依据用户确认，只处理组合筛选及独立方案、查询摘要和 View 联动。旧版参照为 reference/legacy-v3.1/quotation-manager-v3.1/index.html；不修改或导入旧版运行代码。实施见[计划](../../../05-实施计划/2026-09/2026-09-23-组合筛选对齐计划.md)，接口与兼容见[版本说明](../../../04-版本记录/2026-09/2026-09-23-06-组合筛选与查询摘要对齐.md)。

- Query/Search Runtime：原子清除，单项移除保留别项草稿。
- Filters Context/Plans/FeatureHost：共享方案、字段能力检查、失败隔离与生命周期。
- Filters UI：条件编辑、独立方案窗口、原值标签与抽屉布局。
- Toolbar/Popup/SettingsPreview：声明式子菜单、动态可用性、键盘和预览隔离。
- Demo：仅接入工具声明与平台统一摘要；未增加通用查询状态。

## 实际浏览器对照

在相同 1280×720 视口操作旧版和 Vue：金额大于等于 200000 且状态为草稿得到 1 条（Q20260914-0181），改为 OR 得到 5 条。检查取消后不应用、重新打开保持已应用条件、摘要单项清除与全部清除、方案载入草稿、View 保存重载恢复。

旧版抽屉宽 580px、body 左右内边距 22px、空态上下内边距 60px，默认抽屉与条件卡按这些实测值调整。E2E 在相同视口对照数据工具菜单宽度，以及空态、组合方式、添加按钮、首个条件卡、摘要和条件标签的位置与尺寸，容差不超过 1 CSS 像素。窄屏、嵌套 Escape 和回焦由 E2E 覆盖。独立方案窗口和嵌套组是平台增强，旧版无对应界面。

## 验证记录

- 先运行新增失败用例，确认原始缺口：无 Context 方案接口、无 clearQuery/remove、分离摘要、同字段组标签缺失、无工具子菜单。实施后逐项回归。
- 类型检查通过。
- 筛选 E2E 共 12 个场景，在开发服务器和构建后预览各通过一次，包括旧版几何对照、报价菜单、方案 CRUD、三层 View、全清除与既有窄屏/日期/Feature OFF。
- 最终 `npm run verify:release` 退出码 0：58 个测试文件、465 项单元测试通过；119 项 Chromium 浏览器测试通过，覆盖开发与构建后预览，运行错误采集检查通过。
- 文档审计通过：55 篇 Markdown 的目录、链接、锚点与索引有效；可移植性、43 个 SFC 语法、类型检查、库与 Demo 构建通过；发布包 195 个文件及独立 TypeScript 消费者检查通过。
- 首轮发布包独立消费者检查发现 QuerySummary 的自动展开类型引用 GlobalComponents 约束不兼容。现以 SFC 原始类型保留完整 props／slot 契约，未改宽泛类型或跳过检查；独立消费者同时验证 QuerySummary、SearchSummary、querySummary 属性、Context 方案和工具子菜单声明，复验通过。
- 独立审查发现多级菜单 Tab／ShiftTab 退出遗漏，包括全禁用子菜单获得根节点焦点的路径；均补红绿回归并修正，Escape 仍逐级返回。最终只读复核确认该问题已关闭。
- 全量单元回归曾出现异步组件首次编译与并发负载造成的超时；统一将测试并发限制为最多 4 个工作进程，摘要单测按既有模式预加载异步组件，不修改断言或超时标准。后续 465 项单测通过。
- 全量浏览器回归发现统一摘要遗漏原有 44px 最小高度，已恢复；原值标签与旧版组合条件几何对照的定向用例均通过。

测试过程中一次误用类型检查命令产生了 176 个旁置 JS。按生成时间、同名源码和未跟踪状态核对后清理，源码与 reference 保留；重新运行使用无输出的项目类型检查。最终验证不使用这些中间生成物。

## 修改文件

主要源码位于 src/runtime/query.ts、useTableRuntime.ts、features/filters、features/toolbar、features/presentation/model.ts、features/settings/SettingsPreview.vue、components/QuerySummary.vue、SearchSummary.vue、FeatureHost.vue、ui/DialogFrame.vue、AnchoredPopup.vue、popupScope.ts，表格入口与 demo/App.vue 完成接入。新增／扩展测试位于 tests/query-filter-runtime.spec.ts、query-summary.spec.ts、toolbar-menu.spec.ts、filter-feature.spec.ts、filter-summary.spec.ts、e2e/filter-migration.spec.ts。完整清单以本批 Git 提交为准。

### 源码与验证脚本清单

- [demo/App.vue](../../../../demo/App.vue)
- [scripts/package-audit.mjs](../../../../scripts/package-audit.mjs)
- [src/BusinessTable.vue](../../../../src/BusinessTable.vue)
- [src/ConfiguredBusinessTable.vue](../../../../src/ConfiguredBusinessTable.vue)
- [src/components/FeatureHost.vue](../../../../src/components/FeatureHost.vue)
- [src/components/QuerySummary.vue](../../../../src/components/QuerySummary.vue)
- [src/components/SearchSummary.vue](../../../../src/components/SearchSummary.vue)
- [src/features/filters/FilterChips.vue](../../../../src/features/filters/FilterChips.vue)
- [src/features/filters/FilterFeature.vue](../../../../src/features/filters/FilterFeature.vue)
- [src/features/filters/FilterRuleEditor.vue](../../../../src/features/filters/FilterRuleEditor.vue)
- [src/features/filters/context.ts](../../../../src/features/filters/context.ts)
- [src/features/filters/filters.css](../../../../src/features/filters/filters.css)
- [src/features/filters/model.ts](../../../../src/features/filters/model.ts)
- [src/features/filters/plans.ts](../../../../src/features/filters/plans.ts)
- [src/features/filters/summary.ts](../../../../src/features/filters/summary.ts)
- [src/features/presentation/model.ts](../../../../src/features/presentation/model.ts)
- [src/features/settings/SettingsPreview.vue](../../../../src/features/settings/SettingsPreview.vue)
- [src/features/toolbar/ToolMenu.vue](../../../../src/features/toolbar/ToolMenu.vue)
- [src/features/toolbar/ToolStrip.vue](../../../../src/features/toolbar/ToolStrip.vue)
- [src/index.ts](../../../../src/index.ts)
- [src/runtime/query.ts](../../../../src/runtime/query.ts)
- [src/runtime/useTableRuntime.ts](../../../../src/runtime/useTableRuntime.ts)
- [src/ui/AnchoredPopup.vue](../../../../src/ui/AnchoredPopup.vue)
- [src/ui/DialogFrame.vue](../../../../src/ui/DialogFrame.vue)
- [src/ui/popupScope.ts](../../../../src/ui/popupScope.ts)
- [tests/e2e/filter-migration.spec.ts](../../../../tests/e2e/filter-migration.spec.ts)
- [tests/filter-feature.spec.ts](../../../../tests/filter-feature.spec.ts)
- [tests/filter-summary.spec.ts](../../../../tests/filter-summary.spec.ts)
- [tests/query-filter-runtime.spec.ts](../../../../tests/query-filter-runtime.spec.ts)
- [tests/query-summary.spec.ts](../../../../tests/query-summary.spec.ts)
- [tests/toolbar-menu.spec.ts](../../../../tests/toolbar-menu.spec.ts)
- [vitest.config.ts](../../../../vitest.config.ts)

## 提交与交付

本批提交到本地 development，提交说明为 `feat: align combined filters plans and query summaries`。具体提交号以该说明对应的 Git 记录为准；本轮未推送远端、未修改 main，旧版 reference 无变更。README、接入与配置说明、当前状态、路线图、报价模块、计划、版本、验收及各级索引均同步更新。

## 保留边界

- 不将 Chromium 自动化与人工抽查等同于所有浏览器逐像素验收。
- 真实后端的嵌套组查询、原值类型、远端选项全集、并发权限和跨客户端存储冲突尚未接入。
- 筛选方案保存不包含基础搜索；View 保存完整三层查询。clearQuery 的默认值策略可能留下配置默认条件，这是 resetBehavior 的既有语义。
- 条件标记、分组汇总、记录对比、区域选择和设置历史未实现，本批不显示这些入口。

[返回本月验收](../README.md)
