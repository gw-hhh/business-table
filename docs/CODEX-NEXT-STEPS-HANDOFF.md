# BUSINESS-TABLE Next Steps Handoff

## 开发前必须阅读

1. CODEX-PROJECT-CONTEXT.md
2. BUSINESS-TABLE-CODEX-MASTER-HANDOFF.md
3. CODEX-DEVELOPMENT-RULES.md
4. CODEX-CURRENT-STATE.md
5. CODEX-NEXT-STEPS-HANDOFF.md

## 执行原则

不要以补丁方式开发。

如果当前设计无法支持需求：

优先重构底层架构。

禁止：

- App.vue 堆逻辑
- 页面特殊判断
- 临时状态
- 重复 Feature

## 后续任务

### BT-01 Query Runtime

已在 `feature/visual-parity-refinement` 实现：迁移搜索、高级查询、查询状态和 View 中的 Search 值保存。提交与 Release Gate 结果以当前分支和验收记录为准。

### 设置策略与工具接入增量

当前代码已统一设置显示与只读：直接入口 settingsDefinition，配置入口 definition.settings；pages、columnSections、column.configurable 三层交集。缺失、false、enabled:false 或 visible:false 均隐藏，true 可编辑，显式 disabled 才只读。远端只能收窄；设置写入守卫覆盖默认 UI、Custom、Headless、恢复备份和重置，读取时保留已有合法只读值。

工具设置与真实按钮共用 tools/presentation，空区域隐藏。报价 Demo 与默认配置示例开放全部已实现设置，并提供只读／未配置示例。宿主重新创建内容相同的分页配置对象或选项数组不再重置当前设置。继续开发时复用这些通用策略，不在页面增加模块权限分支。完整发布门禁结果以本批实际验收记录为准。

### BT-02 View Runtime

**下一项任务。** 完善通用视图创建、修改、默认视图和持久化；迁出 Demo 中剩余的视图管理状态，并补服务端权限与冲突处理。

### BT-03 Mapping

完善字段值映射规则与独立 Runtime；当前已有列级映射和显示基础能力。

### BT-04 Formatting

完善日期、金额、百分比等格式化能力；保留现有列格式和显示／导出一致解释。

### BT-05 Template

实现模板生命周期。

### BT-06 Export

实现 Excel、CSV、字段选择和导出方案。

### BT-07 Data Tools

实现分组、汇总、对比、标记等能力。

### BT-08 Formula Engine

实现计算字段、公式引擎及相关试算。当前设置页的“试算”仅核对列显示与导出结果，不能替代本任务。

### BT-09 Legacy Full Acceptance

完成完整迁移验收。
