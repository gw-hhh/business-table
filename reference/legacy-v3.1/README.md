# Legacy v3.1 reference

本目录用于保存旧版 **报价管理 3.1.0 · 体验精修版**，作为 BusinessTable Vue 重构的产品、UI、交互与功能完整性基准。

## 定位

旧版不是生产依赖，也不是要求继续维护的技术栈。

- 旧版决定：原产品有哪些能力、布局如何组织、交互如何表达、哪些细节已经被确认。
- 新版 `src/` 决定：这些能力在 Vue 3 + TypeScript + 配置驱动架构下如何正确实现。
- `docs/CODEX-PROJECT-CONTEXT.md` 决定：长期架构、测试、Git 和 Release Gate 规则。

禁止从正式 `src/` import 本目录代码；本目录不得参与正式 library build。

## 已确认的旧版基线

上传来源：用户提供的 `quotation-manager-v3.1` 完整项目。

旧版 README 明确标识版本为 **3.1.0**，并说明是在用户已确认的 3.0 完整源码基础上继续精修，而不是早期原型。

重点参考：

- 蓝色主题、原生 JS/CSS、无 CDN/在线字体依赖
- 36px 常规控件、14px 正文、12–13px 辅助文字
- 表头约 44px、默认双行记录约 60px
- compact/default/comfortable 三档密度
- 左右冻结两个图标，禁止改为下拉选择
- 设置抽屉、未应用修改摘要、草稿校验、定位错误
- 工具栏配置、行操作和 More 二级菜单
- Value Mapping、数字格式、条件规则、显示模板
- 当前对象预览与整表预览
- 富文本编辑
- 命名视图
- 分组、记录对比、条件标记、区域选择
- CSV/XLSX、导出预览/方案、模板、JSON 备份恢复

## Codex 阅读顺序

1. `docs/CODEX-PROJECT-CONTEXT.md`
2. `docs/LEGACY-MIGRATION.md`
3. 本目录旧版 README / DESIGN / DESIGN-TOKENS / TEST-REPORT
4. `src/` 旧实现，理解行为，不机械翻译
5. 新版 `src/` 与 tests，按 TDD 分批迁移

任何迁移都必须保持 main 可运行，并通过完整 Release Gate。

## 原包目录与完整性

原包 `quotation-refactor-v3.1.zip` 已完整解压，保留顶层目录：

`quotation-manager-v3.1/`（145 个文件，所有源码、样式、文档、日志、测试、截图和 XLSX 均保留）。

原始项目说明位于 [quotation-manager-v3.1/README.md](quotation-manager-v3.1/README.md)。本文件是仓库的参考目录说明，没有替换原始 README。

原包 SHA-256：`ad0b1d616b841d755e4f10cf43a796e4dbf70bf5aa7fd3253b6dd5a9433c8858`；逐文件字节数和 SHA-256 见 [ARCHIVE-MANIFEST.json](ARCHIVE-MANIFEST.json)。原包子目录保持只读参考；分析和新测试产物放在其外，禁止通过重新构建覆盖旧单文件。Git 对此子目录禁用换行转换，避免 Windows checkout 改写原始字节。
