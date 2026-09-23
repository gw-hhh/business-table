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
- Views Runtime 与 ViewsPanel：创建、更新、重命名、默认、重排、删除与持久化失败隔离；系统视图恢复查询但保留个人布局
- ColumnHeader：多字段排序、普通列筛选、列菜单、重命名、冻结与鼠标/键盘列宽调整
- Export：字段顺序、范围、原值/显示值、方案、预览、Excel/CSV 和固定模板下载；Excel writer 按需加载
- Search/Filter 摘要显示值与实际值分离，远端选项支持按 values 回取标签，数字筛选单位显式声明
- Selection 全查询选择与请求失效保护；查询区显示偏好通过独立持久化接口管理
- 报价详情/新增/修改/复制右侧抽屉，业务记录校验与保存失败保留输入
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

视图管理已迁入通用 Runtime/UI；远程权限、服务端版本冲突协议仍待后续接入，不能把本地持久化等同于服务端验收。Search 自定义 UI 值目前限可保存的 JSON 数据。

当前列映射、数字格式、富文本模板和规则试算已有基础实现；“试算”仅预览列显示与导出解释，不能视为 BT-08 公式引擎完成。设置策略与工具接入的本批 Release Gate、浏览器验收和提交信息以实际验收记录为准；本文不预填测试通过数或提交号。

后续能力应迁移到：

features + runtime + config

## 后续方向

1. View Runtime 的服务端权限与并发版本协议（BT-02 后续）
2. Mapping
3. Formatting
4. Template
5. Export 服务端大数据适配
6. Data Tools（本轮用户明确暂缓）
7. Formula Engine
8. Legacy 全量验收

## 本轮旧版对齐

2026-09-23 按 `reference/legacy-v3.1/quotation-manager-v3.1/index.html` 实际交互核对。范围、架构调整、测试与保留边界见 [本批验收](LEGACY-INTERACTION-ACCEPTANCE.md)。本轮只在现有 feature 分支本地提交，推送等待用户体验验收。
