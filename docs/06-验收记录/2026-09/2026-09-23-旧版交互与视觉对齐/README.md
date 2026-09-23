# Legacy 交互与视觉对齐验收

> 历史记录：保留本批发生时的结果、分支和限制，不作为当前开发规则。2026-09-23 归档时仅调整文档路径；当前状态与分支流程请从[文档导航](../../../README.md)阅读。

日期：2026-09-23。分支：`feature/visual-parity-refinement`。

## 范围

基准为 `reference/legacy-v3.1/quotation-manager-v3.1/index.html` 的实际页面。旧项目仅作参考，Vue 页面没有加载旧 JS、iframe 或旧 DOM。

按用户要求，本轮暂缓“数据工具”菜单及其组合筛选、条件标记、分组汇总、记录对比、区域选择、设置历史等高级入口。普通列筛选、完整表格设置中的工具栏配置仍在范围内；配置示例保留已有组合筛选实现的回归覆盖。

## 本轮调整

| 范围 | 实现及验证重点 |
|---|---|
| 首屏 | 全部六条、原始顺序、默认行高、每页十条、查询收起、选择关闭；主要字号、颜色和间距与旧版对照 |
| 表格 | 通用 ColumnHeader 菜单、重命名、排序、筛选、冻结、拖动与键盘调宽；容器余量分配、固定边、纵向表头和横向滚动 |
| 查询 | 草稿与已应用值分离；单选预设、摘要移除/重置、显示值与实际值分离；远程选项按已选值找回标签，来源切换取消旧响应 |
| 视图 | 通用 Views Runtime/ViewsPanel 创建、更新、重命名、默认、重排、删除；保存失败不发布新状态，系统视图保留个人布局 |
| 设置 | 五个设置页、列模块、当前对象/整表预览、数值快捷规则、即时试算、映射与工具布局真正作用于主表；预览不调用业务 handler |
| 记录操作 | 详情、新增、修改、复制使用右侧抽屉；字段校验、取消脏数据确认、保存快捷键；写入失败保留表单，跨页面数据变更提醒及版本检查 |
| 选择 | 当前页全选/半选、完整查询选择、查询变化清理；批量操作栏替换标题，合计对应所选记录 |
| 导出 | Excel/CSV、范围、字段/顺序、方案、显示/原值、合计/说明、预览；固定字段模板及示例工作表 |
| 键盘与动画 | 弹窗焦点返回、嵌套 Escape、菜单导航、/ 定位查询、抽屉与弹窗入场、减少动画偏好 |

## 架构

- UI 状态和命令沉淀到 `features/views`、`features/export`、`features/columns`、`features/presentation`、`features/search`；Demo 提供报价字段、数据适配器和业务动作。
- `Runtime.readRows/selectQuery` 负责查询范围读取及选择竞态；`presentation/columnLayout` 只计算渲染宽度，不污染已保存列宽。
- 搜索选项 `{value: 1, label: 'A'}` 始终传数字 1；摘要通过 `displayValue` 显示 A。数字筛选的缩放因子随条件保存，避免切换显示单位后改变查询含义。
- 设置三态维持统一策略：未声明/关闭隐藏，声明开启可编辑，显式 `disabled` 才只读；默认、自定义和 Headless 共用写入守卫。
- 报价本地仓储独立于 App；先完成持久化再发布行数据。Excel writer 按需加载，模板与导出共用结构化工作簿模型。

## 验证记录

2026-09-23 完整执行 `npm run verify:release`，退出码 0：

| 检查 | 结果 |
|---|---|
| 可移植性与 SFC 语法检查 | 通过，41 个 Vue SFC |
| TypeScript 类型检查 | 通过 |
| Vitest | 54 个文件，421 项通过 |
| 组件库、类型声明与 Demo 构建 | 全部通过 |
| 发布包检查 | 161 个文件，入口和独立 TypeScript 消费方验证通过 |
| Playwright | 113 项通过，覆盖开发服务和构建预览 |
| 浏览器运行错误 | 0；捕获 pageerror、console.error、window.error、unhandledrejection |

独立浏览器已实际操作旧版与 Vue 的主表、普通筛选、快速列设置、完整设置、视图、记录抽屉、导出与模板弹窗。最后一次门禁日志位于本地忽略目录 `.vite/legacy-parity-release-final.log`，不会进入发布包。

对照包括 320/390 窄屏、1280 主表，以及 1440/1920 宽屏的逐列布局；设置预览、普通状态筛选尺寸、字体放大后的文本裁切均有针对性断言。Excel 文件除浏览器下载验证外，还用独立读取器检查文本编号、数值、日期、冻结行和列表校验。

## 边界与风险

- 本轮未实现暂缓的数据工具，也不把已有列显示“试算”称为计算字段/公式引擎。
- 服务端权限、数据库查询和视图版本冲突需要真实后台适配器；本轮验证的是通用接口和本地 Demo。
- 远程选项服务没有返回已选值标签时，摘要回退实际值；不会把显示文字替换进查询值。
- 本地仓储的快照冲突检查不能代替服务端原子并发控制；业务正式上线需后台版本比较。
- 浏览器原生滚动条及系统字体的渲染存在环境差异。已执行的对照场景不等于所有浏览器和所有配置组合的逐像素证明，最终外观仍需用户在其环境体验验收。
- 现有浏览器保存的个人设置和默认视图保留；新默认配置不自动抹除用户偏好。

## 独立审查

审查覆盖 App 接线、查询/筛选摘要、列头、选择、视图、工具条测量、抽屉仓储、设置预览与弹层生命周期。已修复 Provider 切换摘要过期、保存失败错误发布、视图漏检外观/分页/折叠、异步视图激活竞态，以及布局越过 Feature 延迟加载边界；对应回归保留。最终审查无未处理的重要问题。

## 提交与推送

本轮先在当前 feature 分支完成本地提交，不推送、不合并 main/development。提交号以本轮最终回复与 Git 记录为准。README、配置说明、使用说明及当前/下一步交接随代码同步更新。

## 修改文件

### 平台实现

- `src/BusinessTable.vue`
- `src/components/BusinessCell.vue`
- `src/components/ColumnSettingsDrawer.vue`
- `src/components/FeatureHost.vue`
- `src/components/RowActions.vue`
- `src/components/SearchSummary.vue`
- `src/components/column-settings.css`
- `src/config/features.ts`
- `src/config/font-families.ts`
- `src/config/schema.ts`
- `src/features/columns/ColumnHeader.vue`
- `src/features/columns/evaluate.ts`
- `src/features/columns/header.ts`
- `src/features/columns/schema.ts`
- `src/features/export/ExportDialog.vue`
- `src/features/export/TemplateDownloadDialog.vue`
- `src/features/export/model.ts`
- `src/features/export/template.ts`
- `src/features/export/xlsx.ts`
- `src/features/filters/FilterChips.vue`
- `src/features/filters/FilterFeature.vue`
- `src/features/filters/FilterOptions.vue`
- `src/features/filters/FilterRuleEditor.vue`
- `src/features/filters/context.ts`
- `src/features/filters/filters.css`
- `src/features/filters/model.ts`
- `src/features/filters/options.ts`
- `src/features/filters/summary.ts`
- `src/features/presentation/DensityMenu.vue`
- `src/features/presentation/useTableControls.ts`
- `src/features/search/model.ts`
- `src/features/search/shortcut.ts`
- `src/features/settings/ActionSettings.vue`
- `src/features/settings/AppearanceSettings.vue`
- `src/features/settings/ColumnRuleEditor.vue`
- `src/features/settings/SettingsPreview.vue`
- `src/features/settings/ToolbarSettings.vue`
- `src/features/settings/settings-pages.css`
- `src/features/toolbar/ToolStrip.vue`
- `src/features/views/ViewsPanel.vue`
- `src/features/views/runtime.ts`
- `src/index.ts`
- `src/presentation/columnLayout.ts`
- `src/presentation/narrow-table.css`
- `src/presentation/useTableViewport.ts`
- `src/runtime/query.ts`
- `src/runtime/useTableRuntime.ts`
- `src/style.css`
- `src/types.ts`
- `src/ui/AnchoredPopup.vue`
- `src/ui/DialogFrame.vue`
- `src/ui/popupScope.ts`
- `src/ui/useOverlay.ts`

### 业务 Demo

- `demo/App.vue`
- `demo/quotation.css`
- `demo/quotation/QuotationDialog.vue`
- `demo/quotation/QuotationRecordDialog.vue`
- `demo/quotation/model.ts`
- `demo/quotation/repository.ts`

### 验证

- `playwright.config.ts`
- `tests/column-header.spec.ts`
- `tests/configured.spec.ts`
- `tests/e2e/configuration.spec.ts`
- `tests/e2e/demo.spec.ts`
- `tests/e2e/filter-migration.spec.ts`
- `tests/e2e/legacy-workflows.spec.ts`
- `tests/e2e/narrow-columns.spec.ts`
- `tests/e2e/reference-refinement.spec.ts`
- `tests/e2e/search-runtime.spec.ts`
- `tests/e2e/settings-refinement.spec.ts`
- `tests/e2e/table-layout-parity.spec.ts`
- `tests/e2e/text-style.spec.ts`
- `tests/e2e/toolbar-settings.spec.ts`
- `tests/e2e/visual-parity.spec.ts`
- `tests/export-dialog.spec.ts`
- `tests/export-feature.spec.ts`
- `tests/feature-components.spec.ts`
- `tests/features.spec.ts`
- `tests/filter-engine-migration.spec.ts`
- `tests/filter-options-parity.spec.ts`
- `tests/filter-summary.spec.ts`
- `tests/filter-units.spec.ts`
- `tests/full-settings-ui.spec.ts`
- `tests/full-views.spec.ts`
- `tests/narrow-columns.spec.ts`
- `tests/query-selection.spec.ts`
- `tests/quotation-dialog.spec.ts`
- `tests/quotation-layout.spec.ts`
- `tests/quotation-menu.spec.ts`
- `tests/quotation-model.spec.ts`
- `tests/quotation-record-dialog.spec.ts`
- `tests/quotation-repository.spec.ts`
- `tests/search-model.spec.ts`
- `tests/search-runtime.spec.ts`
- `tests/search-summary.spec.ts`
- `tests/settings-parity.spec.ts`
- `tests/table-controls.spec.ts`
- `tests/table-layout.spec.ts`
- `tests/table-viewport.spec.ts`
- `tests/toolbar-runtime.spec.ts`
- `tests/views-panel.spec.ts`

### 文档

- `README.md`
- `docs/01-项目入门/03-当前状态.md`
- `docs/01-项目入门/04-后续路线图.md`
- `docs/02-架构与规范/03-配置与能力规范.md`
- `docs/06-验收记录/2026-09/2026-09-23-旧版交互与视觉对齐/README.md`
- `docs/07-参考与归档/01-旧版迁移历史.md`
- `docs/01-项目入门/02-本地运行与接入.md`
- `docs/05-实施计划/2026-09/2026-09-23-旧版交互对齐计划.md`
