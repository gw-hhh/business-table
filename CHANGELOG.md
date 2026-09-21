# Changelog

## Unreleased

- 新增 ConfiguredBusinessTable、版本化差量偏好、局部配置诊断和列能力 Guard。
- 新增代码优先的 Feature Gate、延迟 UI 加载、列设置 default/custom/headless 和稳定 ID Registry。
- 最简 BusinessTable 默认仅表格与分页；旧调用需显式开启 search/toolbar/columnSettings，旧 title/views/actions 声明继续有效。
- View 列布局不再改写个人偏好；存储异常不再阻止数据加载；禁用操作保留界面且不执行。
- 保留原 schema1 Persistence、ESM/UMD 分发和现有 Provider 并发回归；未升级核心依赖。
