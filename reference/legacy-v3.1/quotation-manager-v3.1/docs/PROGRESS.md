> 历史记录：此文件为 3.0 或更早的基线记录。3.1 的范围与自检见 `polish/PLAN.md`、`polish/REVIEW.md`，默认设计值见 `DESIGN-TOKENS.md`，最终验证见 `TEST-REPORT.md`。

> 历史：2.0.0阶段记录。3.0.0以 README、incremental/PLAN.md 和 TEST-REPORT.md 为准。

# Execution ledger — docs/PLAN.md

基线：本轮独立解压副本，不修改上次交付或用户仓库。用户已明确确认上一条完整方案并要求重构修改，本轮直接按该范围执行。
基线单元测试：npm test，26/26 通过。
配置接口衔接：customization 只依赖 config；core 依赖 customization；settings / table / export 消费两者。不存在反向依赖。
执行范围：任务 1–6。

任务 1 完成：16 条新增模型测试先全部失败，再 npm test 42/42 通过。
Ruling: 运行容器无法下载 ExcelJS 浏览器依赖（DNS 不可用，下载工具也未取得资源）。为保留用户要求的离线打开与真实 XLSX，改用只写出本项目所需格式的原生 OOXML/ZIP 导出模块，不实现任意 Excel 读取；按 ZIP/XML 和独立工作簿导入验证。用户功能不变，维护边界写入说明。

任务 2–5 已接通：四页设置、二级菜单、显示样式、实际 XLSX/CSV 与固定模板，所有设置参与保存和视图。
补充回归发现并修复：焦点标识重复、预览空节点、末行菜单因延迟滚动事件关闭、提示条遮挡按钮、状态字号不跟随、非法 XML 字符。
任务 6：重新构建、实际截图、独立工作簿导入、测试结果和已知环境限制写入交付文档。最终计数以 TEST-REPORT.md 及 artifacts 中机器报告为准。
