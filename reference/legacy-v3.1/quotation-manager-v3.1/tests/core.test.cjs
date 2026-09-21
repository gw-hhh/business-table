'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ready = fs.existsSync(path.join(__dirname, '../src/core.js'));
const C = ready ? require('../src/core.js') : {};
const cfg = fs.existsSync(path.join(__dirname, '../src/config.js')) ? require('../src/config.js') : {};
const row = (overrides = {}) => ({ id: 'Q20260914-0001', name: '项目甲', customer: '澄川水务', amountCents: 6386000, status: 'draft', owner: '林予安', region: '华东', createdDate: '2026-09-14', date: '2026-11-02', remark: '', ...overrides });
test('核心模块提供明确接口', () => assert.equal(typeof C.queryRows, 'function'));
test('十进制金额精确转换为分', () => {
    assert.equal(C.parseMoney('0.29'), 29);
    assert.equal(C.parseMoney(' 63860.10 '), 6386010);
    assert.equal(C.parseMoney('0'), 0);
});
test('拒绝非法、负数、超限及多于两位小数金额', () => {
    for (const v of ['', '-1', '1.234', '1e3', 'NaN', '99999999999999999999'])
        assert.throws(() => C.parseMoney(v));
});
test('日期校验不允许不存在的日期', () => {
    assert.equal(C.isDate('2024-02-29'), true);
    for (const v of ['2026-02-29', '2026-13-01', '2026-02-30', '2026-1-01'])
        assert.equal(C.isDate(v), false);
});
test('关键词归一化，原数据不变', () => {
    const rows = [row(), row({ id: 'Q2', name: '其他' })];
    const before = JSON.stringify(rows);
    assert.equal(C.queryRows(rows, { keyword: ' q20260914 ' }).length, 1);
    assert.equal(JSON.stringify(rows), before);
});
test('高级筛选：大区、负责人、创建日期闭区间', () => {
    const rows = [row(), row({ id: 'Q2', owner: '陈景行', region: '华北' })];
    assert.equal(C.queryRows(rows, { owner: '林予安', region: '华东', createdFrom: '2026-09-14', createdTo: '2026-09-14' }).length, 1);
});
test('我负责的未结包含草稿和评审，但不含他人和合同', () => {
    const rows = [row(), row({ id: 'Q2', status: 'review' }), row({ id: 'Q3', status: 'contract' }), row({ id: 'Q4', owner: '其他' })];
    assert.equal(C.queryRows(rows, { owner: '林予安', status: 'open' }).length, 2);
});
test('反向或非法查询日期被拒绝', () => {
    assert.throws(() => C.normalizeFilters({ createdFrom: '2026-09-20', createdTo: '2026-09-01' }));
    assert.throws(() => C.normalizeFilters({ createdFrom: '2026-02-30' }));
});
test('排序持续作用于过滤后数据并且不修改源数组', () => {
    const rows = [row({ id: 'A', amountCents: 20 }), row({ id: 'B', amountCents: 10 }), row({ id: 'C', amountCents: 20 })];
    assert.deepEqual(C.queryRows(rows, {}, { key: 'amountCents', order: 'asc' }).map(x => x.id), ['B', 'A', 'C']);
    assert.equal(rows[0].id, 'A');
});
test('分页自动收敛到最后一页，空数据保持第一页', () => {
    let p = C.paginate(Array.from({ length: 11 }, (_, i) => i), 99, 10);
    assert.equal(p.page, 2);
    assert.deepEqual(p.items, [10]);
    assert.equal(C.paginate([], 5, 10).page, 1);
});
test('冻结列偏移含选择列且累计左右宽度', () => {
    const cols = [{ key: 'a', width: 100, visible: true, pin: 'left' }, { key: 'b', width: 120, visible: true, pin: 'left' }, { key: 'c', width: 130, visible: true, pin: 'right' }, { key: 'd', width: 140, visible: true, pin: 'right' }];
    const p = C.layoutColumns(cols, true, 0);
    assert.equal(p.columns[0].offset, 44);
    assert.equal(p.columns[1].offset, 144);
    assert.equal(p.columns[2].offset, 140);
    assert.equal(p.columns[3].offset, 0);
});
test('列设置必须保留编号，未知列不会进入结果', () => {
    const cols = C.normalizeColumns([{ key: 'id', visible: false, width: 2 }, { key: 'evil', visible: true }]);
    assert.equal(cols.find(x => x.key === 'id').visible, true);
    assert.equal(cols.some(x => x.key === 'evil'), false);
});
test('CSV 包含 BOM，文本转义并防止公式直接执行', () => {
    const csv = C.toCSV([['名称', '金额'], ['=1+1', '12.30'], ['甲"乙\n丙', '@SUM(1)']]);
    assert.ok(csv.startsWith('\ufeff'));
    assert.ok(csv.includes('"\'=1+1"'));
    assert.ok(csv.includes('甲""乙\n丙'));
    assert.ok(csv.includes('"\'@SUM(1)"'));
});
test('表单验证不接受空名称和有效期早于创建日期', () => {
    assert.throws(() => C.validateQuote(row({ name: ' ' })));
    assert.throws(() => C.validateQuote(row({ date: '2026-01-01' })));
    assert.throws(() => C.validateQuote(row({ status: 'not-real' })));
});
test('原始六条演示记录核心字段保留且金额准确', () => {
    assert.equal(cfg.SEED_ROWS.length, 6);
    assert.equal(cfg.SEED_ROWS[0].amountCents, 6386000);
    assert.equal(cfg.SEED_ROWS[5].customer, '临溪能源');
    for (const r of cfg.SEED_ROWS)
        assert.doesNotThrow(() => C.validateQuote(r));
});
test('负数差额格式化保留负号和两位小数', () => {
    assert.equal(C.moneyInput(-1n), '-0.01');
    assert.equal(C.formatMoney(-1123n), '-11.23');
});
