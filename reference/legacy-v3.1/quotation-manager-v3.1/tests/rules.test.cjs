'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const exists = fs.existsSync(path.join(__dirname, '../src/column-rules.js'));
const R = exists ? require('../src/column-rules.js') : {};
const X = require('../src/customization.js'), C = require('../src/core.js'), Config = require('../src/config.js');
const col = (key = 'amountCents', rules = {}) => ({ ...X.normalizeColumns().find(c => c.key === key), ...rules });
test('v3 数字格式接口可用', () => assert.equal(typeof R.formatNumber, 'function'));
test('数字固定、最多位数以及千分位', () => {
    assert.equal(R.formatNumber(12345.6, { minDigits: 2, maxDigits: 2, group: true }), '12,345.60');
    assert.equal(R.formatNumber(12.3, { minDigits: 0, maxDigits: 4 }), '12.3');
    assert.equal(R.formatNumber(12.3, { minDigits: 4, maxDigits: 4 }), '12.3000');
});
test('两种百分比基数明确且无放大百倍', () => {
    assert.equal(R.formatNumber(.1234, { mode: 'percent', percentBase: 'ratio', minDigits: 2, maxDigits: 2 }), '12.34%');
    assert.equal(R.formatNumber(12.34, { mode: 'percent', percentBase: 'hundred', minDigits: 2, maxDigits: 2 }), '12.34%');
});
test('分单位转换、负数舍入、零值不误判为空', () => {
    assert.equal(R.formatNumber(1299, { minDigits: 1, maxDigits: 1 }, 100), '13.0');
    assert.equal(R.formatNumber(-1005, { minDigits: 2, maxDigits: 2 }, 1000), '-1.01');
    assert.equal(R.formatNumber(0, { minDigits: 2, maxDigits: 2 }), '0.00');
    assert.equal(R.formatNumber(null, {}), '—');
});
test('缩放只影响显示且支持精确大金额', () => {
    assert.equal(R.formatNumber(12345600, { scale: 10000, minDigits: 2, maxDigits: 2, suffix: '万元' }, 100), '12.35万元');
    assert.equal(R.formatNumber(9999999999999, { minDigits: 2, maxDigits: 2, group: true }, 100), '99,999,999,999.99');
});
test('类型化映射区分数字、文本和前导零', () => {
    const m = { enabled: true, type: 'text', items: [{ raw: '01', label: '文本一' }, { raw: '1', label: '另一项' }] };
    assert.equal(R.resolveMapping('01', m).label, '文本一');
    assert.equal(R.resolveMapping(1, m), null);
    assert.equal(R.resolveMapping(1, { ...m, type: 'number', items: [{ raw: '1', label: '数字一' }] }).label, '数字一');
});
test('空值与未映射值有独立回退', () => {
    assert.equal(R.mappedText(null, { enabled: true, empty: '未填', unknown: '未知', items: [] }, '—'), '未填');
    assert.equal(R.mappedText('other', { enabled: true, empty: '未填', unknown: '未知', items: [] }, 'other'), '未知（other）');
});
test('映射重复和数字位数冲突在应用前报错', () => {
    assert.throws(() => R.validateColumn({ ...col('status'), mapping: { enabled: true, type: 'text', items: [{ raw: 'x', label: '甲' }, { raw: 'x', label: '乙' }] } }), /重复/);
    assert.throws(() => R.validateColumn({ ...col(), number: { enabled: true, minDigits: 4, maxDigits: 2 } }), /小数/);
});
test('配置归一化保留旧样式并往返新增配置', () => {
    const p = X.presentation({ columns: [{ ...col('status'), mapping: { enabled: true, type: 'text', items: [{ raw: 'draft', label: '待处理' }] }, filter: { enabled: true, type: 'multi', source: 'mapping' } }] });
    assert.equal(p.columns.find(c => c.key === 'status').mapping.items[0].label, '待处理');
    assert.equal(X.readSettingsBackup(X.settingsBackup(p)).columns[0].mapping.enabled, true);
    assert.ok(X.readSettingsBackup({ app: 'quotation-table-settings', schemaVersion: 2, settings: { columns: Config.COLUMNS } }));
});
test('筛选显示标签但始终匹配原值，多选为或', () => {
    const c = col('status', { filter: { enabled: true, type: 'multi' }, mapping: { enabled: true, type: 'text', items: [{ raw: 'draft', label: '待处理' }] } });
    assert.equal(R.matchesFilter({ status: 'draft' }, c, { op: 'in', values: ['draft', 'review'] }), true);
    assert.equal(R.matchesFilter({ status: 'contract' }, c, { op: 'in', values: ['draft'] }), false);
});
test('百分比筛选输入10代表10%而不是比例10', () => {
    const c = { key: 'ratio', filter: { enabled: true, type: 'number' }, number: { enabled: true, mode: 'percent', percentBase: 'ratio' } };
    assert.equal(R.matchesFilter({ ratio: .125 }, c, { op: 'gt', value: '10' }), true);
    assert.equal(R.matchesFilter({ ratio: .05 }, c, { op: 'gt', value: '10' }), false);
});
test('筛选区间先后、无效数值必须报错', () => {
    assert.throws(() => R.validateFilter(col(), { op: 'between', value: '20', to: '10' }), /区间/);
    assert.throws(() => R.validateFilter(col(), { op: 'gt', value: 'abc' }), /数字/);
});
test('富文本白名单去除恶意链接、图片和未知属性', () => {
    const d = R.normalizeDelta({ ops: [{ insert: '安全', attributes: { bold: true, color: '#123456', onclick: 'alert(1)', link: 'javascript:alert(1)' } }, { insert: { image: 'https://bad.test/x' } }, { insert: '\n' }] });
    assert.equal(d.ops[0].attributes.bold, true);
    assert.equal(d.ops[0].attributes.link, undefined);
    assert.equal(d.ops[0].attributes.onclick, undefined);
    assert.ok(!d.ops.some(o => o.insert?.image));
    assert.equal(R.deltaText(d), '安全');
});
test('模板字段白名单与非递归纯文本展开', () => {
    const d = R.normalizeDelta({ ops: [{ insert: '项目：' }, { insert: { qfield: 'name' } }, { insert: { qfield: '__proto__' } }, { insert: '\n' }] }, { template: true });
    assert.equal(R.deltaText(d, k => ({ name: 'A <script>' }[k] || '')), '项目：A <script>');
});
test('工具栏默认保留原入口且设置不能全部隐藏', () => {
    const t = R.normalizeToolbar({ items: [{ id: 'settings-button', placement: 'hidden' }, { id: 'export-button', placement: 'more', label: '下载数据' }] });
    assert.equal(t.items.find(i => i.id === 'settings-button').placement, 'inline');
    assert.equal(t.items.find(i => i.id === 'export-button').label, '下载数据');
    assert.ok(t.items.some(i => i.id === 'columns-button'));
});
test('备注富文本结构保存而原备注仍为可读文字', () => {
    const row = C.validateQuote({ ...Config.SEED_ROWS[0], remark: '备注', remarkRich: { ops: [{ insert: '备注', attributes: { bold: true } }, { insert: '\n' }] } });
    assert.equal(row.remark, '备注');
    assert.equal(row.remarkRich.ops[0].attributes.bold, true);
});
test('富文本超长拒绝且正文和纯文本不一致不会静默入库', () => {
    const base = { ...Config.SEED_ROWS[0], remark: '正文', remarkRich: { ops: [{ insert: '另一个正文\n' }] } };
    assert.throws(() => C.validateQuote(base), /一致/);
    assert.throws(() => C.validateQuote({ ...base, remark: '', remarkRich: { ops: [{ insert: 'a'.repeat(1001) + '\n' }] } }), /1000/);
});
test('状态字典顺序参与多字段排序，原始数据不改变', () => {
    const s = C.normalizeSnapshot();
    const c = s.columns.find(c => c.key === 'status');
    c.mapping = { enabled: true, type: 'text', sort: true, items: [{ raw: 'review', label: '评审中' }, { raw: 'draft', label: '草稿' }, { raw: 'contract', label: '已转合同' }] };
    const rows = C.queryRows(Config.SEED_ROWS, {}, [{ key: 'status', order: 'asc' }, { key: 'amountCents', order: 'desc' }], s.columns);
    assert.equal(rows[0].status, 'review');
    assert.equal(rows[1].amountCents, 23745000);
});
test('金额精确相等筛选不会被0.29浮点乘法误差漏掉', () => {
    const c = col();
    assert.equal(R.matchesFilter({ amountCents: 29 }, c, { op: 'eq', value: '0.29' }), true);
});
test('数字筛选保存原单位语义，之后改格式不改变筛选范围', () => {
    const c = col('amountCents', { number: { enabled: true, mode: 'decimal', scale: 10000 } });
    assert.equal(typeof R.captureFilter, 'function');
    const rule = R.captureFilter(c, { op: 'gte', value: '10' });
    const updated = { ...c, number: { enabled: false } };
    assert.equal(R.matchesFilter({ amountCents: 9000000 }, updated, rule), false);
    assert.equal(R.matchesFilter({ amountCents: 12000000 }, updated, rule), true);
});
test('手动数字筛选项保存原始数值类型并累计完整数据数量', () => {
    const c = col('amountCents', { filter: { enabled: true, type: 'multi', source: 'manual', valueType: 'number', options: [{ value: '29', label: '0.29元' }] } });
    const opts = R.filterOptions([{ amountCents: 29 }, { amountCents: 29 }, { amountCents: 30 }], c);
    assert.equal(opts[0].value, 29);
    assert.equal(opts[0].count, 2);
});
test('空白启用模板应拒绝，不能意外清空单元格展示', () => assert.throws(() => R.validateColumn({ ...col('name'), template: { enabled: true, document: { ops: [{ insert: '\n' }] } } }), /模板/));
