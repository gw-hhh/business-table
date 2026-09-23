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

迁移搜索、高级查询、查询状态和保存能力。

### BT-02 View Runtime

完善视图创建、修改、默认视图和持久化。

### BT-03 Mapping

实现字段值映射规则。

### BT-04 Formatting

实现日期、金额、百分比等格式化能力。

### BT-05 Template

实现模板生命周期。

### BT-06 Export

实现 Excel、CSV、字段选择和导出方案。

### BT-07 Data Tools

实现分组、汇总、对比、标记等能力。

### BT-08 Formula Engine

实现计算字段和试算能力。

### BT-09 Legacy Full Acceptance

完成完整迁移验收。
