# BusinessTable — Codex 项目上下文

当前最高优先级需求为 [BUSINESS-TABLE-CODEX-MASTER-HANDOFF.md](BUSINESS-TABLE-CODEX-MASTER-HANDOFF.md)。本文冲突部分以总交接规范为准；用户最新工作流为本地开发、完整验证、用户验收后才推送 GitHub。

## 核心定位

BusinessTable 不是报价管理页面，而是企业级、跨项目复用、配置驱动的 Vue 3 通用业务表格二次封装。报价管理仅是第一个 Demo / 旧版参考场景。

仓库：`gw-hhh/business-table`  
正式版本：`1.0.0`  
正式 main 基线：`1f62254b72078f47f0aa53b713be521fad3168f9`

## Git 规则

`main → feature/xxx → development → CI → main`。

feature 只合 development；development 是测试/集成；上线由 development 合 main。禁止绕过 Release Gate。

## 技术基线

Vue 3、TypeScript 6.x、Vite 8、VXE Table 4.21.x、VXE PC UI 类型依赖、Zod、pnpm、Vitest、Vue Test Utils、Playwright、GitHub Actions。

暂不升级 TypeScript 7；当前 vue-tsc 工具链已在真实 CI 验证与 TS7 不兼容。

## 架构

业务系统 → BusinessTable → BusinessTable Config Schema → Core/Adapters → VXE Table。

数据库保存 BusinessTable 自己的稳定配置协议，不保存 VXE 内部对象。

`column.id`、`action.id`、`tool.id` 必须是稳定持久化标识，不能使用中文标题、数组下标或当前显示顺序代替。

配置链路：Local Definition → 可选 Remote Override → 外壳校验/迁移 → Feature Gate → Capability Guard → Preference Delta → View Delta → Registry/Feature Resolver。后端负责角色、项目、用户等业务优先级，前端不重建这些业务规则。关闭 Feature 后不读取详情、不初始化功能状态、不加载模块。

## 产品能力方向

列设置需要持续补齐：显隐、重命名、拖动、宽度、左右冻结双图标、对齐、字体/字号/字重/颜色/背景、排序开关、筛选开关、数字格式、Value Mapping、模板、条件样式。

冻结交互固定使用左右两个直接图标；点击已冻结侧即取消。不要改成下拉框。

Provider/Remote 必须处理并发请求，使用 AbortController + request sequence 防止旧响应覆盖新响应。

视图、工具栏、操作列、筛选、导出都必须配置化并由组件第一方提供，业务页只传配置和业务 handler。

## UI / 文案

拒绝功能堆砌。强调信息层级、秩序感、留白、一致性和低认知负担。默认正文 14px、辅助 12–13px、常规控件约 32–36px。

用户文案像正常开发人员/产品经理写的，简洁自然。避免“智能赋能、深度洞察、全方位、精准触达、闭环管理”等 AI/营销词。

## 安全

数据库配置是数据，不是代码。禁止 eval、new Function、任意动态 Vue template/script。权限必须由服务端最终校验。

## TDD / Release Gate

新增功能：测试 RED → 实现 → GREEN → Refactor → 全量回归。Bug：先补复现测试再修。

正式交付必须通过：依赖安装、portability audit、vue-tsc、Vitest、mount、声明构建、library build、Demo build、Playwright Chromium、console.error=0、pageerror=0。

没有真实 Release Gate PASS，不得声称完成。

## 旧版参考

`reference/legacy-v3.1/` 是旧版产品/UI/交互参考基线。旧版决定“原来有什么、长什么样、怎么交互”；新版架构决定“现在如何正确实现”。现有能力只增不减。
