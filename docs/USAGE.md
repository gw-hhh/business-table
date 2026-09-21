# 使用说明

简单页面传 `data`；服务端分页传 `dataSource.query(query)`。列使用稳定 `id` 保存配置。支持列显隐、列宽、左右冻结、排序、数字/货币/百分比、值映射、视图和行操作。`Persistence` 可接 LocalStorage 或后端数据库 API。Windows 运行 `verify-release.cmd`，CI 在 development/main push 与 PR 时执行相同 release gate。
