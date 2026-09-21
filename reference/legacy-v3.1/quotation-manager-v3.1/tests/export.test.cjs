'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const C = require('../src/core.js'), Config = require('../src/config.js'), E = require('../src/export-data.js'), W = require('../src/xlsx.js');
// 独立读取 STORE ZIP，校验写出内容；不是模拟工作簿 API。
function entries(bytes) {
    const b = Buffer.from(bytes), out = {};
    let o = 0;
    while (b.readUInt32LE(o) === 0x04034b50) {
        assert.equal(b.readUInt16LE(o + 8), 0);
        const size = b.readUInt32LE(o + 18), n = b.readUInt16LE(o + 26), extra = b.readUInt16LE(o + 28), start = o + 30 + n + extra;
        out[b.subarray(o + 30, o + 30 + n).toString()] = b.subarray(start, start + size).toString();
        o = start + size;
    }
    return out;
}
test('导出字段只含业务白名单并保持选定顺序', () => {
    assert.deepEqual(E.normalizeOptions({ keys: ['owner', 'evil', 'actions', 'id', 'owner'] }).keys, ['owner', 'id']);
});
test('XLSX 为真实 OOXML 包，金额数值、编号文本、日期序列', () => {
    const book = E.createWorkbook(Config.SEED_ROWS, C.normalizeSnapshot(), { keys: ['id', 'amountCents', 'date'] });
    const files = entries(W.write(book));
    assert.ok(files['[Content_Types].xml']);
    assert.ok(files['xl/worksheets/sheet1.xml'].includes('t="inlineStr"'));
    assert.ok(files['xl/worksheets/sheet1.xml'].includes('<v>63860</v>'));
    assert.ok(files['xl/styles.xml'].includes('yyyy-mm-dd'));
    assert.ok(book.sheets[0].rows[1][2].value instanceof Date);
});
test('Excel 表头支持别名，样式保持对齐字体', () => {
    const v = C.normalizeSnapshot();
    v.columns.find(c => c.key === 'owner').label = '经办人';
    v.columns.find(c => c.key === 'owner').body = { size: 16, color: '#112233', family: 'serif', weight: 600, align: 'center' };
    const s = E.createWorkbook(Config.SEED_ROWS, v, { keys: ['owner'], aliases: true, style: 'current' }).sheets[0];
    assert.equal(s.rows[0][0].value, '经办人');
    assert.equal(s.rows[1][0].style.align, 'center');
    assert.equal(s.rows[1][0].style.font, 'SimSun');
    assert.equal(s.rows[1][0].style.color, '#112233');
});
test('用户字符串保持文本，CSV 防公式注入', () => {
    const rows = [{ ...Config.SEED_ROWS[0], name: '=HYPERLINK("evil")' }];
    const files = entries(W.write(E.createWorkbook(rows, C.normalizeSnapshot(), { keys: ['name'] })));
    assert.ok(!files['xl/worksheets/sheet1.xml'].includes('<f>'));
    assert.ok(E.createCSV(rows, C.normalizeSnapshot(), { keys: ['name'] }).includes('"\'=HYPERLINK'));
});
test('固定模板不受别名影响且示例单独放置', () => {
    const w = E.createTemplate(true);
    assert.deepEqual(w.sheets.map(s => s.name), ['数据填写', '填写说明', '示例']);
    assert.equal(w.sheets[0].rows[0][1].value, '项目名称');
    assert.equal(w.sheets[0].rows[1][0].value, null);
    assert.ok(w.sheets[2].rows[1][0].value);
    assert.ok(w.sheets[0].validations.some(v => v.range === 'E2:E10001' && v.type === 'list'));
});
test('空模板没有示例报价，保留说明和校验', () => {
    const w = E.createTemplate(false);
    assert.equal(w.sheets.length, 2);
    assert.equal(w.sheets[0].rows[1][0].value, null);
    assert.ok(w.sheets[0].validations.some(v => v.type === 'decimal'));
});
test('金额合计使用 SUM 和准确缓存，条件单独工作表', () => {
    const w = E.createWorkbook(Config.SEED_ROWS, C.normalizeSnapshot(), { keys: ['name', 'amountCents'], total: true, metadata: true }, { scope: '全部查询结果', filters: { customer: '澄川水务' } });
    const cell = w.sheets[0].rows[7][1];
    assert.equal(cell.formula, 'SUM(B2:B7)');
    assert.equal(cell.value, 1026450);
    assert.equal(w.sheets[1].name, '导出说明');
});
test('大额总数超过精度阈值使用精确文本', () => {
    const rows = Array.from({ length: 200 }, () => ({ ...Config.SEED_ROWS[0], amountCents: Config.MAX_CENTS }));
    const w = E.createWorkbook(rows, C.normalizeSnapshot(), { keys: ['name', 'amountCents'], total: true });
    assert.equal(typeof w.sheets[0].rows[201][1].value, 'string');
});
test('OOXML 文本转义且保护 Excel 字符串转义序列', () => {
    const r = { ...Config.SEED_ROWS[0], name: '甲<乙&丙_x000A_' };
    const xml = entries(W.write(E.createWorkbook([r], C.normalizeSnapshot(), { keys: ['name'] })))['xl/worksheets/sheet1.xml'];
    assert.ok(xml.includes('甲&lt;乙&amp;丙_x005F_x000A_'));
});
test('日期在 1900 年边界采用 Excel 日期系统', () => {
    assert.equal(W.excelDate(new Date('1900-01-01T00:00:00Z')), 1);
    assert.equal(W.excelDate(new Date('1900-03-01T00:00:00Z')), 61);
});
test('零字段拒绝，未知导出方案字段过滤', () => {
    assert.throws(() => E.createWorkbook([], C.normalizeSnapshot(), { keys: [] }));
    assert.deepEqual(E.normalizePresets([{ name: '常用', options: { keys: ['id', 'evil'] } }, { name: '常用', options: {} }])[0].options.keys, ['id']);
});
test('下载样本写入供独立 ZIP/XML 和工作簿导入核验', () => {
    fs.mkdirSync('tests/artifacts', { recursive: true });
    for (const [name, book] of [['export-sample.xlsx', E.createWorkbook(Config.SEED_ROWS, C.normalizeSnapshot(), { total: true, metadata: true })], ['template-blank.xlsx', E.createTemplate(false)], ['template-example.xlsx', E.createTemplate(true)]])
        fs.writeFileSync('tests/artifacts/' + name, W.write(book));
});
test('非法 XML 字符清理，不损坏中文与表情', () => {
    const r = { ...Config.SEED_ROWS[0], name: '中文😀\ufffe\uffff\u0000' };
    const xml = entries(W.write(E.createWorkbook([r], C.normalizeSnapshot(), { keys: ['name'] })))['xl/worksheets/sheet1.xml'];
    assert.ok(xml.includes('中文😀'));
    assert.ok(!/[\ufffe\uffff\u0000]/u.test(xml));
});
test('映射支持显示、原编码及并列导出，不改原始状态', () => {
    const s = C.normalizeSnapshot();
    s.columns.find(c => c.key === 'status').mapping = { enabled: true, type: 'text', items: [{ raw: 'draft', label: '待处理' }] };
    assert.equal(E.createWorkbook([Config.SEED_ROWS[0]], s, { keys: ['status'], valueMode: 'display' }).sheets[0].rows[1][0].value, '待处理');
    assert.equal(E.createWorkbook([Config.SEED_ROWS[0]], s, { keys: ['status'], valueMode: 'raw' }).sheets[0].rows[1][0].value, 'draft');
    const both = E.createWorkbook([Config.SEED_ROWS[0]], s, { keys: ['status', 'id'], valueMode: 'both' }).sheets[0];
    assert.deepEqual(both.rows[1].map(c => c.value), ['待处理', 'draft', Config.SEED_ROWS[0].id]);
});
test('百分数基数导出为 Excel 比例数字并保留百分号格式', () => {
    const s = C.normalizeSnapshot();
    s.columns.find(c => c.key === 'amountCents').number = { enabled: true, mode: 'percent', percentBase: 'hundred', minDigits: 2, maxDigits: 2 };
    const row = { ...Config.SEED_ROWS[0], amountCents: 1234 };
    const cell = E.createWorkbook([row], s, { keys: ['amountCents'], valueMode: 'display' }).sheets[0].rows[1][0];
    assert.equal(cell.value, .1234);
    assert.equal(cell.style.format.includes('%'), true);
    assert.match(E.createCSV([row], s, { keys: ['amountCents'], valueMode: 'display' }), /12.34%/);
    assert.equal(E.createWorkbook([row], s, { keys: ['amountCents'], valueMode: 'raw' }).sheets[0].rows[1][0].value, 12.34);
});
test('缩放金额导出合计按同一单位计算，百分比不自动求和', () => {
    const s = C.normalizeSnapshot();
    const n = s.columns.find(c => c.key === 'amountCents');
    n.number = { enabled: true, scale: 10000, minDigits: 2, maxDigits: 2, suffix: '万元' };
    const rows = [{ ...Config.SEED_ROWS[0], amountCents: 12345600 }];
    const last = E.createWorkbook(rows, s, { keys: ['id', 'amountCents'], valueMode: 'display', total: true }).sheets[0].rows.at(-1);
    assert.equal(last[1].value, 12.3456);
    n.number.mode = 'percent';
    assert.equal(E.createWorkbook(rows, s, { keys: ['amountCents'], total: true, valueMode: 'display' }).sheets[0].rows.length, 2);
});
