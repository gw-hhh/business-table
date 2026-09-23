# BusinessTable：设置细节精修验收记录

> 历史记录：保留本批发生时的结果、分支和限制，不作为当前开发规则。2026-09-23 归档时仅调整文档路径；当前状态与分支流程请从[文档导航](../../../README.md)阅读。

日期：2026-09-22。

## 基线和分支

用户明确要求从 `feature/config-runtime@550efb28da9a8108005cac379cc0bb7235aa597e` 再建分支，不从早期 main 重做。

远端已建立 `feature/visual-parity-refinement`。远端提交 `e9902d71ce2ad9feaf3049b807d49c596b016450` 只增加复核工作流，父提交是 `550efb2`。本批产品改动在该分支的本地隔离副本中完成，**尚未推送产品修改，也未合并 development/main**。没有改动原 config-runtime 分支，没有使用早期 `feature/legacy-ui-parity` 的代码或测试。

源码、锁定依赖和Chromium通过授权的GitHub CI取得，源码文件树与e9902d7完全一致。基线本地完整门禁为137项单元测试、32项浏览器测试全部通过。依赖的冻结安装在该基线CI中真实执行；本轮沿用同一锁文件和安装结果，未改变package.json/pnpm-lock.yaml或下载新产品依赖。

## 本批改动

| 项目 | 修改内容 |
|---|---|
| 字体 | 增加系统字体、微软雅黑、苹方、宋体、等宽字体和搜索入口；保留原通用字体配置兼容；480px原生模态、方向键、空结果、取消和回焦；不加载网络字体 |
| 颜色 | 增加旧版8个常用色；空覆盖值显示“跟随默认”；恢复默认删除覆盖；色板根据编辑区剩余空间上下展开，避免被预览区截断 |
| 草稿错误 | 非法颜色保留输入、标出错误并阻止应用；切列后可定位修正；只有错误输入时关闭仍确认；批量复制样式不残留旧颜色缓存 |
| 对齐 | 支持左右方向键、Home/End和单一Tab停靠点；继续走现有能力约束和草稿提交 |
| 快捷列 | 隐藏列划线；冻结图标在桌面hover/focus时可操作，触屏常显；触屏增加上下移动按钮，锁定列的位置和稳定ID不变 |
| 编辑上下文 | 当前列名称和分区栏随编辑区滚动固定；保留已有抽屉宽度、主页面布局、视图、73px宽松行高和预览位置 |

本轮主要修设置细节。不是重新实现报价页面，也没有修改Demo业务代码或重置用户已有配置。

## 文件

生产源码：`src/config/font-families.ts`、`src/config/columns.ts`、`src/types.ts`、`src/components/FontSelect.vue`、`ColorSelect.vue`、`ColumnSettings.vue`、`ColumnSettingsDrawer.vue`、`settingsTypes.ts`、`column-settings.css`。

测试与配置：`tests/settings-refinement.spec.ts`、`tests/e2e/settings-refinement.spec.ts`、`tests/e2e/demo.spec.ts`、`playwright.config.ts`。新分支的`.github/workflows/refinement-review.yml`在交付源码中移除了临时打包node_modules/Chromium步骤，保留冻结安装、完整门禁和测试产物。

文档：本记录、`docs/07-参考与归档/01-旧版迁移历史.md`第10节。

## 实际验证

| 检查 | 结果 |
|---|---|
| 完整 `npm run verify:release` | PASS，退出码0 |
| portability / SFC audit / vue-tsc | PASS |
| Vitest | 151/151 PASS；相对基线新增14项 |
| 声明 / library / Demo build | PASS |
| Playwright Chromium | 46/46 PASS；开发24、生产预览22；新增7个场景在两种环境执行 |
| console.error / pageerror / window error / unhandledrejection | 0 / 0 / 0 / 0 |
| 旧版原包完整性 | 145/145 SHA-256与字节数一致 |
| 锁文件和依赖约束 | 无修改 |
| `git diff --check` | PASS |

TDD证据包括：首次11项失败用例；非法颜色关闭、批量复制颜色两种输入、字体对话框尺寸/输入样式和色板裁切的后续RED→GREEN。旧的冻结浏览器测试曾直接点击opacity为0的图标；本轮按旧版真实交互增加“悬浮到该行”，并断言图标完全显示、接收指针，再执行原有冻结切换断言。没有删除失败用例或放宽验收阈值。

仍有既存的UMD混合导出及Demo包体积提示，不属于浏览器错误；没有通过升级依赖或关闭警告来伪造无警告结论。最终日志见交付证据包`delivery-gate.log`和`delivery-gate.exit`。

## 视觉证据

截图来自实际Chromium，桌面1920×945，触屏390×900。前后对照沿用相同用户视图和配置。字体搜索过滤“雅黑”后，旧版/新版模态均为480×328，位于x720/y308.5。外部对照HTML含设置抽屉、快捷列、字体搜索、色板、滚动上下文、主页面和触屏状态，支持原始尺寸查看。

旧版默认界面和用户上轮保存的Vue客户视图不同。展示旧版/新版时已经在对照页说明，不为截图相似而删除或重置客户视图、数据、行高和配置。

## 兼容性和未完成范围

字体配置仅新增受控枚举token，旧的`inherit/sans-serif/serif/monospace`仍有效；不允许任意CSS/URL。图标和高级控件只在现有列设置功能加载后使用；没有改动Feature Gate或Headless状态归属。

高级筛选、完整Value Mapping、显示模板、试算、完整工具栏/操作配置等仍保留原迁移矩阵中的缺口。本批不是“旧版全部功能或每个像素均已一致”。

仓库快照包含Master Handoff；没有`CODEX-EXECUTION-BRIEF.md`和`BUSINESS-TABLE-CODEX-FINAL-SPEC.md`，本轮没有声称已阅读缺失文件，也没有据此擅自推断新的架构规范。

本批为作者单独一轮自查，没有独立审查代理。视觉最终仍待用户验收；验收后再集中推送新分支，保持feature→development→main流程，不直接发布main。
