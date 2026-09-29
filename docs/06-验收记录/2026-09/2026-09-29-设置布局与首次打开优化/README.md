# 设置布局与首次打开优化验收

## 环境与范围

2026-09-29，Windows，development；基线 02809e4。本批覆盖默认设置 UI、模板首次加载、配置权限、条件标记、视图状态和响应式布局。

## 验证结果

最终执行 `npm run verify:release`，退出码 0：文档审计 89 篇、可移植性检查、59 个 SFC 检查、TypeScript、83 个测试文件 / 651 项单元测试、库与 Demo 构建、301 个发布包文件及 10 个文档示例检查、产物分包审计全部通过；开发服务器与生产预览共 183 项浏览器测试全部通过（4.6 分钟）。

人工复核桌面和 390px 窄屏截图。独立代码审查及修复复核未留下 P1/P2 问题。构建仍有现有大文件体积提示，未超出项目分包审计门禁；这不等于所有设备的首次加载时间已达标。

- 意图预加载测试先红后绿：原实现移入不加载，两项失败；实现后 FeatureHost 三项通过。工具条意图/禁用/失败行为纳入回归。
- 首轮针对设置、模板、数据工具浏览器回归 62 通过，2 项新测试因列宽无障碍名称写错失败；定位为“列宽（px）”并修正，最终完整门禁通过。
- 桌面人工浏览器检查：列标题/状态/末尾折叠、工具通用设置、操作列表、条件标记。

## 审查与修复

独立代码审查发现并复现两项 P2，均已修复并复核：首次模块加载期间的连续入口点击丢失后续目标；浏览器缓存失败 ESM URL 导致相同 URL 的“重试”无效。前者改为每个表格实例的响应式单一打开目标，并约束失效上下文的写入；后者明确提示退出模板、保存其他设置后刷新，避免自动刷新丢草稿。

并发用例先红后绿，真实 abort → 关闭模板 → 应用其他设置 → 刷新 → 重开编辑器恢复通过。网络失败用例只允许目标 RichEditor 请求的一条预期 net::ERR_FAILED，仍检查其他 console.error 与 pageerror。首次完整门禁发现一条旧单测仍使用已删除的单按钮折叠名称，改为“按钮及顺序”，19 项设置 UI 单测复验通过。

窄屏视觉检查发现共享筛选编辑器的样式依附 FilterFeature，直接打开条件标记时值容器是 block、选项样式缺失。新增 CSS 断言先失败；将基础样式归入 FilterRuleEditor/FilterOptions 自身的 `filter-editor.css`，复验通过，其他筛选页使用同一份样式。此问题不靠页面特例或访问顺序规避。

前一轮完整门禁单元 651 通过、浏览器 182 通过 / 1 失败：拖动列宽测试取得坐标后未命中尚在调整布局的手柄，单独复验通过。测试改为先确认表头填满、使用等待元素稳定的 hover 再读取坐标，保留原拖动及宽度断言；最终完整重跑 183 项浏览器测试全部通过。

## 修改文件

- 加载与公共契约：`src/ui/moduleLoader.ts`、`src/components/FeatureHost.vue`、`src/BusinessTable.vue`、`src/ConfiguredBusinessTable.vue`、`src/components/DataToolsHost.vue`、`src/features/data-tools.ts`、`src/features/presentation/model.ts`、`src/features/toolbar/{preloadTool.ts,ToolStrip.vue,ToolMenu.vue}`。
- 设置会话和布局：`src/components/{ColumnSettings.vue,ColumnSettingsDrawer.vue,column-settings.css}`、`src/features/settings/{ActionSettings.vue,AppearanceSettings.vue,ColumnRuleEditor.vue,SettingsRange.vue,SettingsSection.vue,ToolbarSettings.vue,settings-pages.css}`。
- 共享筛选样式：`src/features/filters/{FilterRuleEditor.vue,FilterOptions.vue,filter-editor.css,filters.css}`。
- 标记和视图：`src/features/conditional-formatting/{ConditionalFormattingFeature.vue,conditional-formatting.css}`、`src/components/TableSurface.vue`、`src/features/views/ViewsPanel.vue`；`demo/App.vue` 只接入口回调和去除重复状态，`demo/quotation.css` 删除废弃样式。
- 验证：`tests/feature-intent.spec.ts`、`tests/toolbar-menu.spec.ts`、`tests/full-settings-ui.spec.ts` 和六份相关 E2E 测试。
- 文档：README、CHANGELOG、当前状态、后续路线图、排查说明、界面规范、配置字段手册、编辑器说明、版本/计划/验收及其索引。

## 证据

[列设置桌面](列设置-桌面.png)、[工具栏桌面](工具栏-桌面.png)、[操作按钮桌面](操作按钮-桌面.png)、[条件标记桌面](条件标记-桌面.png)、[操作按钮窄屏](操作按钮-窄屏.png)、[条件标记窄屏](条件标记-窄屏.png)。窄屏证据来自最终生产预览回归；截图来自本地演示环境，不含真实业务后台数据，随本版本记录保留。

[完整门禁日志](release-gate.txt)保留最终运行输出，仅去除终端颜色控制符、行尾空白并将本机工作区路径替换为 `<workspace>`。测试运行目录为临时产物。

## 限制

预加载只提前传输/解析代码，不能保证所有设备上首次点击零延迟；触屏快速点击和慢网络仍可能等待。真实输入法、生产网络和后台未在本批验收。未发布 npm、未合并 main。

[版本记录](../../../04-版本记录/2026-09/2026-09-29-03-设置布局与首次打开优化.md) · [返回月份索引](../README.md)
