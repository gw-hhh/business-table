# CODEX Development Rules

## 最高优先级开发原则

本项目目标不是快速完成单个页面，而是将 legacy quotation-manager-v3.1 重构为 Vue 3 + TypeScript + BusinessTable 通用业务表格平台。

最高优先级：

代码质量 > 架构质量 > 可维护性 > 短期交付速度

## 禁止补丁式开发

禁止：

- 在页面不断增加 if/else 特殊判断
- 在 Demo 中堆业务状态
- 为单个页面增加临时代码
- 复制 Legacy JS 继续运行
- 使用 iframe 包装旧页面
- 增加无真实逻辑的按钮

如果发现当前设计无法支持需求：

优先重构正确抽象，不继续堆补丁。

## 架构原则

新增能力应进入正确层级：

UI
↓
Feature
↓
Runtime
↓
Config
↓
Persistence
↓
Business Adapter

业务页面只负责数据、字段和业务动作。

## 开发要求

- 使用完整 TypeScript 类型
- 避免 any 和类型逃避
- 优先复用已有 Runtime、Feature、Config
- 不重复实现通用能力
- 新功能必须考虑第二业务系统接入

## 提交前

必须验证：

- type-check
- unit test
- build
- e2e test
