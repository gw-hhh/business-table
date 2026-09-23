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
- Settings Policy：设置页、列模块与列能力三层交集；未声明隐藏，显式 disabled 才只读；默认、自定义和 Headless 设置命令共用写入守卫，已有合法只读值继续显示
- 工具栏设置与真实工具共用 tools 和 presentation；空工具区域隐藏，Demo 默认显式开放全部已实现设置，配置示例提供全部开启、只读和未配置三种状态
- 分页配置按实际值监听，宿主重建相同内容的分页对象／选项数组不会重置当前状态
- Filter Feature
- Query Runtime 与 Search Feature：按稳定 ID 管理草稿/已应用值，投影关键词和类型化查询条件；View 保存 Search 值，旧平面查询迁移；Demo 使用 Headless Search Context
- Views 基础能力
- 历史实现文档已整理至 `docs/archive/`

设置策略与工具栏本批验收、修改清单见 [验收记录](SETTINGS-POLICY-ACCEPTANCE.md)。

## Legacy 规则

参考：

reference/legacy-v3.1/

禁止：

- iframe
- 直接运行旧 JS
- 复制旧页面结构

## 当前风险

View 完整创建/修改/默认/持久化仍属于 BT-02；Demo 目前保留本地视图管理。Search 自定义 UI 值目前限可保存的 JSON 数据。

当前列映射、数字格式、富文本模板和规则试算已有基础实现；“试算”仅预览列显示与导出解释，不能视为 BT-08 公式引擎完成。设置策略与工具接入的本批 Release Gate、浏览器验收和提交信息以实际验收记录为准；本文不预填测试通过数或提交号。

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
