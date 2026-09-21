# 使用说明

简单页面传 `data`；服务端分页传 `dataSource.query(query)`。列使用稳定 `id` 保存配置。支持列显隐、列宽、左右冻结、排序、数字/货币/百分比、值映射、视图和行操作。`Persistence` 可接 LocalStorage 或后端数据库 API。Windows 运行 `verify-release.cmd`，CI 在 development/main push 与 PR 时执行相同 release gate。

## Provider 查询

组件每次发起查询都会取消上一次的 `query.signal`。适配器应把它传给请求客户端，例如 `fetch(url, { signal: query.signal })`。即使适配器暂时不支持取消，组件也只接受最新请求的结果、错误和 loading 状态；卸载、替换 Provider 或切回本地 data 后，旧结果不会写回。

`queryChange` 事件和 Provider 各自收到独立的查询快照，筛选值使用可结构化克隆的数据（例如字符串、数字、日期、数组和普通对象）。两者修改参数不会改变组件内部查询或输入 View。当前请求失败时保留上一次显示的数据，并提供错误提示；点击刷新可重试。

## 分页与加载

搜索、排序、切换 View 和修改每页条数都会回到第 1 页，每次操作只发起一次查询。本地数据减少时页码收敛到最后有效页，空数据使用第 1 / 1 页。远程返回的 total 如果使当前页越界，组件会自动补查最后有效页。

组件内置加载提示与 `aria-busy`，不要求宿主额外注册 VXE Loading 组件。表格使用内容自然高度；如需固定高度或虚拟滚动，应另外设计明确的高度配置，不能在无固定高度的自适应父容器中使用 VXE `height="auto"`。
