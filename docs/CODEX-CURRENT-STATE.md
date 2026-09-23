# BUSINESS-TABLE Current State

## 当前分支

```
feature/visual-parity-refinement

HEAD:
affe92948a582ef5b08e5adbd7545a1017cb160b
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

不要继续扩大 demo/App.vue 业务状态。

后续能力应迁移到：

features + runtime + config

## 后续方向

1. Query Runtime
2. View Runtime
3. Mapping
4. Formatting
5. Template
6. Export
7. Data Tools
8. Formula Engine
9. Legacy 全量验收
