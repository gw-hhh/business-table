/* 导出字段和格式规则。导出、模板共用字段定义，不共用用户显示别名。 */
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const api = factory(node ? require('./config.js') : root.QuoteConfig, node ? require('./core.js') : root.QuoteCore, node ? require('./customization.js') : root.QuoteCustomization, node ? require('./xlsx.js') : root.QuoteXlsx, node ? require('./column-rules.js') : root.QuoteRules);
    if (node)
        module.exports = api;
    else
        root.QuoteExportData = api;
})(globalThis, function (Config, C, X, Writer, R) {
    'use strict';
    const FIELDS = Object.freeze([
        { key: 'id', label: '报价编号', width: 26, hint: '必填；字母、数字、下划线、短横线，最多 64 字符。作为文本填写。' },
        { key: 'name', label: '项目名称', width: 38, hint: '必填，最多 100 个字符。' },
        { key: 'customer', label: '客户', width: 24, hint: '必填，最多 60 个字符。' },
        { key: 'amountCents', label: '含税金额（元）', width: 20, hint: '必填，非负金额，最多两位小数，不超过 99999999999.99 元。' },
        { key: 'status', label: '状态', width: 16, hint: '必填：草稿、评审中或已转合同。' },
        { key: 'owner', label: '负责人', width: 18, hint: '必填，最多 40 个字符。' },
        { key: 'region', label: '大区', width: 16, hint: '必填，使用下拉选项中的大区。' },
        { key: 'createdDate', label: '创建日期', width: 19, hint: '必填，YYYY-MM-DD，1900-01-01 至 9999-12-31。' },
        { key: 'date', label: '有效期至', width: 19, hint: '必填，YYYY-MM-DD，不能早于创建日期。' },
        { key: 'remark', label: '备注', width: 40, hint: '选填，最多 1000 个字符。' }
    ]);
    const fieldKeys = new Set(FIELDS.map(f => f.key));
    function normalizeOptions(raw = {}) {
        const selected = Array.isArray(raw.keys) ? raw.keys : FIELDS.map(f => f.key);
        return { format: raw.format === 'csv' ? 'csv' : 'xlsx', keys: [...new Set(selected.filter(k => fieldKeys.has(k)))],
            valueMode: ['raw', 'both'].includes(raw.valueMode) ? raw.valueMode : 'display', aliases: raw.aliases === true, style: raw.style === 'current' ? 'current' : 'standard', total: raw.total === true, metadata: raw.metadata === true };
    }
    function visibleKeys(snapshot) {
        const keys = C.layoutColumns(snapshot.columns).columns.filter(c => fieldKeys.has(c.key)).map(c => c.key);
        const name = snapshot.columns.find(c => c.key === 'name');
        if (keys.includes('name') && name?.showCustomer && !keys.includes('customer'))
            keys.splice(keys.indexOf('name') + 1, 0, 'customer');
        return keys;
    }
    function columnsFor(snapshot, options) {
        return options.keys.flatMap(key => {
            const f = FIELDS.find(c => c.key === key), col = snapshot.columns?.find(c => c.key === key);
            const field = { ...f, col, label: options.aliases && col ? col.label : f.label, raw: options.valueMode === 'raw' };
            const transforms = key === 'status' || col?.mapping?.enabled || col?.number?.enabled;
            if (options.valueMode === 'both' && transforms)
                return [{ ...field, label: field.label + '（显示值）', raw: false }, { ...field, label: field.label + '（原值）', raw: true }];
            return [field];
        });
    }
    function checkRows(rows, options) {
        if (!Array.isArray(rows) || rows.length > Config.MAX_ROWS)
            throw new Error(`一次最多导出 ${Config.MAX_ROWS} 条记录。`);
        if (!options.keys.length)
            throw new Error('请至少选择一个导出字段。');
    }
    function exportCell(row, field, snapshot, options, csv = false) {
        const { key, col } = field;
        const raw = row[key];
        let value = raw === null || raw === undefined ? '' : raw, format;
        if (!field.raw && col?.mapping?.enabled) {
            value = R.mappedText(raw, col.mapping, String(raw ?? ''));
            format = '@';
        }
        else if (key === 'amountCents' && value !== '') {
            if (!field.raw && col?.number?.enabled) {
                const e = R.excelNumber(value, col.number, 100);
                value = csv ? R.formatNumber(value, col.number, 100) : e.value;
                format = e.format;
            }
            else
                value = csv ? C.moneyInput(value) : Number(C.moneyInput(value));
        }
        else if (key === 'status')
            value = field.raw ? String(raw ?? '') : Config.STATUS[raw]?.label || String(raw ?? '');
        else if (['date', 'createdDate'].includes(key) && C.isDate(value) && !csv)
            value = new Date(value + 'T00:00:00.000Z');
        else
            value = String(value);
        const style = cellStyle(field, snapshot, options);
        if (format)
            style.format = format;
        if (field.raw && key === 'amountCents')
            style.format = '#,##0.00';
        if (field.raw && key === 'status')
            style.format = '@';
        return { value, style };
    }
    function sumCells(rows, fields, snapshot, options, csv = false) {
        const indices = fields.flatMap((f, i) => f.key === 'amountCents' && (f.raw || (!f.col?.mapping?.enabled && !(f.col?.number?.enabled && f.col.number.mode === 'percent'))) ? [i] : []);
        if (!indices.length)
            return null;
        const total = C.sumMoney(rows), exact = total <= 999999999999999n;
        const sum = fields.map(f => ({ value: '', style: { ...cellStyle(f, snapshot, options), bold: true, fill: '#edf3ff' } }));
        const label = fields.findIndex(f => f.key !== 'amountCents');
        if (label >= 0)
            sum[label].value = '合计';
        for (const i of indices) {
            const f = fields[i], num = f.col?.number;
            if (exact) {
                const cell = exportCell({ amountCents: total }, f, snapshot, options, csv);
                sum[i] = { ...cell, style: { ...cell.style, bold: true, fill: '#edf3ff' } };
                if (rows.length && !csv)
                    sum[i].formula = `SUM(${Writer.letter(i)}2:${Writer.letter(i)}${rows.length + 1})`;
            }
            else {
                sum[i].value = !f.raw && num?.enabled ? R.formatNumber(total, num, 100) : C.moneyInput(total);
                sum[i].value += '（精确文本）';
                sum[i].style.format = '@';
            }
        }
        return sum;
    }
    function cellStyle(field, snapshot, options, header = false) {
        const effective = X.effectiveStyle(field.col, snapshot.appearance, header ? 'header' : 'body');
        const current = options.style === 'current';
        const style = { font: current ? X.FONTS[effective.family].excel : 'Microsoft YaHei', size: current ? effective.size * 0.75 : 10.5,
            color: current ? effective.color : '#334155', bold: header || (current && effective.weight >= 600),
            align: current ? effective.align : field.key === 'amountCents' ? 'right' : 'left',
            wrap: header || (current && field.col?.wrap !== 'ellipsis'), fill: header ? '#edf3ff' : '', format: 'General' };
        if (!header) {
            if (field.key === 'amountCents') {
                const decimals = current ? (field.col?.decimals ?? 2) : 2;
                style.format = (current && field.col?.thousands === false ? '0' : '#,##0') + (decimals ? '.' + '0'.repeat(decimals) : '');
            }
            else if (['date', 'createdDate'].includes(field.key))
                style.format = current && field.col?.dateFormat === 'slash' ? 'yyyy/mm/dd' : current && field.col?.dateFormat === 'cn' ? 'yyyy"年"m"月"d"日"' : 'yyyy-mm-dd';
            else
                style.format = '@';
        }
        return style;
    }
    function createWorkbook(rows, snapshot, raw = {}, info = {}) {
        const options = normalizeOptions(raw);
        checkRows(rows, options);
        const fields = columnsFor(snapshot, options), sheet = { name: '报价列表', columns: fields.map(f => ({ width: options.style === 'current' && f.col ? Math.min(45, Math.max(12, f.col.width / 7)) : f.width })), rows: [], filterEnd: rows.length + 1, freeze: true };
        sheet.rows.push(fields.map(f => ({ value: f.label, style: cellStyle(f, snapshot, options, true) })));
        rows.forEach((row, index) => sheet.rows.push(fields.map(f => {
            const cell = exportCell(row, f, snapshot, options);
            return { ...cell, style: { ...cell.style, fill: options.style === 'current' && snapshot.appearance?.striped && index % 2 === 1 ? '#f7f9fc' : '' } };
        })));
        if (options.total) {
            const sum = sumCells(rows, fields, snapshot, options);
            if (sum)
                sheet.rows.push(sum);
        }
        const book = { sheets: [sheet] };
        if (options.metadata) {
            const meta = [['项目', '内容'], ['导出范围', info.scope || '全部查询结果'], ['记录数量', rows.length], ['导出时间', new Date().toLocaleString('zh-CN', { hour12: false })]];
            const labels = { keyword: '关键词', customer: '客户', status: '状态', owner: '负责人', region: '大区', createdFrom: '创建开始', createdTo: '创建结束' };
            for (const [k, v] of Object.entries(info.filters || {}))
                if (v)
                    meta.push([labels[k] || k, k === 'status' ? Config.STATUS[v]?.label || v : v]);
            for (const [key, rule] of Object.entries(snapshot.columnFilters || {}))
                meta.push(['列筛选 ' + (FIELDS.find(f => f.key === key)?.label || key), JSON.stringify(rule)]);
            if (snapshot.advancedQuery?.rules?.length)
                meta.push(['组合筛选', JSON.stringify(snapshot.advancedQuery)]);
            if (snapshot.sorts?.length)
                meta.push(['排序', snapshot.sorts.map(s => `${FIELDS.find(f => f.key === s.key)?.label || s.key} ${s.order === 'asc' ? '升序' : '降序'}`).join('；')]);
            meta.push(['说明', '导出的是生成文件时的本地数据快照。样式仅用于显示，不改变原始金额精度。大额合计超过表格精度时使用精确文本。']);
            book.sheets.push({ name: '导出说明', columns: [{ width: 22 }, { width: 64 }], rows: meta.map((r, i) => r.map(value => ({ value, style: { wrap: true, bold: i === 0, fill: i === 0 ? '#edf3ff' : '', format: '@' } }))), rowHeight: 40, freeze: true });
        }
        return book;
    }
    function createCSV(rows, snapshot, raw = {}, info = {}) {
        const options = normalizeOptions(raw);
        checkRows(rows, options);
        const fields = columnsFor(snapshot, options), values = [fields.map(f => f.label), ...rows.map(row => fields.map(f => exportCell(row, f, snapshot, options, true).value))];
        if (options.total) {
            const sum = sumCells(rows, fields, snapshot, options, true);
            if (sum)
                values.push(sum.map(c => c.value));
        }
        // CSV 无多工作表。附加说明只能放在数据之后的独立行，由用户明确勾选。
        if (options.metadata) {
            if (Object.keys(snapshot.columnFilters || {}).length)
                values.push([], ['列筛选', JSON.stringify(snapshot.columnFilters)]);
            if (snapshot.advancedQuery?.rules?.length)
                values.push(['组合筛选', JSON.stringify(snapshot.advancedQuery)]);
            values.push([], ['导出范围', info.scope || '全部查询结果'], ['导出时间', new Date().toLocaleString('zh-CN', { hour12: false })]);
            for (const [k, v] of Object.entries(info.filters || {}))
                if (v)
                    values.push([k, v]);
        }
        return C.toCSV(values);
    }
    function createTemplate(withExample = false) {
        const snapshot = C.normalizeSnapshot(), options = normalizeOptions({});
        const data = { name: '数据填写', columns: FIELDS.map(f => ({ width: f.width })), rows: [FIELDS.map(f => ({ value: f.label, style: cellStyle(f, snapshot, options, true) }))], filterEnd: 101, freeze: true, validations: [
                { range: 'D2:D10001', type: 'decimal', formula1: 0, formula2: Config.MAX_CENTS / 100, error: '请输入允许范围内的非负金额，最多保留两位小数。' },
                { range: 'E2:E10001', type: 'list', formula1: '"草稿,评审中,已转合同"', error: '请从状态下拉列表选择。' },
                { range: 'G2:G10001', type: 'list', formula1: `"${Config.REGIONS.join(',')}"`, error: '请从大区下拉列表选择。' }
            ] };
        // 100 行预置样式，校验覆盖至第 10000 条；末尾继续新增行时请复制格式。
        for (let i = 0; i < 100; i++)
            data.rows.push(FIELDS.map(f => ({ value: null, style: cellStyle(f, snapshot, options) })));
        const instruction = [['字段', '填写说明'], ...FIELDS.map(f => [f.label, f.hint]), ['模板版本', '报价字段 v1；金额以元填写，不使用个人表格别名。'], ['填写范围', '已预设 100 行格式；最多 10000 条。新增行请复制上一空白行格式。'], ['使用提示', '模板下载不等于数据导入；本版没有 Excel 导入入口。示例在独立工作表，不会写入数据填写区。']];
        const book = { sheets: [data, { name: '填写说明', columns: [{ width: 24 }, { width: 64 }], rows: instruction.map((r, i) => r.map(value => ({ value, style: { wrap: true, bold: i === 0, fill: i === 0 ? '#edf3ff' : '', format: '@' } }))), rowHeight: 36 }] };
        if (withExample) {
            const example = createWorkbook(Config.SEED_ROWS.slice(0, 1), snapshot).sheets[0];
            example.name = '示例';
            book.sheets.push(example);
        }
        return book;
    }
    function normalizePresets(raw) {
        const names = new Set();
        return (Array.isArray(raw) ? raw : []).slice(0, 20).flatMap(p => {
            const name = typeof p?.name === 'string' ? p.name.trim().slice(0, 30) : '';
            if (!name || names.has(name))
                return [];
            names.add(name);
            const options = normalizeOptions(p.options);
            return options.keys.length ? [{ name, options }] : [];
        });
    }
    return Object.freeze({ FIELDS, normalizeOptions, normalizePresets, visibleKeys, createWorkbook, createCSV, createTemplate });
});
