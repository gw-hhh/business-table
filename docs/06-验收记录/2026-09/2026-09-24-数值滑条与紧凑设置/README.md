# 数值滑条与紧凑设置验收

## 范围与架构

日期：2026-09-24；development；基线 37e28ff。提交主题：`feat: add bounded sliders and compact settings layouts`。用户要求范围数值支持滑动调节，外观、工具栏、排序和操作按钮更紧凑。

SettingsRange 负责滑条、数字框、继承状态和范围提示；numericValidation 按稳定字段路径管理错误缓冲与恢复范围。合法值继续调用现有 Feature 写入守卫及草稿事务；非法值不写入配置，切换页签仍阻止应用。恢复文字不清除其他文字组或列的错误，恢复当前页／全部按可编辑范围清理。

## 修改文件

- 数值组件：[SettingsRange](../../../../src/features/settings/SettingsRange.vue)、[numericValidation](../../../../src/features/settings/numericValidation.ts)。
- 接入：[ColumnSettingsDrawer](../../../../src/components/ColumnSettingsDrawer.vue)、[AppearanceSettings](../../../../src/features/settings/AppearanceSettings.vue)、[ActionSettings](../../../../src/features/settings/ActionSettings.vue)、[ToolbarSettings](../../../../src/features/settings/ToolbarSettings.vue)、[ColumnRuleEditor](../../../../src/features/settings/ColumnRuleEditor.vue)。
- 布局：[列设置样式](../../../../src/components/column-settings.css)、[设置页样式](../../../../src/features/settings/settings-pages.css)、[SettingsSection](../../../../src/features/settings/SettingsSection.vue)。
- 测试：[列设置草稿](../../../../tests/column-settings.spec.ts)、[数值边界](../../../../tests/settings-range.spec.ts)、[事务挂载](../../../../tests/full-settings-ui.spec.ts)、[浏览器设置](../../../../tests/e2e/settings-refinement.spec.ts)、[文字样式](../../../../tests/e2e/text-style.spec.ts)、[视觉回归](../../../../tests/e2e/visual-parity.spec.ts)。
- 文档：AGENTS、README、CHANGELOG、开发规则、界面规范、当前状态、版本及验收索引和本批记录。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| 修改前回归 | 新用例在缺少字号滑条处失败，16 项既有设置测试通过 |
| 数值及设置单元测试 | 2 文件、22 项通过；覆盖非法／空／非整数输入、只读、继承、跨页事务和动态权限收窄 |
| 首轮 Chromium 开发浏览器回归 | 26 项通过，包含鼠标排序、字体应用、窄屏与两项新增数值／布局场景 |
| 人工浏览器 | 原 1040px 松散布局与新 920px 面板对照；默认文字／布局／备份同时可见；工具行压紧，列宽与字号滑条常显；390px 窄屏工具分行，固定／分隔标签已修正 |
| 恢复与会话浏览器复验 | 18 项设置回归通过；补齐关闭／备份／权限边界后，4 项新增场景再次通过 |
| 首轮完整门禁 | 541 项单元测试通过、1 项失败：旧字号测试仍查找 select；改为查找数字输入，保留原提交结果断言 |
| 最终完整门禁 | `npm run verify:release` 退出码 0；63 篇文档、portability、52 个 SFC、类型、68 文件／542 项单元测试、库／Demo 构建、235 文件包消费审计、151 项 Chromium 开发与生产预览全部通过，运行错误采集无报错 |

独立审查发现同值恢复不清理非法输入，已纳入按字段路径管理的数值会话修正，并追加跨页和分组恢复回归。权限收窄时清理不可编辑路径，恢复合法备份时清理可写页面的错误，关闭确认计入无效数值；独立复核确认原报告问题均已覆盖。挂载测试的新事务用例使用真实 Teleport，避免测试 stub 每次更新重挂子树而清空局部状态；浏览器验证使用真实页面。

本地忽略日志：compact-settings-red.log、compact-unit-final.log、compact-browser.log、compact-browser-final.log；首轮失败日志为 verify-compact-settings.log，最终通过日志为 verify-compact-settings-final.log。Playwright 截图和失败 trace 位于 test-results，按项目惯例重跑可能覆盖。数值／布局结果不替代真实后台或远端 CI。

## 交付与限制

按用户 2026-09-24 持续授权，完整验证后提交并推送 development；是否推送成功以远端提交核对为准，不自动合入 main。没有配置迁移，业务数据、Demo 状态、reference 文件不变。未对每页条数／行高等离散档位改为任意数值。

[版本说明](../../../04-版本记录/2026-09/2026-09-24-02-数值滑条与紧凑设置.md) · [返回月份索引](../README.md)
