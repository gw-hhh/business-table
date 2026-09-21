# 配置 Runtime 批次：本地验收

本批基于真实通过 Release Gate 的 main d06979f，在本地 feature/config-runtime 开发。按用户最新安排，本批未推送、未创建新PR、未修改远端分支。原基线修复PR #2和PR #3在该安排之前已合入。

## 实现与文件

| 内容 | 文件 |
|---|---|
| Schema、偏好迁移、差量、能力约束 | src/config/types.ts、schema.ts、columns.ts、diagnostics.ts |
| Gate、延迟生命周期、稳定注册表 | src/config/features.ts、src/runtime/feature.ts、registry.ts |
| 新入口与原组件接入 | src/ConfiguredBusinessTable.vue、BusinessTable.vue、core.ts、types.ts、index.ts |
| 独立可选UI | src/components/FeatureHost.vue、ColumnSettings.vue、TableSearch.vue、ViewSwitcher.vue、TableToolbar.vue、TableTitle.vue、RowActions.vue、CellRenderer.ts |
| 示例与兼容声明 | demo/ConfigExample.vue、App.vue、main.ts、src/style.css |
| 测试和门禁场景 | tests/config.spec.ts、features.spec.ts、registry.spec.ts、configured.spec.ts、feature-components.spec.ts、config-regressions.spec.ts、e2e/configuration.spec.ts；原测试与Provider fixture补显式Feature开关；playwright.config.ts |
| 规范与记录 | Master Handoff原文、项目上下文、迁移矩阵、实施计划、CONFIGURATION.md、README、CHANGELOG |

## 验证记录

所有新增行为先写失败断言再实现。新配置、Gate、Registry、组件接入及审查回归共增加82项Vitest；原有22项保留。新增5个浏览器场景分别运行于开发页和生产预览。

本次验收的最终命令为固定pnpm10.17.1的verify:release；冻结安装使用同一锁文件，未升级核心依赖版本。最终完整门禁退出码0：Vitest104/104、Playwright14/14。原始日志单独交付。

| 检查 | 最终结果 |
|---|---|
| main基线 | PASS：22 Vitest、4 Playwright、类型与构建、四类浏览器错误0 |
| feature frozen install | PASS，退出0 |
| feature portability/SFC/vue-tsc | PASS；11个SFC审计通过 |
| feature Vitest / build / Playwright | PASS；104/104 Vitest、声明/库/Demo构建、14/14 Playwright（开发8、生产预览6）；console.error/pageerror/window error/unhandledrejection均0 |
| 旧包完整性 | 145/145逐文件SHA-256一致，src/正式入口/产物无reference引用 |
| 独立审查 | 7项问题及冻结控件反馈已TDD修复；慢加载权限变化和视觉回归另有测试 |
| 远端CI | 本批未推送，因此未运行；不能把本地PASS写成GitHub CI PASS |

## 手动验收

运行Demo后打开 /?example=config。可从顶部切换默认设置、最简表格、自定义设置、无默认界面、后台关闭设置；首页保留原报价Demo。

1. 编号的显示和左冻结保持选中且不可修改；宽度可以调整。
2. 首次打开列设置前，详情读取次数为0；打开后为1，关闭重开不会重复初始化。
3. custom/headless 修改仍受列能力约束；不会加载默认列设置UI模块。
4. 损坏偏好仅显示诊断，数据仍可见。
5. 已确认记录的删除保持禁用；查看正常执行。
6. 390px下工具按钮仍为正常横排文字，列宽滑块可以拖动。

## 限制与下一批

本批完成P0配置入口与列设置闭环，未完成整份Master的所有功能。持久化当前采用乐观本地状态，错误有诊断；完整草稿、应用/取消、保存回滚和409冲突尚未实现。Search/View完整Headless、Toolbar布局、复杂筛选、导出、富文本、Selection及报价业务CRUD仍按矩阵继续。

旧平面API保留参数和schema1，但最简入口默认Core-only；原调用需显式开启search/toolbar/columnSettings。UMD保持单文件兼容；ESM支持真正网络分块。构建仍有既有UMD混合导出和包体积提示，不是浏览器运行错误。

下一批建议feature/settings-draft-layout：统一设置草稿、应用/取消、列名/排序/对齐编辑及完整抽屉交互。验收后再按feature → development → main推送和集成；不直接把feature写入main。
