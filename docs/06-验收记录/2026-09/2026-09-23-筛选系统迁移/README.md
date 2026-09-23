# 筛选系统迁移验收记录

> 历史记录：保留本批发生时的结果、分支和限制，不作为当前开发规则。2026-09-23 归档时仅调整文档路径；当前状态与分支流程请从[文档导航](../../../README.md)阅读。

日期：2026-09-23。

## 范围与基线

本次是 **quotation-manager-v3.1 完整迁移中的筛选交付节点，不是完整迁移验收通过**。

工作分支仍为 `feature/visual-parity-refinement`。实际开始时该分支已从用户提供的 `79110eb00da877f42fac8ac1c7c95bb7b049ba54` 前进到 `6225ced8d47a954239aee43d38a9e6db2ccb0d70`，源码树为 `a07949a9ece6bbf7e079506a5c958a7de7e7368b`。本次保留这些后续 Runtime / Settings 修改，不回退、不重新创建分支、不改动 main、development 或 feature/config-runtime。

旧版依据：`reference/legacy-v3.1/quotation-manager-v3.1/index.html`、`src/column-filter-ui.js`、`src/column-rules.js`、`src/workbench.js` 和对应样式。正式源码没有调用旧 JS 或使用 iframe。

## 本次迁移结果

| Legacy 能力 | Vue 实现 | 验证 |
| --- | --- | --- |
| 表头列筛选 | 第一方表头入口、480px 模态框、字段类型编辑器 | 真正筛选、取消不改结果、清除此列；开发与生产浏览器 |
| 多条件与 AND / OR | 递归条件组编辑器、580px 抽屉、共享谓词编译 | 嵌套组合、边界数量/深度、无效组整体拒绝 |
| 文本 / 数字 / 日期条件 | 同一纯函数引擎供本地表格和报价适配器使用 | 等于/不等于、包含/开头、比较、区间、空值、相对日期 |
| 候选项、字典与原值 | 类型保留的单/多选、映射/手工/数据/远程来源 | `1` / `"1"` / `false` / `null` 区分、搜索保留选择、全源数量 |
| 金额与百分比单位 | 草稿记录输入单位，应用后保存原值和单位基准 | 万/千/亿/百分比；修改显示格式不重解释已有条件 |
| 条件摘要 | 通用列条件与组合条件标签 | 删除列条件不清除基础查询；点击标签重新编辑 |
| 保存筛选方案 | 组件内置新增/覆盖/重命名/删除/读取；可替换 Persistence | 保存失败不关闭；首次读取失败不覆盖远端未知方案；表格隔离 |
| 筛选与命名视图 | 通用快照分别保留基础、列、组合条件 | 保存、刷新、切换后恢复，条件标签不重复，不误报未保存 |
| 键盘与窄屏 | 复用 Overlay / DialogFrame；嵌套 Escape、焦点恢复 | 390px 无抽屉内容横向溢出；只关闭最上层弹窗 |
| 按需与权限边界 | opt-in `filters` Feature，动态加载 UI/Context，default/custom/headless | 关闭时不读详情、不建编辑状态、不加载 UI；应用时重查当前字段/操作符 |
| 第二个系统接入 | 现有材料配置示例启用相同功能 | 无报价 handler；名称查询真实从 2 条变为 1 条 |

方案管理是新增的通用能力；不把新增能力包装为旧版像素等价证明。

## 架构与可靠性

`runtime/filter.ts` 统一查询谓词及持久化条件解码，删除原本 Core、列筛选和报价适配器各自的判定分支。`runtime/filter-state.ts` 对应用快照做整体校验与当前列能力检查。UI 只有可取消草稿，正式条件由 `useTableRuntime` 持有。

筛选 Context 和 Vue 编辑器通过 FeatureHost 交互时加载。公开类型通过包入口导出，打包审计会在独立消费者中检查 `ConfiguredBusinessTable` 的筛选 Persistence 类型。不让业务页实现通用弹窗、条件组、方案保存或候选项请求状态。

候选项请求具备 AbortSignal、请求序号和 10 秒超时。方案读取同样有取消和超时；写操作串行、读取完成后合并，并且只在适配器确认保存后发布。过期窗口不能再应用，未知字段/损坏条件不静默丢弃并扩大查询。

同时修复了列筛选入口挤占右对齐表头的问题；原有表头对齐浏览器断言保留，没有放宽容差或跳过用例。

## 本地验证

使用仓库 CI 导出的准确源码与锁定依赖。当前环境无法重新访问包仓库，**本地没有声称重新执行 frozen install**；`package.json`、`pnpm-lock.yaml` 与基线一致。远端安装结果由发布后相应 commit 的 GitHub Actions 给出。

实际执行 `npm run verify:release`，退出码 **0**：

| 门禁 | 结果 |
| --- | --- |
| Portability / SFC 审计 | 通过 |
| `vue-tsc --noEmit` | 通过 |
| Vitest（含挂载与集成） | **276 / 276**，34 个文件；开始时为 220 |
| Library / Demo Build | 通过 |
| 声明构建与独立包消费者类型审计 | 通过 |
| Playwright Chromium | **69 / 69**；开始时为 53，新增 8 个场景分别运行开发和生产 |
| 浏览器错误检查 | 使用自动 fixture 检查 console.error / pageerror / window.error / unhandledrejection，全部为 0 |
| Legacy 只读校验 | **145 / 145** 文件长度与 SHA-256 符合原清单 |
| `git diff --check` | 通过 |

测试按 RED → GREEN 执行。自查补测覆盖：未知字段、不合法 View 条件、候选项超时、条件层重复、方案初次加载与保存竞态、初次读取失败后覆盖数据风险。没有独立子代理代码审查，以上为本轮实现者自查与自动化验证。

## 仍未完成 / 风险

完整 legacy 迁移仍未通过。分组/对比/条件标记/区域统计/历史恢复、完整导出方案与 Excel、模板生命周期以及页面剩余的通用视图/查询/工具栏状态迁出等，需要继续逐项完成；现有映射、格式和富文本基础不等于其所有旧版交互都已迁移。

视觉已验证本次弹窗尺寸、窄屏、键盘，以及现有主界面样式回归；**没有宣称全部设置中心、菜单、动画和旧版数据工具都已视觉等价**。组合筛选当前有独立入口，后续完整工具栏迁移时仍需对齐旧版入口组织。

远程数据源需要实现 `query` 中的组合条件；候选项要提供 `options` 或完整结果 `readAll`。不把当前页冒充全结果。浏览器读取完整结果最多 10000 条，更多应由服务端处理。

默认方案按 tableKey 存储。业务系统必须把用户/租户隔离编码进 tableKey，或提供独立的 Persistence。客户端 Feature/字段约束不是服务端鉴权；多标签页/多客户端同时修改时的 ETag 或版本冲突，应由业务 Persistence 实现。写入不做盲目超时重试，避免无法确认服务端是否保存时覆盖其他写入。

现有 VXE 主包构建仍有超过 500kB 的 chunk 提示；未通过提高告警阈值隐藏此提示，也没有借本任务升级依赖。

## 运行

Node.js 22（满足项目 engines）；在目标分支安装锁定依赖：

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium
corepack pnpm run dev -- --host 127.0.0.1 --port 5180
corepack pnpm run verify:release
```

浏览器打开本地启动后的 `http://127.0.0.1:5180/`。材料接入场景：`/?example=config`；关闭功能场景：`/?example=config&mode=off`。

## 文件清单

```text
demo/App.vue
demo/ConfigExample.vue
demo/quotation/model.ts
docs/06-验收记录/2026-09/2026-09-23-筛选系统迁移/README.md
docs/07-参考与归档/01-旧版迁移历史.md
docs/01-项目入门/02-本地运行与接入.md
docs/05-实施计划/2026-09/2026-09-23-筛选迁移计划.md
playwright.config.ts
scripts/package-audit.mjs
src/BusinessTable.vue
src/ConfiguredBusinessTable.vue
src/components/FeatureHost.vue
src/config/features.ts
src/core.ts
src/features/filters/FilterChips.vue
src/features/filters/FilterFeature.vue
src/features/filters/FilterGroupEditor.vue
src/features/filters/FilterOptions.vue
src/features/filters/FilterRuleEditor.vue
src/features/filters/context.ts
src/features/filters/editor.ts
src/features/filters/filters.css
src/features/filters/model.ts
src/features/filters/options.ts
src/features/filters/plans.ts
src/features/views/runtime.ts
src/index.ts
src/runtime/deadline.ts
src/runtime/filter-state.ts
src/runtime/filter.ts
src/runtime/useTableRuntime.ts
src/style.css
src/ui/DialogFrame.vue
tests/e2e/filter-migration.spec.ts
tests/filter-boundaries.spec.ts
tests/filter-drafts-plans.spec.ts
tests/filter-engine-migration.spec.ts
tests/filter-feature.spec.ts
tests/full-views.spec.ts
tests/quotation-model.spec.ts
```
