> 历史记录：此文件为 3.0 或更早的基线记录。3.1 的范围与自检见 `polish/PLAN.md`、`polish/REVIEW.md`，默认设计值见 `DESIGN-TOKENS.md`，最终验证见 `TEST-REPORT.md`。

> 历史：2.0.0阶段记录。3.0.0以 README、incremental/PLAN.md 和 TEST-REPORT.md 为准。

# 表格自定义 Implementation Plan

Goal: 在 1.0.1 基线补齐本次已批准的设置、操作编排与导出。
Architecture: 纯配置模型与数据查询 / DOM 呈现 / 导出适配器分离。核心字段和数据仓库保持稳定。
Tech Stack: 原生 JavaScript、CSS、原生 OOXML/ZIP 写出器；Node test、Playwright Chromium。
Spec: docs/DESIGN.md

## 约束
无需构建可打开单文件；不依赖运行时外网；左右冻结图标保留；UI 文案简短直接；不改造为框架工程。

## 测试重点
旧配置迁移、重复列名、恶意配置、空值/零金额排序、菜单窄列与可访问性、取消不落盘、视图还原、真实下载与 XLSX 内容。

## 任务
- [x] 1. 配置模型：src/customization.js；核心接口 normalizeColumns/normalizeSorts/normalizeAppearance/normalizeActions/formatValue/validateSettings。
  先运行 tests/customization.test.cjs 的新增失败用例，再接入 core.js；运行 npm test。
- [x] 2. 菜单与表格：src/menus.js、src/actions.js、src/table.js；头部菜单、累计冻结偏移、显示样式、序号、操作溢出。
  浏览器新用例先验证设置入口缺失，再验证菜单行为和窄列。
- [x] 3. 完整设置：src/settings.js、src/custom.css；四页编辑/局部预览/草稿应用、批量样式、设置备份恢复。
  测试取消、重复名、排序禁用、多字段、显示/分组/子菜单。
- [x] 4. 导出：src/export-data.js、src/export-dialog.js；Excel/CSV、固定模板、方案。
  tests/export.test.cjs 校验字段/类型/公式安全/模板字段独立性/格式/金额合计，下载文件再用 ZIP/XML 检查。
- [x] 5. 集成：src/app.js、index.html、build.cjs；配置迁移、持久化、视图快照、快捷入口。
  更新因批准的 UI 改动而变化的旧测试定位，保留业务断言，跑完整套件。
- [x] 6. 交付：构建一致性、实际截图、README、CHANGELOG、测试报告、源码压缩包。
  所有通过声明基于本次新测试结果，不沿用历史计数。真实浏览器产品/手机真机等未测部分明确列出。
