# Legacy v3.1 → Vue BusinessTable 迁移矩阵

核查日期：2026-09-21。依据完整源码、样式、截图和本次实际运行结果，不能用功能名称或旧测试通过数代替 Vue 实现状态。

## 1. 最初基线与证据（历史）

- Vue 1.0.0：`main@1f62254b72078f47f0aa53b713be521fad3168f9`。
- `development@42f0a029f6f3111c2dd96d9da5fb70712457060b` 仅多出项目上下文、原迁移矩阵和 reference 说明三份文档，生产代码一致。
- 已完整阅读上述三份文档、根 README，以及用户另附的 26 节项目规范；旧 README、V3-README、DESIGN、DESIGN-TOKENS、TEST-REPORT、CHANGELOG 已核对，历史 2.x/3.0 记录以 3.1 实际代码为准。
- 原包：`quotation-refactor-v3.1.zip`，SHA-256 `ad0b1d616b841d755e4f10cf43a796e4dbf70bf5aa7fd3253b6dd5a9433c8858`。
- **145 个文件**完整、原样保留在 `reference/legacy-v3.1/quotation-manager-v3.1/`，包括隐藏文件、日志、截图、测试、工作簿、完整 HTML。逐文件校验见 `reference/legacy-v3.1/ARCHIVE-MANIFEST.json`，没有扁平化或改写旧项目。
- 旧版本次 Node 单测 **95/95 PASS**；执行后再次校验，与 ZIP 字节一致。本次真实 HTTP 打开及打开设置，1440×900、390×900 均显示六条记录，正文 14px、表头 44px、示例行 61px、控件 36px，页面/控制台错误 0。另检查随包 1440/390 主表、列设置、工具栏、映射、富文本共 10 张截图。未重跑完整旧版 Python 浏览器套件，历史 159 项不算本次结果。

| main 基线检查 | 本次结果与限制 |
|---|---|
| 安装 | pnpm **10.17.1** 及 Chromium 安装退出 0；原仓库没有锁文件，首次 frozen install 不能执行。未改核心依赖版本约束 |
| portability / vue-tsc / Vitest / mount | PASS；Vitest 2 文件 4 用例，mount 使用 VXE stub |
| declarations / library / Demo build | PASS；既存 UMD 混合导出和 Demo 包体积提示仍存在 |
| 原有 Playwright | 1/1 PASS，仅测试开发服务器；未捕获全部原生窗口错误 |
| 独立浏览器检查 | **不满足完整 Release Gate**：开发和构建产物均出现 `ResizeObserver loop completed with undelivered notifications.`；四行数据表体不断增长到 2168px |
| 原因 | VXE `height="auto"` 读取包含自身和工具栏/分页的无固定高度父容器，形成尺寸反馈；原有 pageerror/console.error 监听漏掉该 ErrorEvent |
| main CI | 实时核实 [35566613681](https://github.com/gw-hhh/business-table/actions/runs/35566613681) SUCCESS，对应 1f62254，使用存在漏检的旧门禁 |
| development CI | 实时核实 [35567843875](https://github.com/gw-hhh/business-table/actions/runs/35567843875) SUCCESS，对应 42f0a02；不能据此声称无浏览器错误 |

不能声称原 main 完整全绿。先在 feature 分支以 TDD 修复可复现基线问题并补强门禁，真实门禁通过前不向 main 发布、不展开大批 UI 迁移。

## 2. 状态与架构边界

矩阵保留迁移前 Vue 1.0.0 的源码证据，并在已实施条目写明对应批次进度：**已实现**限于对应行为；**部分实现**仅模型/子集；**未实现/缺失**没有完整路径；**需要重构**存在错误或违反目标架构。**当前 main、本地 feature 和最新视觉迁移状态见第9节**；第2–4节保留初始差异与完整能力清单，第7–8节保留历史执行记录，已被后续实现覆盖的状态以第9节为准。原始 Vue 行号用于定位初始差异，不作为当前文件行号。不把单个子项修复标成整类完成。

旧版回答功能/外观/交互，新版使用 Vue 3、TS 6、VXE Adapter、自有稳定配置协议实现。正式 src 禁止 import/reference 旧代码；旧目录不参与声明、library、Demo build。报价字段、整数分金额、状态编码、业务表单、写入和权限留在 Demo/宿主。按 Master 规范，配置层级为Local Definition→可选Remote Override→Feature Gate→Capability Guard→Preference Delta→View Delta→Registry/Resolver；后台负责角色/项目/用户优先级；column/action/tool 的 id 稳定，不用标题或下标。数据、配置、视图和界面偏好分开存储；旧报价 schema2/3 必须经显式转换，不能直接当作 Vue 自有 Preference；当前 Vue schema1通过自有kind的v2迁移至v3。

### P0：协议、数据生命周期与发布基础

| 旧版能力 / UI / 交互 | 当前 Vue 状态 | 差异 | 新架构实现方式 | 测试要求 | 优先级 |
|---|---|---|---|---|---|
| 同步本地查询；正式目标增加 Provider（旧 core/repository） | 已实现：第一批完成Local/Provider生命周期 | 取消、序号、独立快照与旧响应隔离已覆盖；高级Provider适配仍按需求扩展 | AbortController+序号；仅最新请求提交rows/total/error/loading；卸载/切换源取消；独立查询快照 | 乱序成功/失败、忽略signal、加载保持、切换源、卸载、输入不突变 | P0 |
| 越界分页收敛、空数据第一页、改页尺寸回首页（旧 core.paginate/app） | 已实现：第一批分页收敛；本批配置异步pageSize同步 | Local/Remote越界修正与查询去重已覆盖 | Local过滤排序后clamp；Remote依据total补查有效页；统一调度 | 末页删除、空数据、页尺寸变化、搜索/排序/View回首页、远程total缩小 | P0 |
| 稳定key与白名单 | 部分：本批列ID与Registry重复检查已完成 | tool等Registry类型槽已定义，完整Toolbar Runtime仍待实现；不照搬旧报价白名单 | TableDefinition及注册表校验；id与标题独立 | 重排/重命名不串配置，重复ID拒绝，任意业务字段可用 | P0 |
| 偏好/视图分离；schema2/3升级 | 已实现本批基础：Zod局部校验、自有v1→v2→v3、Preference/View分层 | View CRUD/版本冲突仍未实现，旧报价协议需另行适配 | parse→migrate→validate→resolve；View独立覆盖层 | 坏JSON/版本/tableKey、分层优先级、View切换恢复、输入不突变 | P0 |
| 存储失败保留状态、并发版本冲突（旧 repository） | 部分：读写异常已诊断并隔离，Core继续 | 当前为乐观本地状态；expectedVersion、409分类及确认/回滚草稿仍待实现 | 版本化PersistenceAdapter；409类型化错误；失败保留草稿，不静默覆盖 | 配额/读写失败、409、重试、旧适配器兼容、服务端原子版本比较 | P0 |
| 受控颜色/字体/URL/结构化文档 | 部分：Vue文本插值 | 配置缺运行时白名单与资源限制 | 数据schema+受控renderer/editor registry；不保存VXE对象 | 非法CSS/URL/脚本、超限文档、备份无函数/业务行/私有状态 | P0 |
| 明确最终测试和未测边界 | 已实现：第一批补强，本批扩展配置浏览器场景 | 四类错误检查、dev/生产预览、SFC audit及frozen安装已纳入 | 统一错误fixture；dev+生产预览；SFC审计；锁定安装 | 原问题RED；多帧高度稳定与0错误；完整Release Gate | P0 |

### 业务页面与数据完整性

证据：旧 `config.js/core.js/repository.js/forms.js/app.js` 和对应测试。业务能力保留在 Demo/宿主，通用组件通过配置/handler提供入口。

| 旧版能力 / UI / 交互 | 当前 Vue 状态 | 差异 | 新架构实现方式 | 测试要求 | 优先级 |
|---|---|---|---|---|---|
| 六条原始报价、整数分、draft/review/contract、大区/创建日期/备注 | 部分：四条简化记录、元数字、数字状态 | 样例/字段未完整迁入；不能误认旧状态编码 | Demo独立数据与字段适配；核心不硬编码报价 | 六条与字段齐全、分转元、0与空值、原状态往返 | P1 |
| 新增/修改/详情/复制为草稿/删除确认 | 未实现：handler只显示文字 | 有按钮不等于真实流程 | Demo Forms/Repository；Action调用宿主handler | 必填/日期/精度、复制新ID、删除确认、失败保留草稿、冲突拒绝 | P2 |
| 客户/状态/负责人/大区/日期查询、Enter、高级展开、未查询提示 | 部分：关键词+View.filters | 缺业务查询区与草稿状态 | 宿主查询schema，组件统一Query/chips/reset | 非法日期、Enter、隐藏查询仍保留条件、回首页 | P1 |
| 刷新快照、临时模式、跨标签页提醒 | 部分：刷新Provider | Demo无业务持久化和外部变更 | Demo repository和提示；Provider仅负责生命周期 | 失败保留数据、删除不复活、外部清除不写回旧数据 | P2 |
| 批量选择、页内全选/半选、跨页保留、选全部结果 | 未实现 | 不等于单元格区域选择 | 稳定rowKey的SelectionModel；Remote查询范围token | 翻页保留、查询/View清空、删除清理、页内全选和半选 | P2 |
| 所选/查询合计、精确金额、结果范围、页码跳转 | 未实现 | 当前仅总数/页数 | summary配置/slot和aggregate adapter；业务精度策略 | 0/负差额/大数、完整范围非仅当前页、非法页码、窄屏 | P2 |
| 数据JSON备份恢复，与配置分开；整批校验和替换确认 | 未实现 | 配置导入不能代替数据恢复 | Demo导入导出；配置导入走schema/migration | 重复ID/非法记录/大小限制、取消/保存失败保留原数据 | P3 |
| 真实登录权限/审批/转合同/Excel导入/批量修改/后台任务 | 两版均未实现 | 不属于旧能力丢失，不造占位按钮 | 未来独立需求；真实权限由服务端校验 | 只有实现且授权后提供入口；隐藏不等于授权 | 独立需求 |

## 3. 视觉、布局和交互矩阵

下表旧路径相对于 `reference/legacy-v3.1/quotation-manager-v3.1/`；Vue路径相对于仓库根目录。所有测试要在新组件上重建，不能导入旧实现冒充迁移。

| 旧版能力 / UI / 交互 | Vue 当前状态 | 关键差异 | 新架构实现方式 | 必测场景 | 优先级 |
|---|---|---|---|---|---|
| 页面信息架构与密度：页面工具、查询、表格标题/视图、表格工具、表体、汇总分页分层；表头 44px，普通 48px、双行约 60px，紧凑 44px、宽松 72px（`index.html:19-75`；`src/refinement.css:17-19`） | 部分：一个 48px 顶栏装标题、搜索、视图、列设置、刷新；VXE 默认行高，组件本身没有 density（`src/BusinessTable.vue:29-50`；`src/style.css:1`） | 当前层级扁平，业务高频工具和设置入口同权；没有三档密度与双行内容策略 | `BusinessTable` 暴露 page-tools/table-tools 插槽或配置区；建立 `--bt-control-h`、`--bt-head-h`、`--bt-row-*`、间距 token；密度通过 resolved config 驱动 VXE row/header height，内容增高时允许撑开 | 三档密度；14/20px 字号；单行/双行/完整换行；长文本不裁行；1440/768/390/320 无文档横溢出 | P1 |
| 字体与视觉 token：14px 正文，12–13px 辅助，36px 控件，蓝色 `#2468e8`，圆角 6/8px（`docs/DESIGN-TOKENS.md:7-20`） | 部分：14px/1.5、主色与 8px 容器已有；按钮/搜索仅 32px，缺少辅助层级、表头/内容 token（`src/style.css:1`） | 当前尺寸偏紧，表格与设置没有统一 token；状态 tag 甚至没有 `.bt-tag` 基础样式 | token 放到组件作用域 CSS 变量并允许主题覆盖；表头、正文、辅助、按钮、弹层独立语义 token，禁止业务页面散写字号 | 默认 token 快照；主题覆盖；大字号后行高不截断；中英文和 Windows 字体回退 | P1 |
| 页面与表格两组工具栏，配置名称、顺序、inline/more/hidden、图标/文字/两者、固定、分隔、间距；真实宽度溢出（`src/toolbar.js:13-28,31-57,59-97`；`src/refinement.css:79-87`） | 缺失：工具固定为搜索、查询、视图、列设置、刷新；移动端 `.bt__tools` 直接横向滚动（`src/BusinessTable.vue:31-38`；`src/style.css:1`） | 无稳定 tool.id 配置、无分区、无自动 More、无固定项、无工具禁用状态继承 | `ToolConfig[] + ToolbarResolver + useOverflowLayout`；ResizeObserver 测真实宽度；保持节点/handler，不复制业务逻辑；固定工具优先保留；More 用统一 Menu Overlay | 桌面/320px 溢出；固定项不收起；禁用项在 More 仍禁用；重命名和形式切换；resize 后焦点不丢 | P2 |
| 快捷列面板：显隐、拖动、左右冻结双图标、恢复/确认、更多设置；冻结图标桌面 hover/focus 显示，触屏常显（`src/styles.css:198-229`） | 部分：显隐、左右图标、range 宽度；立即持久化；无排序拖动、恢复/确认/更多；第 4 个 range 控件落到三列 grid 的下一行（`src/BusinessTable.vue:40-47`；`src/style.css:1`） | 当前面板没有草稿语义；绝对定位未以 `.bt__bar` 建立定位上下文；Unicode 图标无 `aria-pressed`；键盘/触屏排序缺失 | 快捷面板维护 session draft，与完整抽屉共享同一 draft store；采用图标组件并提供 `aria-label/aria-pressed`；拖动之外保留上下移动按钮；面板用 overlay/teleport 定位 | 取消不保存；确认后一次持久化；左右互斥且再次点击取消；触屏图标常显；键盘上下移动；面板不被表格 `overflow:hidden` 裁切 | P1 |
| 左/右冻结：两个直接图标，点击当前侧取消；设置页和快捷面板一致（`src/settings.js:245-255`；`README.md:9-11`） | 已有基本切换（`src/BusinessTable.vue:16,45`） | 交互立即保存；没有草稿/回退；当前 `vxe-column` 读取 resolved fixed，但配置校验和冻结边界反馈不足；窄屏策略未定义 | `fixed: false|'left'|'right'` 保持稳定协议；resolver 校验至少一个可滚动区；通过 VXE fixed adapter 和边界阴影表达；手机明确选择“取消 sticky、保留横滚”的旧版策略或产品新策略 | 两侧互斥/取消；应用/取消；首尾冻结边界阴影；隐藏后恢复；390px 横滚；持久化恢复 | P1 |
| 表头槽位：排序、筛选、更多入口有稳定预留，hover 不挤标题；列宽拖动（`src/styles.css:132-140`；`src/enhancements.css:38-39,85-87`） | 少量：单字段三态中的 asc/desc，没有“取消”；筛选模型类型存在但没有 UI；无列菜单和 resize 持久化（`src/BusinessTable.vue:18,51-53`；`src/types.ts:7-10`） | 当前排序每次覆盖为一个字段且永不回到无排序；标题按钮内联样式，图标槽不稳定 | Header renderer 预留 sort/filter/menu 三个槽；单击三态，多字段排序由 modifier 或排序抽屉维护；VXE resize 事件写用户配置；筛选走 QueryModel | 标题宽度 hover 前后不变；三态排序；多字段优先级；筛选激活状态；拖宽后持久化；窄列图标不遮标题 | P1 |
| 设置抽屉：五页签、当前编辑列/字段类型/显示状态、未应用摘要、定位修改、草稿错误保留、固定底栏（`src/settings.js:31-62,73-118,181-269,353-437`） | 缺失：330px aside，只提供显隐/冻结/宽度，所有修改立即保存（`src/BusinessTable.vue:37-47`） | 当前不能安全试改、取消、比较、定位错误；也没有表头/正文、格式、操作、工具栏、外观等完整入口 | 独立 `SettingsDrawer.vue`；`appliedConfig` 与 `draftConfig` 分离；Zod 校验返回 field path；dirty summary 由结构 diff 生成；关闭 dirty 时确认；Apply 先 normalize/validate 再一次保存 | 无修改 Apply 禁用；错误保留草稿并定位；关闭 dirty 确认；列/页签切换恢复滚动；快捷面板 draft 可继续应用；持久化失败不关闭 | P1 |
| 当前对象/整表预览：复用正式 QuoteTable renderer，`inert` 禁止业务操作；对象、整表、收起状态独立记忆（`src/settings-preview.js:5-48`） | 缺失 | 当前设置修改直接作用正式表，没有无副作用预览，也无法验证工具溢出、操作列、映射和数字显示 | renderer 接收 `previewContext` 与空 handler；预览使用同一个 resolved config/formatter，不复制渲染逻辑；用独立 UI preference key 记折叠/模式 | 预览不触发保存/删除/下载；正式/预览字体、密度、映射一致；320px 工具预览；关闭后清理 observer/menu | P1 |
| 映射与状态标签：原值→文字→即时样例；颜色/背景/边框/图标；空值和未匹配；状态为浅底色、小圆点、紧凑标签（`src/enhancements.css:10-18`；`src/refinement.css:23,92-101`） | 部分：`valueMap` 仅 label/color/background；渲染为 `bt-tag`，但无 padding/radius/点/边框 CSS（`src/types.ts:4,7`；`src/BusinessTable.vue:53`；`src/style.css:1`） | 类型匹配虽然用 `Object.is`，但配置能力和 UI 不完整；无空值/未匹配预览；视觉不像旧版 tag | 扩展稳定 mapping schema：typed value、presentation、color/background/border/icon、unmatched/empty；统一 TagRenderer；安全颜色白名单 | number/boolean/string 类型不串；空值/未匹配；对比度提醒；边框/图标；旧配置迁移；导出值与显示值策略 | P1 |
| 操作列：inline/more/hidden、排序、形式、对齐、间距、最大行内数；真实宽度不足自动收起；导出二级菜单；删除危险色（`src/actions.js:18-64`；`src/settings.js:311-345`） | 部分：position/order/danger；固定 190px；More 是单层绝对定位 div（`src/BusinessTable.vue:20-22,55-59`；`src/types.ts:17`） | 无 disabled/权限/visibleWhen；无 fit；More 可能被单元格/组件 overflow 裁切；无 click-away/Escape/回焦和二级菜单 | Action registry 保存稳定 action.id；resolver 计算 visible/disabled/reason；列用 ResizeObserver 执行 fit；菜单 teleport 到 overlay host；菜单项与行内按钮共用 action descriptor | 宽度逐级收纳；disabled 不触发 handler且有原因；More/二级菜单键盘；点击外部/Escape/滚动关闭并回焦；危险操作确认 | P1 |
| 菜单键盘：上下循环、Home/End、Right 开子菜单、Left/Escape 返回、Tab 关闭、关闭后回锚点（`src/menus.js:70-126`） | 缺失 | 当前 More 无 `role=menu/menuitem`、`aria-expanded`，没有方向键/关闭/回焦 | 统一 `MenuOverlay` + roving tabindex 状态机；二级菜单用相同模型；坐标通过 floating layer 计算 | 全键盘流程；首末循环；禁用项跳过；子菜单左右键；窗口 resize/祖先滚动；焦点回原行 | P1 |
| Dialog/Drawer：原生 dialog 提供 modal inert；补 Tab 循环、cancel、背景点击、首次聚焦、关闭回焦（`src/ui.js:136-213`） | 缺失 | 当前设置 aside 不是模态，也无 close 按钮和焦点边界；视觉上称不上抽屉 | 建立 `Dialog/Drawer` 基础组件，统一 focus trap、initialFocus、returnFocus、Escape、backdrop、scroll lock；嵌套 dialog 管理层级 | Tab/Shift+Tab 循环；Escape；背景关闭策略；嵌套字体搜索/确认框；关闭回焦；屏幕阅读器标题关联 | P1 |
| hover/focus/disabled：全局 `:focus-visible` 2px；hover 只在可用按钮；disabled cursor+opacity；菜单 focus 与 hover 同态；减少动态效果（`src/styles.css:15,26-27,46-57`；`src/custom.css:49-52`；`src/refinement.css:212`） | 部分：本批已补button禁用视觉、input/select/button的focus-visible和冻结侧约束；菜单焦点移动、错误输入联动与完整状态token仍缺失（`src/style.css:1`） | 鼠标状态有一点，键盘状态断裂；主按钮 disabled/hover 可能仍混淆；无 reduced-motion | 提供 Button/Input/IconButton/MenuItem 状态 token；`focus-visible` 不用 `outline:none`；disabled 与 aria-disabled 分开；全局尊重 reduced motion | 键盘焦点可见；disabled 不产生 hover/点击；高对比/减少动态；错误输入 focus ring + message | P1 |
| 设置键盘：页签 Left/Right/Home/End；对齐分段方向键；字体搜索方向键；色板 Escape；拖动列表有上下键替代（`src/settings.js:104-118,194-202`；`src/experience.js:38-84`） | 缺失 | 当前列设置只有原生 checkbox/range/button；没有 tablist/segmented/search picker；排序只靠鼠标点击 | `Tabs`/`SegmentedControl`/`Combobox`/`SortableList` 作为可复用 primitives；拖拽永远配上下移动命令 | 每个控件完整键盘矩阵；roving tabindex；焦点在重渲染后保持；中文输入法不误触快捷键 | P2 |
| 查询、视图和反馈：顶部查询区、展开高级条件、筛选 chips、未查询提示、命名视图“未保存”提示（`index.html:35-64`） | 部分：一个关键词输入、查询按钮、原生 view select；View 只应用传入配置，不能 CRUD（`src/BusinessTable.vue:32-36,19`） | 缺少高级/列筛选反馈、视图 CRUD/默认/系统与个人区分；切换列配置直接改内存但没有保存或 dirty 表达 | 查询区由业务传 schema，表格维护统一 QueryModel；Filter chips/active count 一方渲染；ViewService CRUD 和权限由 adapter 提供 | 查询前后 pending；清除 chip；视图脏状态；默认/系统视图不可误删；远程查询参数一致 | P2 |
| 远程加载与加载态：旧版没有真实远程后端，是同步本地 Demo（`README.md:54`） | 有基础 loading：`loading || busy` 交给 VXE，错误有 `role=alert`；但 `load()` 无 AbortController/sequence（`src/BusinessTable.vue:13,28,50`；`src/types.ts:10`） | 快速搜索/分页可被旧响应覆盖；旧请求 finally 可提前关掉新请求 loading；没有保留数据/重试策略和 `aria-busy` 说明 | `useDataQuery` 持有 AbortController + monotonic requestId；只允许最新请求提交 rows/error/busy；区分 initial loading、refreshing、error with stale data | 慢旧请求晚返回；abort 不显示错误；快速翻页 busy 不闪退；失败保留旧数据并可重试；aria-busy/live 文案 | P0 |
| 表格高度与 ResizeObserver 稳定性：旧版主卡用 flex，表格 viewport 自己滚动；手机明确给 360px/65dvh（`src/styles.css:60,104-106,326,338`） | 有严重基线问题：当前 VXE 使用 `height='auto'`（`src/BusinessTable.vue:50`）；主任务实测 4 行表体增长到约 2168px，并触发 `ResizeObserver loop` window error，现有 Release Gate 仍 exit 0 | 尺寸由内容和观察器互相驱动，页面增长且 window error 被门禁漏检；继续加预览/抽屉会放大不稳定性 | 外层定义明确可用高度或让短表自然高度、仅在约束容器内启用内部滚动；不要给 VXE 传字符串 `auto` 触发闭环；Release Gate 同时监听 `pageerror`、console.error 和 `window error` | 0/4/大量行高度；连续 resize；打开关闭抽屉；无 `ResizeObserver loop`；window error=0；表体高度与行数/容器一致 | P0 |
| 空状态：图标、标题、说明和按上下文变化的“清除条件/新增报价”（`src/table.js:124`；`src/styles.css:146-151`） | 部分：只有“暂无数据”文本，56px padding（`src/BusinessTable.vue:62`；`src/style.css:1`） | 无“无原始数据”和“筛选无结果”区分，无 CTA；加载时空态切换取决于 VXE 默认行为 | EmptyState 接收 reason=`initial|filtered|error` 与可选动作；busy 时不渲染 empty；保留组件通用文案，业务 CTA 用 slot/handler | 初始空、筛选空、加载转空、错误、清除条件、新增入口；无重复 live announce | P2 |
| 分页与汇总：总数、当前范围、筛选合计、页尺寸、页码、跳页；窄屏收敛为必要控件（`index.html:69-75`；`src/styles.css:153-169,342-345`） | 部分：总数、页数、页尺寸、上一页/下一页（`src/BusinessTable.vue:64`） | 无范围、页码/跳转/汇总；pageSize 改变后不重置页码，可能落到空页；total 变化也未夹紧 page | Pagination model 统一 clamp；可配置 summary slot；桌面数字页码，窄屏 prev/current/next；pageSize 改变回第 1 页 | 删除最后一页数据；改变 pageSize；total 变小；0 条；大页数；390px 不溢出 | P1 |
| 响应式：700px 下页面工具换行、查询纵排、工具栏分行、表格固定 360px 高并横滚、冻结退化；设置抽屉 800px 全宽、580px 列选择横排（`src/styles.css:319-358`；`src/custom.css:166-198`） | 部分：720px 顶栏纵向、工具条横滚、设置浮层铺满左右（`src/style.css:1`） | 当前只是堆叠与横滚，没有优先级/More；表格和设置的二维/普通内容滚动边界未区分 | 断点围绕容器宽度而非页面；二维表独立横滚，普通表单严禁横溢；设置在 tablet/fullscreen 切换；动作和工具共用 overflow resolver | 1440/1366/768/390/320；容器嵌套窄宽；无 document scrollWidth；表格仍可横滚；底栏不遮内容 | P1 |
| 富文本：撤销/重做、字体字号、格式、颜色、段落列表、链接/清除；选区混合状态；中文 composition；白名单粘贴；手机全屏（`src/rich-text.js:186-525`；`src/refinement.css:129-138,200-202`） | 缺失 | 当前 schema/renderers 没有富文本插件点 | 作为可选 Renderer/Editor plugin，不进入核心表格；保存 Delta/受控 AST，不保存 HTML；编辑器回填与业务保存分离 | 选区状态/混合格式；Ctrl/Cmd+Z/Y；composition；粘贴清洗；1000 字上限；链接白名单；手机全屏；取消不保存 | P4 |
| 配置安全与持久化：schema 3、白名单归一化、1–30 字列名、颜色/列宽/工具名校验、恢复到草稿后再应用（`src/customization.js:38-68,144-200`；`src/settings.js:374-437`） | 部分：本批已加入Zod字段校验、schema迁移、能力Guard和保存失败诊断；旧入口保留schema1；`saveConfig` 直接替换并 await persistence，但无校验/迁移失败 UI（`src/types.ts:14-18`；`src/BusinessTable.vue:14-17`） | 当前保存失败已捕获且保留本地状态；草稿/取消、confirmed保存与版本冲突仍待实现 | Schema 层负责 parse/migrate/normalize；持久化使用 optimistic 或 confirmed 策略之一并明确回滚；设置只提交通过校验的 ResolvedConfig | 非法旧配置；重复列名；越界宽度；保存失败回滚；schema migration；业务配置不能携带模板/脚本 | P1 |

## 4. 规则、数据工具与输出矩阵

### 列规则、筛选、格式与模板

| 旧版能力 / 交互 | Vue 状态 | 具体差异 | 新架构实现 | 测试（先 RED） | 优先级与证据 |
|---|---|---|---|---|---|
| 数字固定/最多小数位、千分位、前后缀 | **部分** | Vue core 可用 `Intl.NumberFormat` 格式化，但列设置没有编辑入口；未覆盖旧版精确舍入、正号/会计负数、显示单位缩放 | 独立 `NumberFormatConfig` schema + formatter；列设置只编辑配置，renderer/exporter 共用规范化结果 | `1.005`、负数、0、空、超大金额；固定/最多位数；前后缀与千分位 | **P1**。旧版：`src/column-rules.js:L23-L26,L104-L163`；测试：`tests/rules.test.cjs:L10-L29`。Vue：`src/types.ts:L6-L7`、`src/core.ts:L3-L4` |
| ratio / percent 两种百分比语义 | **已有基础** | Vue formatter 已区分 `ratio/percent`，但设置、筛选和 XLSX 数值语义未迁移 | 保持公共语义枚举；筛选捕获应用时的单位基准；ExporterAdapter 输出数值与格式，不输出格式化字符串 | 两种基数显示相同；筛选输入 10 代表 10%；XLSX 是数值单元格且含 `%` 格式 | **P1/P3**。旧版：`src/column-rules.js:L125-L163,L224-L264,L471-L485`；测试：`tests/rules.test.cjs:L16-L18,L55-L58`、`tests/export.test.cjs:L102-L110`。Vue：`tests/core.spec.ts:L2` |
| 数字显示缩放，筛选条件保存原单位语义 | **缺失** | 旧版筛选规则保存 `basis`，修改列显示格式后筛选范围不漂移；Vue FilterConfig 只有 field/operator/value | FilterConfig 的 numeric operand 带归一化单位或 capture basis；Provider query 序列化使用稳定业务值 | 先以万元保存 `>=10`，再关闭格式，命中集合不变 | **P1**。旧版：`src/column-rules.js:L205-L264`；测试：`tests/rules.test.cjs:L100-L110` |
| 类型化 Value Mapping | **部分** | Vue用 `Object.is` 保留值类型且可显示文字/前景/背景，但无 mapping schema、未匹配/空值文本、边框、图标、text/tag/dot、字典排序 | `ValueMappingConfig` 用 tagged scalar（string/number/boolean/null）校验重复；renderer registry 消费 presentation | `1`、`"1"`、`"01"`、`true`、`null` 分开；空值与未知值独立；重复原值拒绝 | **P1**。旧版：`src/column-rules.js:L28-L33,L165-L203,L403-L433`；测试：`tests/rules.test.cjs:L30-L42`。Vue：`src/types.ts:L5,L7`、`src/core.ts:L3,L10` |
| 值映射设置与即时样例 | **缺失** | Vue只接受代码传入 valueMap，列设置面板无增删、排序、颜色/边框/图标、空值/未知提示或试算 | 在 UserColumnConfig 中持久化 mapping override；设置抽屉使用草稿；预览调用正式 renderer | 添加、移动、删除、改色；非法六位色值/重复原值保留草稿；应用不改原始数据 | **P1**。旧版：`src/rule-settings.js:L74-L110,L157-L174`；浏览器：`tests/enhancements_browser_test.py:L28-L32,L58-L68` |
| 列筛选类型与操作符白名单 | **部分** | Vue只支持 `eq/contains/in/gt/gte/lt/lte` 的本地纯函数，无 ne、starts、empty、notEmpty、between、日期相对范围、single/multi/boolean 配置 | 按 filter kind 建判别联合；operator 由 kind 限定；local evaluator 和 Provider serializer 共用 schema | 每种 kind 至少一组合法/非法 operator；日期、数值区间顺序；空值语义 | **P1**。旧版：`src/column-rules.js:L19-L22,L273-L361`；测试：`tests/rules.test.cjs:L50-L63`。Vue：`src/types.ts:L9`、`src/core.ts:L5` |
| 列筛选选项来源：完整本地数据、mapping、手工 | **缺失** | Vue无筛选 UI和选项源；旧版保留原始类型、显示计数、搜索、200项提示 | `FilterOptionsProvider` 支持静态/valueMap/local distinct/remote；选项结构保持 typed value；大数据由宿主远程查询 | number/boolean/text 类型不串；完整数据计数而非当前页；超过200项提示且已选项保留 | **P1**。旧版：`src/column-rules.js:L383-L401`、`src/column-filter-ui.js:L26-L44`；测试：`tests/rules.test.cjs:L112-L116` |
| 表头筛选：草稿、取消、清除、应用前校验 | **缺失** | Vue表头只有排序按钮，没有筛选触发器、激活态、草稿对话框或错误提示 | ColumnFilterPopover 维护局部 draft；提交后才更新 QueryModel；清除只删本列条件 | 取消不改 query；错误区间不应用；清除本列不删除顶部查询 | **P1**。旧版：`src/column-filter-ui.js:L1-L86`、`src/table.js:L109-L115`；浏览器：`tests/enhancements_browser_test.py:L76-L85` |
| 组合筛选 AND/OR，最多 30 条 | **缺失** | Vue QueryModel 是平铺 filters 数组，没有分组 join 或编辑器 | 定义 FilterGroup AST 或首阶段单层 `{join,rules}`，Provider 可序列化；与顶部/列筛选合并时语义明确 | 两条件独立编辑、AND/OR结果、非法规则拒绝、未知列迁移时丢弃并告警 | **P4**。旧版：`src/column-rules.js:L363-L381`、`src/column-filter-ui.js:L88-L140`；浏览器：`tests/enhancements_browser_test.py:L105-L107` |
| 富文本配置是白名单 Delta，不执行 HTML/JS/CSS | **缺失** | Vue没有富文本/模板协议；旧版允许有限 insert/attributes，过滤图片、媒体、脚本和危险链接 | Renderer/Editor Registry 注册 `rich-delta`；Zod 限制 ops、字符数、字段 token 和属性；渲染只创建节点/组件，不用 `v-html` | `javascript:`、脚本属性、图片、未知嵌入被移除；深层/超大粘贴拒绝且不改原文 | **P4**。旧版：`src/column-rules.js:L39-L99`、`src/rich-text.js:L1-L3,L49-L100,L120-L181`；测试：`tests/rules.test.cjs:L64-L75`、`tests/enhancements_browser_test.py:L92-L99,L153-L158` |
| 富文本编辑：选区格式、混合态、撤销/重做、中文输入 | **缺失** | Vue无 editor 插件 | 独立 editor 插件输出受控 Delta；编辑历史局部存在，关闭销毁监听；表单只接收保存后的文档 | 加粗/改色/对齐/列表、undo/redo、IME composition；关闭草稿确认；重开一致 | **P4**。旧版：`src/rich-text.js:L186-L280,L282-L463,L509-L544`；浏览器：`tests/enhancements_browser_test.py:L87-L90,L144-L150` |
| 富文本安全链接与粘贴清洗 | **缺失** | Vue无对应能力 | URL 仅允许 http/https/mailto 且禁凭据/控制字符；粘贴先进入 inert DOM，再转白名单 Delta | 危险链接、`onerror`、script/svg/img 不进入活动 DOM；安全链接带 `noopener noreferrer` | **P4**。旧版：`src/column-rules.js:L39-L49`、`src/rich-text.js:L43-L46,L404-L420,L464-L508`；浏览器：`tests/enhancements_browser_test.py:L92-L95` |
| 列显示模板：字段 token、非递归展开、正式 renderer 复用 | **缺失** | Vue无 template 字段；当前单元格 renderer 只有 valueMap/文本 | `DisplayTemplateConfig` 保存受控 token；renderer registry 根据字段 ID 读取原始数据，禁止模板递归和可执行表达式 | 未知字段过滤；空白启用模板拒绝；模板只改显示，筛选/排序/导出仍用原值 | **P4**。旧版：`src/rule-settings.js:L140-L156`、`src/rich-text.js:L546-L559`；测试：`tests/rules.test.cjs:L72-L75,L118`、`tests/enhancements_browser_test.py:L101-L103` |

### 表格、只读数据工具与设置历史

| 旧版能力 / 交互 | Vue 状态 | 具体差异 | 新架构实现 | 测试（先 RED） | 优先级与证据 |
|---|---|---|---|---|---|
| 多字段排序与优先级 | **部分** | Vue类型允许数组、本地 core 也按数组排序，但点击表头总是替换为单字段；UI不显示多字段规则编辑与优先级 | QueryModel 保留 sorts 顺序；表头提供约定的追加手势，设置抽屉提供增删/移动；Provider原样收到数组 | 两级排序、稳定顺序、禁用某列后移除该规则、远程 query 完整透传 | **P1**。旧版：`src/table.js:L97-L105`；浏览器：`tests/customization_browser_test.py:L143-L157`。Vue：`src/core.ts:L6`、`src/BusinessTable.vue:L18,L52` |
| 表头列菜单：重命名、设置、筛选、排序、冻结、恢复宽度 | **缺失/部分** | Vue有独立列设置按钮和左右冻结，但没有表头菜单、重命名、取消排序、恢复默认宽度 | 将菜单 action 转换为稳定命令，调用同一设置草稿/QueryModel API | 右键/按钮可达；重命名不改 column.id；冻结状态、宽度和排序正确 | **P1**。旧版：`src/table.js:L61-L72`；浏览器：`tests/customization_browser_test.py:L137-L141` |
| 列宽拖动、键盘微调、双击恢复 | **部分** | Vue列设置用 range 输入保存宽度；VXE列上没有上述直接交互持久化链路 | VXE adapter 监听 resize end；键盘/双击调用同一 `setColumnWidth/resetColumnWidth`；仅持久化稳定 ID + width | 拖动 +48、ArrowRight +10、双击恢复定义宽度；保存失败仍保留草稿 | **P1**。旧版：`src/table.js:L34-L49,L118,L192-L223`；测试：`tests/browser_test.py:L441-L454`。Vue：`src/BusinessTable.vue:L17,L46,L51` |
| 多列左右冻结与选择列偏移 | **部分** | Vue把 `fixed` 直接传 VXE，双图标切换已存在；尚无多固定列、批量选择列、水平滚动回归 | Config 只存 left/right/false，offset 交给 VXE adapter；保留双图标直接操作 | 多左/右固定列、选择列同时存在，滚动后边界不重叠；点击已选一侧取消 | **P1**。旧版：`src/table.js:L80-L95,L186-L190`；测试：`tests/browser_test.py:L414-L438`。Vue：`src/BusinessTable.vue:L16,L45,L51` |
| 单元格正式渲染组合：映射、模板、条件标记、复制 | **部分** | Vue仅有 valueMap；没有模板、mark、copyable；不同能力尚未通过 registry 组合 | Cell render pipeline 固定顺序：raw value -> renderer/template -> decoration/mark -> affordance；业务值不变 | 同一列模板+映射+标记组合；复制显示值/原值策略明确；不修改 row | **P1/P4**。旧版：`src/table.js:L127-L175`；Vue：`src/BusinessTable.vue:L53` |
| 分组汇总（最多两级）与汇总导出 | **缺失** | Vue无 group 工具；旧版基于完整查询结果、金额用整数分、只读且不生成伪记录 | 扩展工具使用独立 adapter，Local 可在内存计算，Provider 需服务端 capability；不把 group header 注入 rows | 分组条数合计等于原 rows；BigInt 金额准确；打开/导出不改原排序分页 | **P4**。旧版：`src/column-rules.js:L487-L503`、`src/workbench.js:L13-L68`；测试：`tests/workbench.test.cjs:L5-L10`、`tests/enhancements_browser_test.py:L122-L124` |
| 记录对比：2–4 条、基准、只看差异、导出 | **缺失** | Vue无 comparison 工具 | 按 rowKey 选择，字段来源 ResolvedConfig；差异比较原始值，展示调用正式 formatter；Provider按 ID 补齐数据 | 2条以下提示、4条上限、变更基准、原始值差异、导出且 rows 不变 | **P4**。旧版：`src/workbench.js:L70-L121`；测试：`tests/workbench.test.cjs:L21-L26`、`tests/enhancements_browser_test.py:L126-L128` |
| 条件标记：按顺序首条命中，只改显示 | **缺失** | Vue无 marks；旧版复用筛选语义，规则无效时不执行 | `ConditionalStyleRule[]` 使用稳定列 ID 与安全样式 token；renderer 在行/单元格装饰阶段应用 | 优先级、禁用、无效列、颜色白名单；业务 status 不变 | **P4**。旧版：`src/column-rules.js:L504-L527`、`src/workbench.js:L123-L175`；测试：`tests/workbench.test.cjs:L12-L19`、`tests/enhancements_browser_test.py:L130-L132` |
| 设置历史：最近 20 次、查看差异、恢复前再留历史 | **缺失** | Vue没有历史协议或恢复行为 | 历史只保存 UserConfig/View 兼容快照，不含业务数据与临时 query；通过 codec 迁移后才恢复 | 上限20、差异字段、恢复设置不动 rows/query、损坏历史跳过、恢复前当前设置入历史 | **P4**。旧版：`src/workbench.js:L176-L205`；浏览器：`tests/enhancements_browser_test.py:L134-L136` |
| 区域选择、键盘扩选、复制和金额统计 | **缺失** | Vue无单元格范围状态；不要与整行 batch selection 混合 | 可选 range-selection 插件，坐标基于 rowKey + column.id；统计器按列类型注册；复制走统一 formatter | 拖动、Shift+方向键、Escape、Ctrl/Cmd+C；分页/列变更后清理失效坐标；与行选择互不影响 | **P4**。旧版：`src/workbench.js:L207-L337`；浏览器：`tests/enhancements_browser_test.py:L138-L140` |

### 导出、模板与 XLSX

| 旧版能力 / 交互 | Vue 状态 | 具体差异 | 新架构实现 | 测试（先 RED） | 优先级与证据 |
|---|---|---|---|---|---|
| CSV 导出字段白名单与公式注入防护 | **缺失** | Vue无 exporter；旧版 CSV 使用业务字段白名单，用户字符串以文本处理并中和公式 | ExporterAdapter 接收 resolved export definition；客户端 CSV encoder 统一处理 BOM、引号、换行和 `=+-@` 前缀 | BOM、公式注入、中文/换行、字段顺序、空字段拒绝 | **P3**。旧版：`src/export-data.js:L11-L51,L160-L180`；测试：`tests/export.test.cjs:L16-L18,L38-L43`、`tests/browser_test.py:L572-L586,L620-L631` |
| XLSX 保留编号文本、金额数值、日期类型和格式 | **缺失** | Vue无 XLSX；旧版生成真实 OOXML 并有独立解析验证 | 首选成熟受控库或隔离 writer adapter；BusinessTable 传 typed cells，不传 HTML；大数据走服务端 ExporterAdapter | ZIP/XML、openpyxl 独立读；ID 为 string、金额/日期为 numeric/date；中文和非法 XML 字符 | **P3**。旧版：`src/export-data.js:L52-L82`、`src/xlsx.js:L17-L99`；测试：`tests/export.test.cjs:L19-L27,L70-L78,L88-L92`、`tests/verify_workbooks_openpyxl.py:L35-L74` |
| 导出显示值 / 原值 / 两者 | **缺失** | Vue valueMap只影响屏幕显示，无导出协议 | 列定义声明 raw accessor 与 display formatter；`both` 为两个显式字段，标题标注原值/显示值 | mapping与数字格式的三种 valueMode；不改原始 row | **P3**。旧版：`src/export-data.js:L36-L45,L52-L82`；测试：`tests/export.test.cjs:L94-L110`、`tests/enhancements_browser_test.py:L109-L115` |
| 金额合计、超大数精确文本、导出说明 | **缺失** | Vue无导出合计/metadata | 汇总策略按字段注册；能安全表示时输出 numeric + SUM，超过精度阈值输出明确文本；查询说明独立 sheet | SUM范围、缓存值、超大合计、metadata含筛选/排序；百分比默认不求和 | **P3**。旧版：`src/export-data.js:L84-L107,L128-L158`；测试：`tests/export.test.cjs:L58-L69,L112-L120` |
| 导出当前样式和个人列名 | **缺失** | Vue无导出配置；旧版可选使用当前样式/别名 | 导出定义默认使用项目字段名；用户必须显式选择别名/样式；映射 CSS token 到有限 Excel style | 别名、字体、字号、对齐、颜色、条纹；默认不受个人列名影响 | **P3**。旧版：`src/export-data.js:L36-L45,L109-L126`；测试：`tests/export.test.cjs:L28-L37`、`tests/customization_browser_test.py:L250-L255` |
| 导出范围：全部查询、当前页、选中、单条 | **缺失** | Vue无 export flow；Provider 模式不能把“全部”误实现成浏览器拉全量 | 统一 ExportRequest；Local 可切片，Provider 的 `all` 必须调用服务端 ExporterAdapter，selected/single 用稳定 rowKey | 各范围文件只含目标行；Provider all 不调用普通 query 拉几十万行 | **P3**。旧版：`src/export-dialog.js:L95-L105,L136-L170`；测试：`tests/browser_test.py:L589-L604`、`tests/customization_browser_test.py:L272-L275` |
| 导出字段显隐、顺序、预览 | **缺失** | Vue无 dialog；旧版可拖动/上下移动、仅当前显示列、最多预览前10条 | ExportDialog 维护局部 options；预览复用实际 export cell pipeline，禁止执行下载副作用 | 改序、全不选禁用、visible-only、预览前10且与文件首行一致 | **P3**。旧版：`src/export-dialog.js:L95-L130,L178-L192`；测试：`tests/customization_browser_test.py:L257-L265` |
| 导出方案 CRUD（最多20、名称去重） | **缺失** | Vue无 export preset 模型 | ExportPreset 作为独立用户配置片段，走 schema/version/persistence conflict；按规范化名称判重 | 新建、更新确认、删除确认、重载恢复、上限与非法字段清洗 | **P3**。旧版：`src/export-data.js:L201-L210`、`src/export-dialog.js:L15-L67`；测试：`tests/customization_browser_test.py:L267-L270` |
| 下载模板固定业务字段，不跟随当前列显隐/别名 | **缺失** | Vue无模板下载 | `TemplateDefinition` 由宿主业务显式提供字段与校验；与 UserConfig 分离；ExporterAdapter 生成 | 隐藏/改名业务必填列后，模板仍含原字段名和校验；空白区没有示例数据 | **P3**。旧版：`src/export-data.js:L11-L23,L182-L199`；测试：`tests/export.test.cjs:L44-L57`、`tests/customization_browser_test.py:L277-L283` |
| 受限 XLSX writer：工作表/行列上限、公式白名单、名称校验 | **缺失** | Vue无 writer | 若保留客户端 writer，封装成内部 adapter，限制尺寸/名称/公式；禁止外部公式、宏、链接资源 | 非 SUM 公式拒绝、重复/非法 sheet name、超行列限制、NaN/Infinity 拒绝 | **P3**。旧版：`src/xlsx.js:L64-L99,L157-L176`；测试：`tests/export.test.cjs:L19-L27,L70-L78` |

### 明确不是“旧版功能丢失”的边界

| 旧版能力 / 交互 | Vue 状态 | 具体差异 | 新架构实现 | 测试 | 优先级与证据 |
|---|---|---|---|---|---|
| Excel 导入 | **旧版本来未实现** | 旧版只有模板下载和导出，模板说明明确“没有 Excel 导入入口” | 未来若做，单列 ImporterAdapter/校验/预览/提交，不复用 exporter 假装导入 | 文件 schema、逐行错误、幂等提交、权限与服务端校验 | **非迁移缺口；未来 P3**。`src/export-data.js:L182-L193`、`README.md:L54` |
| 后端登录、权限、审批 | **旧版本来未实现** | 旧版是本地前端演示；只读预览也不是权限校验 | 新版 action/tool/export 可见性仅改善 UI，真实权限必须由宿主服务端执行 | 无权限 API/导出/修改必须由服务端拒绝；隐藏按钮不作为测试结论 | **非迁移缺口；宿主集成要求**。`README.md:L50-L55` |
| 批量修改、后台任务 | **旧版本来未实现** | 旧版只有批量选择/删除/导出，没有批量字段修改和后台 job | 未来通过宿主 action / job adapter 接入 | 服务端幂等、进度、失败重试、权限 | **非迁移缺口；未来能力**。`README.md:L54` |
| 远程筛选选项 | **旧版本来未实现** | 旧版选项源只有 data/mapping/manual；新版长期要求 remote-options | 新增 FilterOptionsProvider，带 abort、sequence、分页/搜索 | 旧响应不覆盖新搜索；typed value 保留；错误可重试 | **新增要求 P1**。旧版：`src/column-rules.js:L35-L37` |
| 服务端大数据导出 | **旧版本来未实现** | 旧版限制本地一次最多 `MAX_ROWS` 并在浏览器生成；新版要求大数据不拉全量 | ExporterAdapter 创建服务端任务或下载 token | `all` 范围不走普通 query；任务失败/过期；权限 | **新增要求 P3**。旧版：`src/export-data.js:L46-L50`、`src/export-dialog.js:L8-L11,L153-L169` |



## 5. 源码覆盖与设计决策

全部生产模块已分工逐文件阅读：

| 范围 | 旧版文件 | Vue 对照 |
|---|---|---|
| 页面、业务数据与写入 | index.html、config、core、repository、forms、app | demo/App.vue、mock.ts、BusinessTable.vue、core/types/persistence |
| 外观、交互和设置 | styles/custom/enhancements/refinement.css、ui、menus、actions、toolbar、customization、experience、settings、settings-preview | style.css、BusinessTable.vue、ViewConfig/Action/UserColumnConfig |
| 规则与扩展 | column-rules、column-filter-ui、rule-settings、rich-text、workbench、table | core.ts、types.ts、BusinessTable.vue |
| 输出 | export-data、export-dialog、xlsx | 当前无对应实现 |
| 验证与设计 | README/V3-README/DESIGN/TOKENS/TEST-REPORT、Node tests、浏览器tests、工作簿独立验证、截图 | Vitest、mount、Playwright、verify.yml、build/审计脚本 |

所有旧模块都保持参考用途。可复用的是产品契约和测试场景，新代码继续使用现有 Vue 架构；按必要性逐步拆出配置 codec、Query 生命周期、设置草稿、renderer、overlay、导出 adapter，不一次性建立全部抽象。

旧版只读工具的上限（组合条件30、对比2–4、历史20、导出方案20等）是参考默认值，宿主可配置的限制应明确建模。当前阶段不擅自扩大到无限数据，不照搬旧报价字段白名单为全局限制。

## 6. 分批计划与 feature 分支

每批从当时最新 main 创建 feature，只提向 development；集成 CI 真正全绿后，发布时由 development→main。下一批需先核实 main 已包含所依赖批次；不从旧main重复实现尚未发布代码。基线有问题时允许在 feature 上先修复并验证，禁止把失败改成忽略或跳过。

| 批次 / 建议分支 | 范围与依赖 | 验收重点 |
|---|---|---|
| 1 `feature/legacy-foundation` | 原包/矩阵；修复基线高度反馈和错误漏检；锁文件/SFC审计；P0 Provider请求生命周期与旧版分页收敛 | TDD RED→GREEN；乱序/取消/卸载/分页；dev和生产Demo；全部浏览器错误0；原包145文件哈希一致 |
| 2 `feature/config-protocol` | TableDefinition/UserConfig/View分层、Zod codec、schema迁移、ID校验、Persistence版本冲突；依赖1发布 | 非法/旧配置、分层不串值、409和写入失败、公共1.0接入兼容 |
| 3 `feature/table-settings-v2` | 列名/显隐/拖动/宽度/左右双图标/对齐；统一草稿、应用、取消、错误定位；依赖2 | 取消不落盘、一次保存、键盘替代拖动、冻结互斥、滚动/焦点保持 |
| 4 `feature/table-appearance` | token、三档密度、字体/颜色/换行、表头槽、状态标签、当前对象/整表预览；依赖3 | 桌面/320/390/768、长文字20px、不裁行、预览无副作用、hover/focus/disabled |
| 5 `feature/column-rules` | 多字段/三态排序、typed mapping、数字/百分比、完整筛选模型与选项来源；依赖2/3 | 原始类型与单位不变、空/0、全量本地计数、远程取消、筛选→排序→分页 |
| 6 `feature/views-and-toolbar` | View CRUD/默认/系统个人，稳定tool配置、双层工具栏、More、Action权限/禁用/溢出/二级菜单；依赖2/3 | 来回切View不串配置、固定入口、窄屏可达、键盘/回焦、disabled不执行 |
| 7 `feature/quotation-demo-parity` | 六条原始业务数据、完整查询、CRUD/详情/复制/批选及业务JSON恢复；仅Demo/宿主代码 | 通用src不含报价逻辑；版本冲突；取消/失败保留数据；跨页选择语义 |
| 8 `feature/export-adapters` | CSV/XLSX/范围/方案/预览/模板、ExporterAdapter及服务端大数据；依赖5/6 | 实际文件独立解析、类型/公式安全、模板不受列隐藏影响、Provider不拉全量 |
| 9 `feature/renderer-editor-registry` | 受控富文本、模板、试算/预览和可选插件；依赖2/4/5 | 白名单/资源限制、IME、撤销、回填与保存分离、无eval/动态template |
| 10 `feature/table-data-tools` | 组合筛选、条件标记、分组/对比、区域统计、历史/撤销；依赖前述协议与renderer | 只读不改业务行、完整查询范围、精度、行选/区域选独立、恢复前备份 |

批次不是大功能一次合并：每个分支仍按可验证子功能提交。Action基础、Overlay等跨批前置可独立小PR，但必须在矩阵注明归属和依赖。

## 7. 第一批执行记录（历史记录）

范围已按用户要求直接执行，不等待新的方案确认。使用当前会话的独立克隆，main保持原始提交；生产变更仅发生在从最新main创建的feature中。

- 分析：完成原包校验、源码/测试/视觉对照、矩阵和分支拆分。
- 基线：旧脚本PASS；严格浏览器检查FAIL，原因及证据见第1节。
- 本批已实现：Provider取消/序列保护/卸载和切换源、独立查询快照、Local页码收敛与页尺寸重置、Remote越界补查保留原查询、搜索/排序/View无重复请求。
- 本批已修复：VXE高度反馈、列设置面板遮挡自身入口、慢请求缺Loading组件；保留左右冻结双图标与现有入口。
- 本批门禁：纳入SFC audit、pnpm 10.17.1锁文件及frozen安装、开发+生产Demo预览、原生窗口错误和未处理拒绝捕获；依赖版本约束未变。
- TDD：原布局错误RED→GREEN；16个查询/分页场景RED→GREEN；独立审查补充的未提交搜索草稿和嵌套Vue代理2例RED→GREEN。未通过删除/忽略断言取得绿色。
- 完整本地Release Gate：**PASS**，frozen install退出0，portability/SFC/vue-tsc/mount/声明/library/Demo构建均PASS，Vitest **22/22**、Playwright **4/4**（开发3、生产预览1）；console.error、pageerror、window error、unhandledrejection均 **0**。
- 产物预览：四行表体192px，未再出现自动增高；这只证明本批布局修复，不代表旧版视觉已全部迁移。
- 完整性：145文件磁盘与Git暂存blob均逐文件SHA-256一致；src/正式构建入口和产物未引入reference；旧测试产物在原包目录外。
- 独立审查：2项P2已修复并覆盖回归；无遗留阻止本批集成的问题。远程CI以本批PR实际结果为准，不能用此处本地PASS代替。
- 远程验证：[PR #2](https://github.com/gw-hhh/business-table/pull/2) 指向development；代码提交 `cb78255615b06c62e5e30f5598458c216ebe4061` 的 [完整GitHub Actions](https://github.com/gw-hhh/business-table/actions/runs/35570481300) 已真实 **SUCCESS**。这是feature的验证记录，main尚未合入本批。
- 下一批：`feature/config-protocol`，配置分层、稳定ID校验、codec/migration、Persistence异常及版本冲突；该批仍须从已包含本批的最新main开始。
- 尚未完成的UI、设置、协议、导出和高级扩展仍保持上文的部分/缺失状态。

## 8. Master Handoff 接续批次（历史记录：配置运行时前置批次）

本节记录视觉还原前的架构前置批次；其中“本批”和未完成项均指当时状态，**最新完成项、门禁和剩余缺口见第9节**。需求优先级仍为：用户最新指示 → `BUSINESS-TABLE-CODEX-MASTER-HANDOFF.md`（100节）→ 本矩阵中的产品完整性基准 → 旧规范中不冲突的约束。第6节原计划保留追踪用途。

### 已核实的基线和交付方式

- 第7节的远端状态是历史记录。PR #2 已进入 development，PR #3 已进入 main；当前 main 为 `d06979f428cf52bd401a1e41589c190272474a56`。
- 在该 main 上重新执行 frozen install 和完整 Release Gate，退出码均为0；Vitest 22/22、Playwright 4/4，类型检查、SFC/可移植性审计、库/声明/Demo构建通过；四类浏览器错误均为0。日志为本次本地实测，不能替代后续 feature 验证。
- 从该 main 创建本地 `feature/config-runtime`。遵照用户最新安排，继续本地开发、测试、预览和提交；用户验收前不推送、不创建新PR、不修改远端分支。验收后仍遵循 feature → development → main。
- 旧包145个文件继续原样保留；新生产代码不得引用 reference。

### 本批架构迁移矩阵

| 旧版能力 / UI / 交互 | 当前 Vue 状态 | 差异 | 新架构实现方式 | 测试要求 | 优先级 |
|---|---|---|---|---|---|
| 简单表格与可选工具栏 | 原1.0入口总创建搜索/视图/设置/More状态 | 最简调用应只有Core表格分页 | 显式Feature Gate；兼容旧title/views/actions代码声明；Demo显式启用原有入口 | 最简挂载无高级DOM；OFF详情getter/工厂计数为0；原22测试保留 | P0 本批 |
| 配置恢复、非法字段容灾 | 只有schema1完整快照，直接合并 | 无版本迁移、局部校验及诊断 | Zod外壳+逐字段校验；自有Preference v1→v2→v3；远端仅可覆盖白名单 | 损坏JSON、错误版本/表ID、重复列ID、部分坏字段保留其余数据 | P0 本批 |
| 必选列、固定列、列宽 | 显隐/冻结/宽度均无能力Guard | 用户/视图/远端可突破代码约束 | Access/Default/Capability/Constraint分层；UI与写入共用Guard | 锁定列checked/active且disabled可见；合法宽度可改；非法覆盖被拒绝 | P0 本批 |
| 列设置入口与面板 | 同步内置UI与状态 | 无default/custom/headless及延迟加载 | 分离ColumnSettings；首次交互加载；共享受Guard的Context；关闭/卸载取消迟到结果 | 交互前不读详情/不加载，首次1次、后续复用；失败隔离；custom/headless实际挂载 | P0 本批 |
| 视图布局与个人布局 | 切View把列覆盖写进个人config | 清除/切换后可能串值 | Preference和View列布局分层解析 | A→B→清除恢复个人布局；不改输入、不发个人保存 | P0 本批；View CRUD后续 |
| 操作列、More及显示渲染 | 直接传Action函数；无Registry | 配置不能安全引用稳定ID | 代码Registry；Allowed ∩ Registered ∩ Visible；禁用状态保留；未知renderer文本回退 | 重复注册不覆盖；未知ID诊断跳过；远端不能注入handler；disabled不执行 | P0 本批基础；完整溢出/菜单后续 |
| 设置失败与加载反馈 | Provider已具备取消保护；偏好失败会阻止加载 | 配置错误不能拖垮数据主流程 | 配置诊断回调与安全默认值；偏好失败后继续Core加载 | 加载/保存失败无unhandledrejection；数据可用；四类浏览器错误0 | P0 本批 |

### 当时的分支拆分与未完成范围

1. `feature/config-runtime`：本表P0可验证闭环。保留旧schema1 Persistence，新入口通过preferenceChange输出schema3 Delta；不会把新协议塞进旧适配器。
2. `feature/settings-draft-layout`：设置草稿/应用/取消、拖动和键盘排序、完整列能力编辑、Layout/Toolbar与Headless适配。
3. `feature/search-view-runtime`：完整Search/View Runtime、typed筛选、视图CRUD及远端适配。
4. 原第6节视觉、报价Demo完整性、导出、渲染/编辑及数据工具批次按依赖继续，全部旧版功能仍在第4节逐项追踪。

本批不宣称完整Data Headless Runtime、全部高级Feature或旧版UI已迁移。配置工厂与注册表通过单测仍不足以完成本批，必须真实接入组件并通过完整门禁。

### 本批完成情况

| 条目 | 本地feature结果 | 仍待迁移 |
|---|---|---|
| Definition/Preference/Schema | 已接入ConfiguredBusinessTable；逐字段回退、自有版本迁移、差量输出、列ID和能力Guard | 旧报价偏好适配、版本冲突 |
| Feature Gate/生命周期 | 代码优先，OFF短路；默认UI按需加载；激活后的权限收窄、加载中变更、关闭及卸载有回归 | 尚未实现的高级Feature |
| 列设置 | 默认/custom/headless共用受Guard上下文；左右图标、受限侧禁用、可用滑块和窄屏工具栏 | 草稿、应用/取消、完整Drawer、排序编辑 |
| Views | 列配置独立覆盖层，切换与清除恢复个人布局 | View CRUD、权限和完整Runtime |
| Registry | 类型化ID注册；rowAction和renderer真实接入；未知项回退；坏扩展局部隔离 | 其他Registry槽的完整功能接入 |
| 数据与原API | 原有22项查询/基础测试保留；异步pageSize配置同步；旧Persistence仍schema1 | 完整报价业务迁移 |
| UI与视觉 | 修复窄屏按钮换行、滑块宽度、禁用与焦点状态；保留原valueMap样式 | 第3节所有未完成的密度、字体、布局、抽屉、菜单等仍需逐项迁移 |

完整结果及本批边界记录在[本地验收记录](CONFIG-RUNTIME-ACCEPTANCE.md)，接入和兼容变化见[配置入口](CONFIGURATION.md)。

## 9. 旧版视觉还原批次（当前有效）

### 基准、分支和验收范围

用户最新要求以旧版 `index.html` 及六张截图还原外观和交互。本批沿用尚待用户验收的本地 `feature/config-runtime` 修正与补齐，不另起脱离现有实现的页面。main 基线仍是第8节已验证的 `d06979f428cf52bd401a1e41589c190272474a56`；下面的 **137/32** 是本地 feature 最终完整门禁结果，不是 main 或远端 CI 的结果。用户验收前不推送；后续集成继续执行 feature → development → main。

旧版样式按 `styles.css → custom.css → enhancements.css → refinement.css` 的实际级联核对。六种参考画面为主页面、行 More、页面 More、我的视图、快捷列设置、完整设置抽屉。1920×945 目标是主卡片 `(24, 96, 1872, 810)`、表头 **44px**、截图中的双行记录 **73px**、表格工具栏 **56px**、底栏 **57px**。旧版初始普通密度的双行记录约61px，与用户截图的已保存设置不同，不能用初始默认值替代截图目标。同步核对14px正文、12–13px辅助文字、36px查询控件、蓝色 `#2468e8`、6/8px圆角和背景/边框层级。

本批通过真实浏览器几何、语义与交互验收，并对照参考画面检查。没有建立用户截图的逐像素差分基线，不能把布局断言通过写成“所有旧版视觉已逐像素一致”。旧 reference 继续只读；通用 `src/` 保持配置驱动，报价字段、表单、示例数据和文件操作位于 Demo/宿主，不引用旧实现。

### 本批视觉与交互迁移矩阵

| 旧版能力 / UI / 交互 | 当前 Vue 状态 | 差异及剩余范围 | 新架构实现方式 | 测试要求与本批证据 | 优先级 |
|---|---|---|---|---|---|
| 页面层级、查询区、主卡片、表体留白和固定底栏 | **已实现本批参考布局**：页头、两行查询、工具栏、条件条、表格和分页分层；1920×945几何目标覆盖 | 任意宿主容器、全部字号/密度组合仍需后续扩展验证 | Demo负责页面布局；通用表格提供查询、工具和汇总插槽，受限高度内由表格滚动 | Playwright断言卡片坐标/尺寸、44px表头、73px记录、底栏位置；390px无文档横溢 | P1 本批 |
| 字号、行距、配色、边框、状态标签、双行项目/客户 | **已实现对应外观**：链接、辅助文字、浅底状态标签、hover/focus/disabled和细分隔线 | 任意映射图标/边框、完整字体选择与全部主题组合未完成 | 作用域样式与通用单元格渲染；Demo提供双行字段和状态映射 | 页面和六种参考状态对照；正文/表头几何与正式表对齐浏览器验证 | P1 本批 |
| 行操作和 More：查看/修改、分隔、危险操作、导出子菜单 | **已实现菜单子集**：浮层不受单元格裁剪，键盘导航、Escape/返回与回焦；长菜单可滚动，子菜单限制在视口内 | 行内最大数量、真实宽度自动收纳和操作外观编辑仍未迁移 | 通用 `RowActions`/菜单组件读取代码 Action 描述；回调前按最新配置重检完整祖先链，父节点隐藏/禁用后子项不能继续执行 | 单测覆盖祖先权限变化、禁用、外部关闭、子菜单和长菜单；Playwright覆盖实际菜单位置与Escape回焦；390×240长菜单另作浏览器检查 | P1 本批；外观配置后续 |
| 页面 More：备份、恢复、示例数据、说明 | **已实现 Demo 流程和菜单外观** | 不等于通用 Header/Toolbar Runtime 或旧备份协议兼容 | 页面工具由宿主提供；报价数据导入导出与表格偏好分离 | 页面 More 可达、外部点击关闭；JSON整批校验测试，损坏/重复记录拒绝 | P1 本批子集 |
| 我的视图：列表、默认、改名、顺序、删除、更新/另存 | **已实现 Demo 本地流程和弹层外观**；切换“全部报价”改变数据范围 | 服务端视图权限、版本冲突、完整 Search/View Runtime 未完成 | Demo管理命名视图；通用层保持查询快照与 View/Preference 覆盖分离，不持久化VXE对象 | 弹层宽度/实际切换；独立快照、损坏视图、隐藏列保留、离开View恢复个人偏好；切换后清理选择 | P1 本批子集 |
| 280px快捷列面板：显隐、全选、拖动、双冻结图标、恢复/确认 | **已实现草稿闭环**：取消不改正式配置；锁定列仍可见且受Guard保护；键盘可调整顺序 | 完整旧版批量样式复制不属于快捷面板本批范围 | 独立draft经能力Guard一次提交；左右冻结互斥；更多设置接续同一draft | 单测覆盖取消、确认、全选、锁定、键盘顺序、恢复；Playwright覆盖280px、双pin和取消；关闭完整抽屉后快捷入口仍打开快捷面板 | P1 本批 |
| 1040px设置抽屉：页签、列侧栏、基本编辑、固定底栏 | **已实现基本设置子集**：列名、宽度、显隐、允许排序、冻结；dirty状态、应用/取消及关闭确认 | 高级页签尚未完成；完整错误定位、所有设置页滚动记忆和持久化冲突恢复仍待补齐 | default/custom/headless继续共享受Guard上下文；抽屉草稿与已应用配置分离 | 无修改应用禁用；草稿接续/预览/一次应用；恢复仅改草稿；dirty关闭确认；取消不保存；390px表单可用 | P1 本批子集 |
| 表头与正文的字体、字号、字重、对齐、颜色 | **已实现受控基础编辑和正式表应用** | 旧版字体搜索、完整色板、所有批量样式能力尚未迁移 | 自有类型化style字段与白名单；能力声明控制可编辑项；预览和正式表读取解析后的样式 | 非法样式/能力校验、合法偏好保留、与默认相同的差量清理；浏览器验证表头右对齐作用于正式VXE表头 | P1 本批子集 |
| 多字段排序设置与草稿预览 | **已实现抽屉排序规则子集**：添加、删除、优先级、应用/取消 | 表头筛选、完整列菜单及拖宽持久化仍按原矩阵追踪 | 设置通过稳定列标识查找列，提交现有field/order查询协议；预览排序不提前改变正式查询 | 单测验证预览结果、一次提交和取消新增/删除规则 | P1 本批子集 |
| 当前对象/整表预览与收起 | **已实现无业务副作用预览子集** | 映射、模板、试算和未迁移设置不能在预览中冒充可用 | 预览读取draft解析结果并保持 `inert`；正式配置只在应用后改变 | 编辑前后正式表隔离、预览内容变化、取消与应用；预览不触发业务操作 | P1 本批子集 |
| 复选、页内全选/半选、查询与视图切换、记录更新 | **已实现 opt-in Selection 子集**：以rowKey维护选择，查询/View切换清理；更新后批量操作取得最新行数据 | 远端“选中全部结果”token和全部跨页策略未完成 | 通用Selection状态与业务批量handler分离，不保存私有行对象协议 | 未启用不渲染选择；选择事件、查询清理、最新行对象与View回归测试 | P1 本批子集 |
| 客户/状态/负责人/大区/日期/关键词查询、条件条、汇总分页 | **已实现 Demo 本地查询子集**：草稿提交、展开、条件反馈；默认三条截图记录和合计376,510.00 | 完整typed列筛选、远程选项、多范围聚合仍待迁移 | 宿主组合业务条件；表格接收隔离查询快照、回首页、显示汇总；不把报价逻辑写入Core | 组合条件和包含端点日期测试；独立查询、默认三行、视图切换与分页布局浏览器验证 | P1 本批子集 |
| 报价新增、修改、详情、复制为草稿、删除确认 | **已实现 Demo 本地流程**，不再仅显示handler文案 | 旧版整数分/状态编码协议适配、并发版本、跨标签页通知和全部业务校验仍需专项迁移 | 独立Demo model、表单和dialog；稳定行ID与局部数据更新 | 必填校验、复制新ID且不改原记录、修改不影响其他行；Dialog首次聚焦、Tab边界和关闭回焦 | P1 本批子集 |
| JSON备份恢复、CSV导出和模板入口 | **已实现 Demo 本地子集** | 当前JSON为新版Demo协议；没有宣称直接兼容旧备份。Excel、完整导出范围/方案/映射格式与独立ExporterAdapter未完成 | 业务数据独立校验后替换；CSV由宿主生成，通用表格只提供入口/handler | JSON往返、坏记录和重复ID在替换前拒绝；其余格式必须另做实际文件独立解析验收 | P2 部分 |
| 小屏、鼠标/键盘、弹层焦点与禁用状态 | **已实现本批覆盖场景**：390px页面和抽屉无文档横溢；表格允许内部横滚；菜单和Dialog键盘可用 | 全部旧版组合控件、嵌套弹层及320/768等完整矩阵尚未全部覆盖 | 页面响应式与组件范围样式分离；菜单视口约束；Dialog焦点管理；不削弱可用控件尺寸断言 | 窄屏测试保留滑块宽度要求；主/子菜单、Escape/回焦、禁用和父条件重检；四类浏览器错误均0 | P1 本批子集 |

### 本批测试及 Release Gate

新增/扩展测试按行为归属记录：

- `tests/presentation.spec.ts`：外部查询快照、选择、一次设置提交、快捷/完整入口切换、隐藏列的View快照、最新选中行和View编辑隔离。
- `tests/column-settings.spec.ts`：草稿确认/取消、双冻结与锁定、键盘顺序、完整抽屉、dirty关闭、样式能力与排序预览。
- `tests/action-menu.spec.ts`：菜单键盘/回焦、子菜单、禁用及动态祖先权限、长菜单视口约束。
- `tests/quotation-model.spec.ts`、`tests/quotation-dialog.spec.ts`：Demo组合查询、CRUD、JSON/视图校验与Dialog焦点。
- `tests/e2e/visual-parity.spec.ts`：8个参考布局和真实交互场景，在开发与生产预览中执行；覆盖主页面、行/页面More、视图、快捷列、完整抽屉、390px和正式表头对齐。保留原有配置、查询、Provider与基础回归测试。
- `tests/e2e/text-style.spec.ts`：1个真实字号场景，在开发与生产预览中执行。先复现项目/状态20/32px配置被固定14px覆盖，再验证正式表与预览一致、主副文字不裁切；默认14/12px、22/18px行距及73px行高保持。合计新增9个浏览器场景。

上述Bug与功能以真实失败用例推进；菜单祖先权限、快捷入口复用、选择行更新及正式表头对齐均补充了回归。完整门禁首轮发现390px抽屉双列表单使列宽滑块仅167px，未满足已有可用宽度断言；将该断点改为单列表单后重新运行完整门禁，**没有放宽或删除断言**。

第二轮137/30完整门禁通过后，截图复核发现Demo自定义项目/状态单元格字号被固定14px覆盖，已按TDD修复并新增浏览器回归。另取消无头浏览器默认隐藏滚动条的启动参数，让门禁与用户浏览器一致；抽屉整表预览达到y657/高227，并覆盖页签无意出现的1px垂直溢出回归。最终门禁以补充修复后重新执行的结果为准。

| 最终本地完整 Release Gate | 实际结果 |
|---|---|
| `verify:release` | **PASS，退出码0** |
| 可移植性审计、SFC审计、`vue-tsc` | **PASS**；生产代码与旧reference保持隔离 |
| Vitest | **137/137 PASS** |
| 声明、library与Demo构建 | **PASS** |
| Playwright（开发 + 生产预览） | **32/32 PASS**（开发17、生产预览15） |
| `console.error` / `pageerror` / `window error` / `unhandledrejection` | **0 / 0 / 0 / 0** |
| 验证范围 | 本地feature代码；不代表远端CI已运行、main已发布或所有旧功能已完成 |

完整文件清单、验证与验收入口见 [VISUAL-PARITY-ACCEPTANCE.md](VISUAL-PARITY-ACCEPTANCE.md)。旧包145/145文件SHA-256再次核对一致；依赖版本和锁文件保持不变。构建保留既有UMD混合导出和包体积提示，不能将这些提示与浏览器运行错误混为一谈。

### 剩余缺口与后续拆分

1. **P1 高级列设置与规则**：typed映射、模板、试算、完整列筛选/选项、富文本与批量样式；补齐实际编辑、预览、校验和应用闭环。建议后续 `feature/column-rules` 按可验证子项拆分，继续使用现有配置/草稿/renderer。
2. **P1 操作与工具栏配置**：操作/工具名称、形式、顺序、对齐、间距、固定项、真实宽度自动More及完整外观设置；当前可见菜单和Demo工具不代表这些配置已完成。建议 `feature/toolbar-action-settings`。
3. **P1 配置与Search/View Runtime**：完整Headless/远端适配、服务端权限、`expectedVersion`/409冲突及保留草稿重试；Demo本地View CRUD不替代通用Runtime。建议 `feature/search-view-runtime` 与小范围Persistence冲突批次分开验证。
4. **P2 输出与业务完整性**：独立ExporterAdapter、Excel、导出范围/方案/模板/映射格式、旧业务备份显式转换、金额精度和并发存储。建议 `feature/export-adapters` 与Demo业务协议适配分别实施；必须解析真实输出文件并验证失败不损坏数据。
5. **后续完整性**：原第4节组合筛选、条件标记、分组/对比、区域统计、历史/撤销等继续逐项保留，不因主界面接近参考就删除；完整键盘、密度/字号和响应式组合也需随相应功能补足。

本批仍只申明上表明确列出的子集完成。后续新feature必须以已包含依赖批次的最新main为起点；当前本地视觉修正先按用户安排预览验收，再沿原分支流程集成，不跳过任何门禁。

## 10. 2026-09-22 持续精修（从 550efb2 分支，不重做 main）

用户明确指定沿用 `feature/config-runtime@550efb28da9a8108005cac379cc0bb7235aa597e`，并同意另建 `feature/visual-parity-refinement`。原 feature、development、main 不改。本次先记录差异再测试；本次开始时的完整本地 Release Gate 为 137/137 Vitest、32/32 Chromium（开发及生产），退出 0。已通过授权 GitHub CI 导出源码/锁定依赖；本地文件树与 `e9902d7` 完全一致（相对550efb2仅增加复核工作流），不是早期main代码。

当前快照含完整 Master Handoff 100 节；未含 `CODEX-EXECUTION-BRIEF.md` 和 `BUSINESS-TABLE-CODEX-FINAL-SPEC.md`，不声称已阅读缺失文件。本批限于用户已经确认的原版视觉/交互对齐，不擅自推断新的架构条款。旧原包保持只读，主页面上一轮的客户视图、73px宽松密度和全部配置不因本批被重置。

| 项目 | 550efb2 实际差异 | 本批修复与测试目标 | 当前状态 |
|---|---|---|---|
| 字体控件 | 只有3种通用字体，缺少系统/微软雅黑/苹方/宋体/等宽字体和搜索入口 | 内置白名单字体选项及模态搜索；支持取消、无结果、方向键、Escape只关子窗并回焦；不下载字体 | 本批已实现并验证 |
| 常用色板与默认语义 | 缺色板；无覆盖值时文本框显示固定 `#29384e`，不能区分继承 | 空值显示“跟随默认”；8个旧版常用色；选择只改草稿，默认按钮删除覆盖；底部空间不足时向上展开 | 本批已实现并验证 |
| 颜色错误 | 非法颜色在Guard被丢弃但编辑器没有错误反馈 | 保留原输入和预览最后合法值；阻止应用；切列后仍可定位并修正错误 | 本批已实现并验证 |
| 对齐分段 | 鼠标可点，缺少左右/Home/End键与单一Tab停靠点 | 复用现有style/guard，键盘与鼠标同语义，禁用项不执行 | 本批已实现并验证 |
| 快捷列细节 | 隐藏列无划线；隐形冻结按钮仍接收指针；触屏缺显式上下移动入口 | 按旧版划线、hover/focus显示、触屏常显及移动按钮；保留锁定位置和共享草稿 | 本批已实现并验证 |
| 编辑上下文 | 向下滚动后当前列名称和分区入口消失 | 固定当前编辑列与分区栏；不遮挡当前字段，不改变抽屉外框和整表预览位置 | 本批已实现并验证 |

验证：所有行为先补失败测试；新增浏览器用例同时跑开发/生产，实际截图保存于本次精修验收包。视觉只声明本批已对照的细节，不等于高级页签/所有旧功能全部迁移。


本批最终本地 `verify:release` 退出 0：Vitest **151/151**，Playwright **46/46**（开发24、生产预览22）；portability/SFC/type-check/声明/library/Demo build 均通过。四类浏览器错误为0，reference **145/145** 字节与哈希一致。新增14项单元用例、7个浏览器场景（开发与生产各执行一次）。旧冻结回归测试增加真实悬浮步骤和可点击状态断言，原有左右切换断言全部保留，没有放宽门禁。

自查补测并修复：批量复制样式后的旧颜色输入缓存；只有非法颜色的草稿关闭确认；字体搜索继承表单padding的偏差；色板被预览区截断。阶段缺口仍见第9节。完整文件清单、验证范围和注意事项见 `VISUAL-REFINEMENT-ACCEPTANCE.md`。产品修改仅本地提交，尚未推送到远端，不代表GitHub该分支已包含本轮UI修正。
