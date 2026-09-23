# 报价页面样式还原：本地验收

> 历史记录：保留本批发生时的结果、分支和限制，不作为当前开发规则。2026-09-23 归档时仅调整文档路径；当前状态与分支流程请从[文档导航](../../../README.md)阅读。

日期：2026-09-21。本批按旧版 index.html、最终样式级联及用户六张截图实现。沿用本地 feature/config-runtime；main 为 d06979f，当前改动未推送 GitHub，用户验收后再按 feature → development → main 集成。

## 本批完成

主页面恢复页头、两行查询、视图工具栏、条件标签、双行项目/客户、浅底状态标签、文字操作列、底部汇总分页和整页留白。行 More、页面 More、我的视图、快捷列设置和完整设置抽屉均按原版尺寸与层级重做，提供六种状态的原图/新版交互对照。

快捷列面板与完整抽屉使用同一草稿，确认或应用才更新正式表；保留能力约束、锁定列和左右冻结。列名、宽度、显隐、排序、基础文字样式、预览和取消实际可用。菜单支持键盘、关闭回焦、二级菜单和超长内容滚动；动态权限收窄后不执行失效动作。查询、选择与视图继续使用当前 Vue 数据和配置架构。

报价查询、视图管理、CRUD、CSV和JSON备份恢复放在 Demo，不进入通用 src。旧项目145个文件逐一SHA-256校验一致；正式源码和构建未引用旧实现，依赖版本及锁文件未改。

## 修改文件

| 范围 | 文件 |
|---|---|
| 通用表格与展示接口 | src/BusinessTable.vue、style.css、types.ts、components/FeatureHost.vue、TableIcon.vue |
| 快捷设置、抽屉与配置校验 | src/components/ColumnSettings.vue、ColumnSettingsDrawer.vue、column-settings.css、settingsTypes.ts；src/config/columns.ts、schema.ts、types.ts |
| 操作与菜单 | src/components/RowActions.vue、ActionMenuItems.vue、action-menu.css |
| 报价页面与宿主业务 | demo/App.vue、quotation.css、quotation/model.ts、quotation/QuotationDialog.vue |
| 行为与界面回归 | tests/presentation.spec.ts、column-settings.spec.ts、action-menu.spec.ts、quotation-model.spec.ts、quotation-dialog.spec.ts、configured.spec.ts；tests/e2e/visual-parity.spec.ts、text-style.spec.ts、configuration.spec.ts、demo.spec.ts；playwright.config.ts |
| 文档 | docs/07-参考与归档/01-旧版迁移历史.md 第9节、docs/02-架构与规范/03-配置与能力规范.md、docs/07-参考与归档/02-历史实施/03-视觉还原实施.md、本记录 |

## 验证依据

相对本批前104项单元测试，增加33项，覆盖外部查询与选择、草稿提交/取消、样式白名单、排序预览、菜单权限、Demo数据和Dialog焦点。新增9个真实浏览器场景，同时运行开发页和生产预览；保留原有Provider、懒加载、配置及窄屏可用性断言。

字号复核先真实复现20/32px设置被Demo固定14px覆盖，再修正继承；浏览器检查正式表与预览的字号和实际字形边界，默认14/12px文字和73px行高保持。截图采集与浏览器门禁显示真实滚动条，避免无头浏览器默认隐藏滚动条造成布局误判。

| 1920 × 945 布局项 | 原版目标 / 新版实测 |
|---|---|
| 主卡片 | x24、y96、宽1872、高810 |
| 查询区 / 工具栏 / 条件条 | 高127 / 56 / 59 |
| 表头 / 双行记录 | 高44 / 73 |
| 底部分页 | y848、高57 |
| 设置抽屉 | x880、宽1040、高945 |
| 抽屉整表预览 | y657、高227 |
| 快捷列 / 我的视图 / 页面More / 行More | 宽280 / 438 / 250 / 174 |

以上为几何与交互验证，不宣称所有像素和全部旧功能已经一致。原图中的未保存状态、鼠标悬停和预览样例由实际操作状态决定。

最终完整 `verify:release` 已重新执行并退出0，包含上述全部代码修正：

| 检查 | 结果 |
|---|---|
| 可移植性 / SFC审计 / vue-tsc | PASS，15个Vue SFC |
| Vitest | 137/137 PASS |
| 声明 / 库 / Demo build | PASS |
| Playwright | 32/32 PASS，开发17、生产预览15 |
| console.error / pageerror / window error / unhandledrejection | 0 / 0 / 0 / 0 |
| 旧版文件完整性 | 145/145 SHA-256一致 |
| 对照页 | 6个界面、12张图片及切换/原始尺寸控件通过浏览器检查，错误0 |

完整原始日志为 `Release-Gate-Visual-Parity.log`，退出码记录为 `Release-Gate-Visual-Parity.exit.txt`。仍有既存UMD混合导出和Demo包体积提示，未升级依赖以消除提示。本批未推送，未运行新的远端CI。

## 验收与后续

本地报价页面：<http://127.0.0.1:5180/>。配置验证示例继续保留在 /?example=config。另附“样式对照.html”可逐个界面切换、叠加原版截图和新版截图；全部图片来自实际浏览器。

先检查主页面、两个More、视图和两种列设置；修改列名/宽度/文字后可比较“取消”和“应用”，也可切换全部报价验证原有入口与数据仍可用。

迁移矩阵第9节逐项记录已完成子集和缺口。下一批按优先级补齐高级列筛选/映射，再推进模板/试算、操作及工具栏配置。字体搜索、完整色板、复杂规则、完整远端Search/View Runtime、409冲突、Excel和旧业务备份协议兼容尚未完成；未实现的设置页签明确禁用，不假装可操作。下一分支须基于包含本批依赖的最新main；本地验收前不推送。
