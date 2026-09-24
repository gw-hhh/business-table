# 设置分层与拖动反馈验收

## 范围与结论

日期：2026-09-24；工作分支 development；基线 3a9810b。提交主题：`fix: refine settings scrolling disclosure and drag feedback`，提交号以 Git 记录为准。本批本地验证，不自动推送或发布。

用户要求列编辑标题和模块导航固定、各级设置可展开／收起、现有拖动位置显示蓝色插入线。参照用户提供的快捷列面板截图与旧版设置交互。设置历史不纳入。

## 架构与实现

- 设置 Feature：固定标题与滚动表单分离，避免 sticky 负偏移引起位移。导航展开并定位目标，颜色错误定位展开相应样式；Tab 焦点循环排除隐藏输入。
- SettingsSection：统一各模块和分组折叠，保留表单挂载与草稿；折叠按钮与只读表单分离。
- useDragReorder：以稳定 ID 计算前／后插位置，显示提示后松开才调用各 Feature 的原有移动方法。空操作、取消、离开、外部拖动、不可移动项均不提交；两组工具分别管理拖动会话。
- Demo、Config、Runtime、Persistence 不新增状态或格式；原权限、应用／取消与失败流程继续使用。

## 实际检查

| 检查 | 结果 |
| --- | --- |
| 修改前回归用例 | 3 项按预期失败：顶部位移、无基本折叠入口、无插入线 |
| 设置相关单元测试 | 4 文件、50 项通过 |
| 拖动边界单元测试 | 6 项通过：前后插、空操作、取消、权限变化／删除源、跨列表、锁定槽边缘 |
| Chromium 开发设置测试 | 15 项通过，含真实鼠标拖动、落点、草稿隔离和折叠导航 |
| 人工浏览器检查 | 本地页面复现旧标题 y=162→154；修改后 y=154 固定，内容滚动到 1757 时不变；390px 窄屏页面无横向溢出，标题和内容独立 |
| 首轮完整发布门禁 | 536 项单元测试通过；浏览器 139 通过、4 失败，均为新增折叠按钮改变标题识别名称；保留原标题名称后复验 |
| 最终完整发布门禁 | `npm run verify:release` 退出码 0；61 篇文档、portability、51 个 SFC、类型、67 文件／536 项单元测试、库／Demo 构建、231 文件独立包消费审计、143 项 Chromium 开发与生产预览全部通过；运行错误采集无报错 |

运行日志保存在本地忽略目录中的 `settings-red.log`、`settings-unit.log`、`settings-browser.log`、`verify-settings-interaction.log`、`verify-settings-interaction-final.log`；Playwright 截图／trace 按项目惯例在 test-results，重跑可能覆盖。首次完整门禁的 4 份失败 trace 另存系统临时目录 `business-table-settings-before-heading-fix-20260924`，便于追溯，系统清理前可用。本文保留检查结论，仓库不提交大体积 trace。

独立审查发现中间锁定列导致插入线与落点错位，已统一按完整顺序和固定槽校验，增加先失败再通过的回归；复核未发现剩余新增 P1/P2。只读动作与二级菜单、工具栏分组追加挂载验证，16 项设置事务测试通过。新增折叠标题保留原无障碍名称；操作卡片边框按卡片样式完整显示。

旧版实际页面另行打开核对：保留“当前编辑”、恢复、分区、预览和应用／取消层次；旧版基本、文字样式与内容没有折叠，本批按用户新要求补齐，未改动 reference 文件。

## 修改文件

- 组件：[ColumnSettings](../../../../src/components/ColumnSettings.vue)、[ColumnSettingsDrawer](../../../../src/components/ColumnSettingsDrawer.vue)、[列设置样式](../../../../src/components/column-settings.css)。
- 设置 Feature：[SettingsSection](../../../../src/features/settings/SettingsSection.vue)、[ColumnRuleEditor](../../../../src/features/settings/ColumnRuleEditor.vue)、[ActionSettings](../../../../src/features/settings/ActionSettings.vue)、[ToolbarSettings](../../../../src/features/settings/ToolbarSettings.vue)、[AppearanceSettings](../../../../src/features/settings/AppearanceSettings.vue)、[设置页样式](../../../../src/features/settings/settings-pages.css)。
- 拖动共用：[useDragReorder](../../../../src/ui/useDragReorder.ts)、[插入线样式](../../../../src/ui/drag-reorder.css)；调用方：[ViewsPanel](../../../../src/features/views/ViewsPanel.vue)、[ExportDialog](../../../../src/features/export/ExportDialog.vue)。
- 测试：[拖动边界](../../../../tests/drag-reorder.spec.ts)、[只读设置](../../../../tests/full-settings-ui.spec.ts)、[浏览器设置回归](../../../../tests/e2e/settings-refinement.spec.ts)。
- 文档：根 README、CHANGELOG、当前状态、界面与交互规范、本批版本说明／验收及版本／验收月份和分类索引。

## 限制

完整旧版视觉、实际后端与远端 CI 不能由本批本地结果替代。触屏使用保留的上下移动控件；未新增触摸拖拽协议。折叠状态不作为业务配置保存。

[版本说明](../../../04-版本记录/2026-09/2026-09-24-01-设置分层与拖动反馈.md) · [返回月份索引](../README.md)
