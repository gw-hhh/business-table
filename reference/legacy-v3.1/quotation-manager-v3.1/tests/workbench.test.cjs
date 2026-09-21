'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const C = require('../src/core.js'), Config = require('../src/config.js'), X = require('../src/customization.js');
const R = require('../src/column-rules.js');
test('分组汇总按完整查询结果计算整数分、不生成伪记录', () => {
    assert.equal(typeof R.groupRows, 'function');
    const groups = R.groupRows(Config.SEED_ROWS, ['customer']);
    assert.equal(groups[0].rows.length, 3);
    assert.equal(groups[0].totalCents, 37651000n);
    assert.equal(groups.reduce((n, g) => n + g.rows.length, 0), 6);
});
test('条件标记优先级只影响显示，不改变状态；无效规则不会执行', () => {
    assert.equal(typeof R.rowMark, 'function');
    const cols = C.normalizeSnapshot().columns;
    const rules = [{ enabled: true, key: 'amountCents', op: 'gt', value: '200000', label: '大额', color: '#aa3300', background: '#fff7ed' }];
    const mark = R.rowMark(Config.SEED_ROWS[1], rules, cols);
    assert.equal(mark.label, '大额');
    assert.equal(Config.SEED_ROWS[1].status, 'draft');
    assert.equal(R.rowMark(Config.SEED_ROWS[0], rules, cols), null);
});
test('对比只看不同项按原始值而非格式化字符串判断', () => {
    assert.equal(typeof R.compareFields, 'function');
    const rows = [{ ...Config.SEED_ROWS[0], amountCents: 101 }, { ...Config.SEED_ROWS[0], amountCents: 102 }];
    const cols = C.normalizeSnapshot().columns;
    assert.deepEqual(R.compareFields(rows, cols, true).map(c => c.key), ['amountCents']);
});
