'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Config = require('../src/config.js');
const C = require('../src/core.js');
const X = fs.existsSync(require('node:path').join(__dirname, '../src/customization.js')) ? require('../src/customization.js') : {};
const cols = () => C.normalizeColumns();
test('别名与原始字段分离且保留内容/表头样式', () => {
    const v = C.normalizeColumns([{ key: 'amountCents', label: '报价金额', body: { size: 16, color: '#112233', weight: 600, align: 'right' }, header: { align: 'center' } }])[0];
    assert.equal(v.label, '报价金额');
    assert.equal(v.key, 'amountCents');
    assert.equal(v.body.color, '#112233');
    assert.equal(v.header.align, 'center');
});
test('不可信颜色、字体及范围被白名单归一化', () => {
    assert.equal(typeof X.normalizeStyle, 'function');
    const s = X.normalizeStyle({ color: 'url(javascript:1)', family: 'evil;font', size: 800, weight: 1 });
    assert.equal(s.color, '');
    assert.equal(s.family, '');
    assert.equal(s.size, 20);
    assert.equal(s.weight, 0);
});
test('允许关闭业务列排序，操作列不能启用排序', () => {
    assert.equal(C.normalizeColumns([{ key: 'amountCents', sortable: false }])[0].sortable, false);
    assert.equal(C.normalizeColumns([{ key: 'actions', sortable: true }])[0].sortable, false);
});
test('旧单字段排序迁移为排序数组', () => {
    const s = C.normalizeSnapshot({ sort: { key: 'amountCents', order: 'desc' } });
    assert.deepEqual(s.sorts, [{ key: 'amountCents', order: 'desc' }]);
    assert.equal(s.schemaVersion, 3);
});
test('显式清空新排序不恢复过期单排序', () => {
    assert.deepEqual(C.normalizeSnapshot({ sorts: [], sort: { key: 'id', order: 'asc' } }).sorts, []);
});
test('多字段排序稳定且空值始终最后', () => {
    const rows = [{ id: 'B', owner: '甲', amountCents: 20 }, { id: 'A', owner: '甲', amountCents: 10 }, { id: 'C', owner: '甲', amountCents: null }, { id: 'D', owner: '甲', amountCents: 20 }];
    assert.deepEqual(C.queryRows(rows, {}, [{ key: 'owner', order: 'asc' }, { key: 'amountCents', order: 'desc' }]).map(v => v.id), ['B', 'D', 'A', 'C']);
});
test('关闭列排序会清除视图中该字段规则且去重', () => {
    const s = C.normalizeSnapshot({ columns: [{ key: 'owner', sortable: false }], sorts: [{ key: 'owner', order: 'asc' }, { key: 'id', order: 'desc' }, { key: 'id', order: 'asc' }] });
    assert.deepEqual(s.sorts, [{ key: 'id', order: 'desc' }]);
});
test('空值占位符不会吞掉零金额', () => {
    assert.equal(typeof X.formatValue, 'function');
    const col = cols().find(c => c.key === 'amountCents');
    col.emptyText = '无';
    assert.equal(X.formatValue({ amountCents: 0 }, col), '0.00');
    assert.equal(X.formatValue({ amountCents: null }, col), '无');
});
test('金额显示四舍五入与小数位控制', () => {
    const col = { ...cols().find(c => c.key === 'amountCents'), decimals: 0, thousands: true };
    assert.equal(X.formatValue({ amountCents: 123450 }, col), '1,235');
    assert.equal(X.formatValue({ amountCents: 123449 }, col), '1,234');
});
test('日期格式仅影响显示', () => {
    const col = { ...cols().find(c => c.key === 'date'), dateFormat: 'slash' };
    assert.equal(X.formatValue({ date: '2026-09-20' }, col), '2026/09/20');
});
test('操作设置过滤未知操作且危险操作名称不可伪装', () => {
    assert.equal(typeof X.normalizeActions, 'function');
    const a = X.normalizeActions({ items: [{ id: 'delete', label: '保存', placement: 'inline' }, { id: 'runJS', placement: 'inline' }] });
    assert.equal(a.items[0].label, '删除');
    assert.equal(a.items.some(v => v.id === 'runJS'), false);
    assert.equal(a.items[0].placement, 'inline');
});
test('默认行内查看修改，其余进入更多，导出含两个子按钮', () => {
    const a = X.normalizeActions();
    assert.deepEqual(a.items.filter(v => v.placement === 'inline').map(v => v.id), ['detail', 'edit']);
    assert.deepEqual(a.items.find(v => v.id === 'export').children.map(v => v.id), ['xlsx', 'csv']);
});
test('重复或空白列名在应用时拒绝', () => {
    assert.equal(typeof X.validateSettings, 'function');
    let s = C.normalizeSnapshot();
    s.columns[1].label = s.columns[0].label;
    assert.throws(() => X.validateSettings(s), /重复|重名/);
    s = C.normalizeSnapshot();
    s.columns[1].label = ' ';
    assert.throws(() => X.validateSettings(s), /列名/);
});
test('样式配置完整进入视图快照与比较键', () => {
    const a = C.normalizeSnapshot();
    const b = C.normalizeSnapshot();
    b.appearance.striped = true;
    b.columns[1].label = '项目';
    b.actions.maxInline = 1;
    assert.notEqual(C.snapshotKey(a), C.snapshotKey(b));
    assert.equal(C.normalizeSnapshot(b).actions.maxInline, 1);
});
test('对比度计算准确', () => {
    assert.equal(typeof X.contrastRatio, 'function');
    assert.equal(X.contrastRatio('#000000', '#ffffff'), 21);
    assert.equal(X.contrastRatio('#ffffff', '#ffffff'), 1);
});
test('设置备份不包含报价数据且拒绝其他业务备份', () => {
    assert.equal(typeof X.settingsBackup, 'function');
    const b = X.settingsBackup({ ...C.normalizeSnapshot(), rows: Config.SEED_ROWS });
    assert.equal(b.rows, undefined);
    assert.equal(b.app, 'quotation-table-settings');
    assert.equal(X.readSettingsBackup(b).columns.length, Config.COLUMNS.length);
    assert.throws(() => X.readSettingsBackup({ app: 'quotation-demo', schemaVersion: 1, rows: [] }));
});
test('颜色手动输入错误时拒绝应用，空颜色仍可继承默认', () => {
    const settings = C.normalizeSnapshot();
    settings.columns[1].body.color = '#zzzzzz';
    assert.throws(() => X.validateSettings(settings), /颜色/);
    settings.columns[1].body.color = '';
    settings.appearance.color = '#fff';
    assert.throws(() => X.validateSettings(settings), /颜色/);
    settings.appearance.color = '';
    assert.doesNotThrow(() => X.validateSettings(settings));
});
