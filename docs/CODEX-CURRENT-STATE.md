# BUSINESS-TABLE Current State

## 当前分支

```
feature/visual-parity-refinement

HEAD: 以当前分支的 `git rev-parse HEAD` 为准；此文档不固定提交号。
```

## 项目定位

BusinessTable 不是报价页面，而是通用业务表格平台。

目标：

Legacy Business System
↓
Vue 3 + TypeScript
↓
BusinessTable Platform

## 当前架构

```
src/
├── BusinessTable.vue
├── ConfiguredBusinessTable.vue
├── runtime/
├── features/
├── config/
├── components/
└── ui/
```

## 已完成

- Vue3 + TypeScript + Vite
- Runtime
- Feature Gate
- Persistence
- Column Settings
- Filter Feature
- Query Runtime 与 Search Feature：按稳定 ID 管理草稿/已应用值，投影关键词和类型化查询条件；View 保存 Search 值，旧平面查询迁移；Demo 使用 Headless Search Context
- Views 基础能力
- 历史实现文档已整理至 `docs/archive/`

## Legacy 规则

参考：

reference/legacy-v3.1/

禁止：

- iframe
- 直接运行旧 JS
- 复制旧页面结构

## 当前风险

View 完整创建/修改/默认/持久化仍属于 BT-02；Demo 目前保留本地视图管理。Search 自定义 UI 值目前限可保存的 JSON 数据。

后续能力应迁移到：

features + runtime + config

## 后续方向

1. View Runtime（BT-02）
2. Mapping
3. Formatting
4. Template
5. Export
6. Data Tools
7. Formula Engine
8. Legacy 全量验收
