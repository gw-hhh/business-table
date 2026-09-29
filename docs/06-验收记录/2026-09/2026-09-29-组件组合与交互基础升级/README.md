# 组件组合与交互基础升级验收

## 范围与当前状态

本批包括公共 Runtime/组件组合、搜索区域与自动提交、分页配置与完整读取、Tiptap 富文本、SortableJS 排序、Floating UI 定位、公开子入口与打包审计、查询/条件标记复用，以及对应文档和可编译示例。工作分支为 development，reference 保持只读；main 未安排合并。

最终 `npm run verify:release` 退出码为 0：74 个单测文件 / 589 项测试、169 项 Chromium 开发与生产预览用例通过。独立审查发现的问题已修复并复核。下表保留开发阶段记录，最终结果以“最终检查结果”为准。

## 开发阶段记录

| 检查 | 实际结果 | 范围与限制 |
| --- | --- | --- |
| `npx vitest run tests/floating-position.spec.ts tests/action-menu.spec.ts tests/toolbar-menu.spec.ts tests/views-panel.spec.ts tests/full-views.spec.ts tests/column-header.spec.ts` | PASS，6 文件 / 46 项 | 真实 Floating UI 引擎；入口变化、内容/边界变化、观察器清理、定位拒绝、嵌套键盘与权限 |
| `npx vitest run tests/settings-refinement.spec.ts` | PASS，1 文件 / 14 项 | 色板按真实打开流程挂载后选色，继续验证草稿与应用边界 |
| `npm run test -- tests/drag-reorder.spec.ts tests/settings-parity.spec.ts tests/full-settings-ui.spec.ts` | PASS，3 文件 / 35 项 | Sortable 生命周期、DOM 恢复、锁定槽位、权限收窄、列/排序等设置；各文件可能与其他批次测试重叠，不相加推算总覆盖 |
| 拖动 Chromium 开发局部用例 | 5 PASS / 1 FAIL，需复验 | 快捷列、抽屉列/操作、触摸影像、边缘滚动与 Escape 通过；工具栏用例结束时因并行 HMR 导航出现 execution context destroyed，不能记通过 |
| 浮层文件 `git diff --check` | PASS | 仅换行转换提示，无空白错误；不是浏览器验收 |
| 新增 composition / rich / floating 浏览器用例 | PASS，14 项 | 主任务执行 Chromium 开发与生产预览；实际组件组合、富文本与浮层新增范围通过，既有全量回归仍待完整门禁 |
| 独立分页组件定向测试 | PASS，2 项 | 主任务验证分页 UI 显隐及插槽命令；不代表全部单测已完成 |
| `npm run audit:docs` | PASS，81 篇 docs Markdown | 目录、链接、锚点和索引；后续最终记录调整仍需复验 |
| `npm run benchmark:runtime` | 已测量，最终构建后待复测 | 实际打包 Runtime，1 万行关键词读取 10000 次；连续 100 次翻页新增字段读取 0；本次查询 2.9ms、翻页合计 2.07ms |

拖动局部命令：`npx playwright test tests/e2e/settings-refinement.spec.ts --project=chromium-dev --grep 'quick column drag|reorders at the indicated|touch dragging|dragging near' --workers=1`。浏览器局部失败需要在源码稳定后重新执行；其日志不能代替最终门禁结果。

## 最终检查结果

集成过程中补齐了自动搜索的旧 draft 接口、翻页/刷新保留计时器、显式关键词替换取消旧计时器，以及切换 tableKey 后 QueryRuntime 重绑草稿依赖。相关回归先复现失败，再完成修正；最后定向查询回归为 6 文件 / 67 项通过。

一次全量运行得到 589 项单测通过、浏览器 168 通过 / 1 失败。唯一失败为生产核心示例预加载了其他示例功能：Demo 的嵌套三元动态 import 被构建转换成共用 preload 依赖数组。改为命名 loader 映射后保留各自依赖边界，既有 core-only 断言在开发/生产均通过（2 项），未关闭预加载或放宽断言；随后重新执行完整门禁。

另已在桌面内置浏览器查看默认报价页、双实例组合页及 Tiptap 备注编辑界面的实际渲染。此查看不替代用户体验验收，也没有覆盖真实 Windows 输入法候选窗口。

| 检查 | 最终结果 |
| --- | --- |
| 文档 / 可移植性 / SFC / 类型 | PASS：81 篇文档、58 个 SFC，vue-tsc 无错误 |
| `npm run verify:release` | PASS，退出码 0；74 个单测文件 / 589 项，Chromium 开发与生产预览共 169 项 |
| 真实发布包消费 | PASS，9 份文档示例按真实包编译；Runtime 子入口可独立导入 |
| `audit:bundle` | PASS：Runtime 无 UI/VXE/CSS，默认入口无编辑器内核，RichEditor 为动态入口 |
| 独立差异审查 | 已修复自动搜索兼容/取消/重复请求、切表草稿依赖及浮层拒绝清理；最后复核未留已确认阻断项 |
| 浏览器 | 所有用例的四类运行错误断言通过；包含真实鼠标/触摸排序、窄屏、焦点、编辑与生产按需加载 |
| 提交定位与交付 | 本批源码、配置、教程及本记录一起提交到 development；实际 SHA 由本文件 Git 历史定位，推送核验在最终交付消息报告。未合入 main、未发布 npm，远端 CI 未单独核验 |

最终输出已归档为[发布门禁输出](发布门禁输出.txt)和[性能测量输出](性能测量输出.txt)，随本版本长期保留。输出去除 ANSI 控制码和行尾空白，并把本机工作目录替换为 `<workspace>`。本批以这些日志及可重复执行的测试为证据；没有归档独立截图或 trace。

### 构建与查询测量

| 项目 | 本次结果 |
| --- | --- |
| Runtime ESM 静态图 | 225193 bytes；合并文本 gzip 59402 bytes |
| 默认入口 ESM 静态图 | 364896 bytes；合并文本 gzip 100386 bytes |
| RichEditor 动态文件 | 502.85 kB，构建输出 gzip 140.16 kB |
| UMD 单文件 | 989.77 kB，构建输出 gzip 296.24 kB；UMD 不提供运行时分块 |
| 10000 行关键词查询 | 6.23ms，字段读取 10000 次 |
| 连续 100 次翻页 | 合计 4.8ms，新增字段读取 0，仍返回每页 50 行 |

ESM 静态图统计不含外置 Vue/VXE、CSS、动态块和浏览器渲染；合并文本 gzip 不等于每个 HTTP 文件 gzip 之和。Demo 的 VXE 共享块仍触发大于 500kB 提示，本批未调高阈值掩盖提示。性能时间是单次本机观测，不作为跨设备性能保证。

## 架构与修改位置

| 区域 | 实施位置与目的 |
| --- | --- |
| Runtime / 分页 / 搜索 | `src/runtime/useTableRuntime.ts`、`src/features/search/panel.ts` 与公共类型；同一实例负责查询、分页、草稿、选择、偏好和错误 |
| 组件组合 | `src/components/BusinessTableGrid.vue`、`TableSurface.vue`、`SearchRegion.vue`、`SearchToggle.vue`、`TablePagination.vue` 与默认 BusinessTable 集成 |
| 公共包 | `src/entries/runtime.ts`、`src/entries/components.ts`、根入口、构建与包/依赖审计脚本 |
| 编辑器 | `src/features/rich-text/`，Tiptap 转换与安全输入，保存 RichDocument |
| 拖动 | `src/ui/useDragReorder.ts` 及消费者列表绑定，权限复查和提交前 DOM 恢复 |
| 浮层 | `src/ui/useFloatingPosition.ts`、AnchoredPopup、行菜单、工具/视图与色板，集中定位与观察器清理 |
| 教程与示例 | [组件组合](../../../02-架构与规范/12-组件组合与分页.md)、[富文本](../../../02-架构与规范/13-富文本编辑器接入.md)、[浮层](../../../02-架构与规范/14-浮层定位与生命周期.md)、[拖动](../../../02-架构与规范/15-拖动排序与权限.md)、[ComposedTable.vue](../../../03-业务模块/01-接入示例/ComposedTable.vue) |

## 兼容与未覆盖边界

根入口及已有持久化协议继续兼容；组件子入口为增量。runtime 子入口不带 UI 样式，实际组件宿主仍加载 VXE 与平台 CSS。远程关闭分页要求 readAll 返回完整受限结果，适配器须拒绝后台截断；不能仅凭返回数组长度验证完整性。

本地模拟、类型、打包和浏览器结果不替代真实后台鉴权、并发写入冲突或用户视觉验收。设置历史排除，试算不等于公式引擎，Legacy 全量验收仍为后续工作。

真实 Windows 输入法候选窗口、真实后台和 Legacy 全量主观视觉验收不在本次已通过结论中。已验证合成组合事件与浏览器输入、撤销、粘贴和模板字段，但不能据此宣称全部输入法均已人工验收。

性能命令要求先构建库：`npm run build:lib` 后执行 `npm run benchmark:runtime`，脚本为 [runtime-benchmark.mjs](../../../../scripts/runtime-benchmark.mjs)。最终时间为本次 Windows 主任务的 Node/JSDOM 单次运行，只含 Runtime 查询与切片，不含 VXE、界面绘制、网络或真实后台；不是基准保证，也不外推跨设备提升比例。字段读取次数用于验证重复查询工作是否被消除，最终数字见上表和性能测量输出。

[版本说明](../../../04-版本记录/2026-09/2026-09-29-01-组件组合与交互基础升级.md) · [实施计划](../../../05-实施计划/2026-09/2026-09-29-组件组合与交互基础升级.md) · [返回月份索引](../README.md)
