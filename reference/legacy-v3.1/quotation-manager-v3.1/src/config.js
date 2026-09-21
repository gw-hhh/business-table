/* 业务字典和演示数据。所有新增字段仅用于演示，不代表真实业务资料。 */
(function (root, factory) {
    const config = factory();
    if (typeof module === 'object' && module.exports)
        module.exports = config;
    else
        root.QuoteConfig = config;
})(globalThis, function () {
    'use strict';
    const STATUS = Object.freeze({
        draft: { label: '草稿', tone: 'neutral' },
        review: { label: '评审中', tone: 'blue' },
        contract: { label: '已转合同', tone: 'green' }
    });
    const COLUMNS = Object.freeze([
        { key: 'id', label: '报价编号', width: 194, minWidth: 170, visible: true, pin: 'left', sortable: true },
        { key: 'name', label: '项目名称 / 客户', width: 280, minWidth: 180, visible: true, pin: '', sortable: true },
        { key: 'customer', label: '客户', width: 160, minWidth: 100, visible: false, pin: '', sortable: true },
        { key: 'amountCents', label: '含税金额（元）', width: 180, minWidth: 138, visible: true, pin: '', align: 'right', sortable: true },
        { key: 'status', label: '状态', width: 112, minWidth: 102, visible: true, pin: '', sortable: true },
        { key: 'owner', label: '负责人', width: 120, minWidth: 90, visible: true, pin: '', sortable: true },
        { key: 'region', label: '大区', width: 96, minWidth: 80, visible: false, pin: '', sortable: true },
        { key: 'createdDate', label: '创建日期', width: 136, minWidth: 120, visible: false, pin: '', sortable: true },
        { key: 'date', label: '有效期至', width: 136, minWidth: 120, visible: true, pin: '', sortable: true },
        { key: 'actions', label: '操作', width: 196, minWidth: 112, visible: true, pin: 'right', sortable: false }
    ]);
    const records = [
        ['Q20260914-0001', '二期计量系统改造 · 001', '澄川水务', 6386000, 'draft', '林予安', '2026-11-02'],
        ['Q20260914-0181', '化学品储罐监测 · 181', '澄川水务', 23745000, 'draft', '林予安', '2026-11-02'],
        ['Q20260914-0121', '工艺车间传感器改造 · 121', '澄川水务', 7520000, 'contract', '林予安', '2026-12-02'],
        ['Q20260912-0051', '生产线测量点升级 · 051', '泽临管道', 23154000, 'review', '陈景行', '2026-12-22'],
        ['Q20260912-0013', '储罐安全网监测 · 013', '林越科技', 22935000, 'contract', '纪远', '2026-11-14'],
        ['Q20260912-0002', '智能水厂仪表配置 · 002', '临溪能源', 18905000, 'draft', '周子衡', '2026-11-03']
    ];
    const SEED_ROWS = records.map(([id, name, customer, amountCents, status, owner, date], index) => Object.freeze({
        id, name, customer, amountCents, status, owner, date,
        region: ['华东', '华东', '华东', '华北', '华南', '华东'][index],
        createdDate: `${id.slice(1, 5)}-${id.slice(5, 7)}-${id.slice(7, 9)}`,
        remark: '', version: 1, updatedAt: ''
    }));
    return Object.freeze({
        STATUS, COLUMNS, SEED_ROWS: Object.freeze(SEED_ROWS),
        CURRENT_USER: '林予安', REGIONS: Object.freeze(['华东', '华北', '华南', '华中', '西南', '西北', '东北']),
        PAGE_SIZES: Object.freeze([10, 25, 50, 100]), MAX_ROWS: 10000, MAX_CENTS: 9999999999999,
        DATA_KEY: 'quotation-demo:data:v1', PREFS_KEY: 'quotation-demo:preferences:v1'
    });
});
