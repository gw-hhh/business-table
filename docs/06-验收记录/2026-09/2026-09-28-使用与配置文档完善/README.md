# 使用与配置文档完善验收

## 范围

新增七篇教程/手册、八份可复制 TS/Vue 文件及示例索引；同步根入口、分类索引、状态、规范、计划与版本。发布包消费审计扩展为严格 TypeScript 与 Vue 模板检查。未改平台功能和旧版参考。

## 检查结果

| 检查 | 本次结果 |
| --- | --- |
| `npm run audit:docs` | PASS，74 篇 docs Markdown 的目录、链接、锚点与索引 |
| `npm run audit:package` | PASS，254 个打包文件，独立消费者及 8 份 TS/Vue 示例 |
| 适配器定向 smoke | PASS，通过 Node 执行文档 asset-source.ts；验证数字原值、三类请求信号、JSON 不包含 signal、values 标签回查、完整读取上限、坏行/total 与 HTTP 503 拒绝 |
| 独立只读审查 | PASS；发现并修正 ViewsPanel 未绑定 modified、FAQ 误把查询失败描述为 diagnostic 事件；复核后无阻断项 |
| `git diff --check` | PASS；仅 Windows 换行转换提示，无空白错误 |
| `npm run verify:release` | PASS，退出码 0；文档、可移植性、52 个 SFC、类型、68 个单测文件/542 项测试、声明/库/Demo 构建、发布包和 151 项 Chromium 浏览器测试全部通过 |

完整日志：仓库根目录 `verify-documentation-20260928.log`（本地忽略文件）。浏览器测试包含开发与生产预览，运行错误采集断言通过；Node 的 NO_COLOR/FORCE_COLOR 提示为命令行环境警告，不是页面运行错误。验收记录及清单收尾后再次执行文档审计和 Git 差异检查。

## 修改文件与流程

| 位置 | 文件 |
| --- | --- |
| 根入口 | README.md、docs/README.md |
| 项目入门 | 05-使用操作教程.md、06-逐步接入教程.md、07-常见问题与排查.md；同步 02-本地运行与接入.md、03-当前状态.md 和 README.md |
| 架构与规范 | 08-配置字段手册.md、09-查询与后台对接.md、10-偏好与视图持久化.md、11-场景配置配方.md；同步配置规范、文档规则、测试规范和分类索引 |
| 业务示例 | [01-接入示例](../../../03-业务模块/01-接入示例/README.md)的 README、assets.ts、asset-source.ts、MinimalTable.vue、ConfiguredTable.vue、CustomSearch.vue、RemoteTable.vue、ViewsTable.vue、ExportTable.vue；同步业务索引 |
| 交付记录 | 本批计划、版本说明、验收及各月份/分类索引 |
| 验证脚本 | [scripts/package-audit.mjs](../../../../scripts/package-audit.mjs) |

架构调整限于文档验证流程：独立包消费检查使用 vue-tsc 同时校验 TS 与模板，并从打包清单获取示例，不引入私有源码导入。Feature/Runtime/Config/Persistence 无行为或协议调整，src/demo/reference 的 Git diff 为空。

## 提交识别

本批在 development 完成；本记录所属提交即本批交付提交，可用 `git log -1 -- docs/06-验收记录/2026-09/2026-09-28-使用与配置文档完善/README.md` 追溯。按持续授权在完整验证后提交并推送，具体提交号及远端核验以交付回执为准。

## 边界

文档示例依照当前公开 API 和实现编写。HTTP 示例路由不在仓库实现；类型检查不验证真实后台、权限、服务端版本冲突。已有浏览器回归与新增示例的编译检查分别记录，不能混称新增示例全量浏览器验收。设置历史仍排除；试算不是公式引擎。

证据以本目录记录、关联提交及本地日志为准；完整门禁日志保存在本地被忽略的 `.log` 文件，默认不随仓库发布。远端 CI 状态另行确认，不从推送成功推断。

[版本说明](../../../04-版本记录/2026-09/2026-09-28-01-使用与配置文档完善.md) · [实施计划](../../../05-实施计划/2026-09/2026-09-28-使用与配置文档完善.md) · [返回月份索引](../README.md)
