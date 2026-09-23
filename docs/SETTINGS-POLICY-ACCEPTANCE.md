# 设置显示、只读与工具栏接入验收

日期：2026-09-23。分支：`feature/visual-parity-refinement`。

## 本批需求与原因

未配置的设置页、列模块和字段控件不显示；显式开启时可编辑，只有显式 `disabled: true` 才显示只读。报价 Demo 和默认配置示例显式开启全部已实现设置。

此前有三处设计缺口：设置 UI 固定列出模块；Demo 工具没有接入真实工具声明与布局；Runtime 将分页参数变动与整份配置替换放在同一个监听器，父组件重新生成分页数组后会覆盖已保存设置。

## 架构调整

- Config：增加统一 `ControlConfig` 三态解析。设置页、列模块和列能力取交集；远端声明只能收窄本地开放范围。
- Settings Feature：快捷面板、完整抽屉和规则编辑器共享策略。只读控件可见但不可修改；未声明的控件、空工具区域和空操作页隐藏。
- Runtime：默认、Custom、Headless、显式设置声明下的直接列写入共用守卫。串行保存开始执行时重新校验整笔设置，关闭功能不能使已取得的命令恢复修改能力。
- Persistence：读取历史合法值与接受新修改分开处理。设为只读后保留已有值和已保存顺序；移动其他列不能挤走只读列。只编辑工具栏时不把当前 View 的只读外观写入个人偏好。
- Toolbar Feature：真实工具与设置列表共享可用性判断。名称、顺序、位置、展示形式、分隔和间距作用到真实按钮；用户隐藏的工具仍可从设置恢复。700px 及以下视口将非固定直接项放入“更多”，固定项保持显示，布局投影不修改保存值。
- Runtime：分页监听按实际值变化更新分页；整份配置替换使用独立监听，分页参数变化不再清空列和外观设置。
- Demo：只声明数据、字段、动作与启用配置；没有增加报价专属 Runtime 分支。默认配置示例另提供 `readonly` 和 `unconfigured` 状态。

## 验证范围

覆盖缺省隐藏、显式只读、模块与字段交集、远端收窄、动态关闭、保存队列权限变化、View 与个人偏好分离、只读值恢复、只读顺序锚点、分页参数重建、实际工具保存后刷新恢复、窄屏固定与更多菜单、键盘交互。

复查中修复了只读列顺序被邻列挤走、排队设置在权限收窄后仍落盘，以及“更多”内排序对话框的 Escape／Tab 被外层提前处理的问题，均有先失败后通过的回归证据。一项列筛选浏览器测试曾因动作列懒加载造成表头位移、悬浮坐标失效而超时；改为使用已有 focus-within 支持，先聚焦控件再正常点击，未强制点击或延长超时。对应开发／预览用例各重复三次通过。

最终 `corepack pnpm verify:release` 退出码为 0：

| 检查 | 结果 |
|---|---|
| Portability／SFC audit／类型检查 | PASS |
| Vitest | 39 个文件，345/345 PASS |
| 组件库、声明文件、Demo 构建 | PASS |
| 独立 TypeScript 消费方与包内容审计 | PASS，123 个打包文件 |
| Playwright Chromium 开发版与生产预览 | 85/85 PASS |
| console.error／pageerror／window error／unhandledrejection | 0／0／0／0 |
| Git 差异空白检查 | PASS |

完整执行日志保存在本地 `delivery-gate.log`（忽略文件，不提交）。检查了 390px 主页面及 320px／768px 设置抽屉截图。构建仍有 Demo 包体积提示，不影响以上检查；本批没有新增依赖。

## 兼容性与剩余范围

- 已有接入方需要补 `settingsDefinition` 或 `definition.settings` 和相关列能力；`false` 表示隐藏，要显示只读应改为 `{enabled: true, disabled: true}`。
- 未声明设置的旧平面 Core 程序化列修改保留兼容；显式声明设置后，直接 Runtime 写入也受对应策略约束。
- 当前“试算”是列显示／导出规则预览；BT-08 计算字段和公式引擎仍未实现。完整 View Runtime 仍为下一项 BT-02。
- 已执行自动化浏览器验证；最终使用体验仍待用户本地查看。本批不代表 Legacy 全量功能与像素验收完成。
- 本批本地提交，未推送 GitHub；未修改 `main`、`development` 或依赖版本。

## 修改文件

以下路径相对仓库根目录，共 51 个文件：

```text
demo/App.vue
demo/ConfigExample.vue
demo/quotation/model.ts
docs/CODEX-CURRENT-STATE.md
docs/CODEX-NEXT-STEPS-HANDOFF.md
docs/CONFIGURATION.md
docs/SETTINGS-POLICY-ACCEPTANCE.md
docs/USAGE.md
playwright.config.ts
README.md
src/BusinessTable.vue
src/components/ColumnSettings.vue
src/components/ColumnSettingsDrawer.vue
src/components/settingsTypes.ts
src/components/TableToolbar.vue
src/config/access.ts
src/config/columns.ts
src/config/schema.ts
src/config/types.ts
src/ConfiguredBusinessTable.vue
src/features/presentation/model.ts
src/features/settings/ActionSettings.vue
src/features/settings/ColumnRuleEditor.vue
src/features/settings/policy.ts
src/features/settings/settings-pages.css
src/features/settings/ToolbarSettings.vue
src/features/toolbar/ToolStrip.vue
src/index.ts
src/runtime/useTableRuntime.ts
tests/column-settings.spec.ts
tests/config-regressions.spec.ts
tests/config.spec.ts
tests/configured.spec.ts
tests/delivery-reliability.spec.ts
tests/e2e/configuration.spec.ts
tests/e2e/filter-migration.spec.ts
tests/e2e/reference-refinement.spec.ts
tests/e2e/toolbar-settings.spec.ts
tests/e2e/visual-parity.spec.ts
tests/feature-components.spec.ts
tests/fixtures/settings.ts
tests/full-presentation.spec.ts
tests/full-runtime.spec.ts
tests/full-settings-ui.spec.ts
tests/mount.spec.ts
tests/presentation.spec.ts
tests/quotation-layout.spec.ts
tests/settings-policy.spec.ts
tests/settings-refinement.spec.ts
tests/settings-runtime-policy.spec.ts
tests/toolbar-runtime.spec.ts
```
