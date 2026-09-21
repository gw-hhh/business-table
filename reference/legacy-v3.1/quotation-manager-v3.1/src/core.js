/* 可独立测试的纯函数。这里不访问 DOM、网络或浏览器存储。 */
(function (root, factory) {
    const config = typeof module === 'object' && module.exports ? require('./config.js') : root.QuoteConfig;
    const custom = typeof module === 'object' && module.exports ? require('./customization.js') : root.QuoteCustomization;
    const rules = typeof module === 'object' && module.exports ? require('./column-rules.js') : root.QuoteRules;
    const core = factory(config, custom, rules);
    if (typeof module === 'object' && module.exports)
        module.exports = core;
    else
        root.QuoteCore = core;
})(globalThis, function (Config, X, R) {
    'use strict';
    const EMPTY_FILTERS = Object.freeze({ keyword: '', customer: '', status: '', owner: '', region: '', createdFrom: '', createdTo: '' });
    const clone = value => JSON.parse(JSON.stringify(value));
    const text = value => typeof value === 'string' ? value.trim() : '';
    /** @param {string|number} value 十进制元字符串；最多两位小数。 */
    function parseMoney(value) {
        const str = String(value).trim();
        if (!/^\d{1,11}(?:\.\d{1,2})?$/.test(str))
            throw new Error('请输入非负金额，最多保留两位小数。');
        const [whole, fraction = ''] = str.split('.');
        const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
        if (!Number.isSafeInteger(cents) || cents > Config.MAX_CENTS)
            throw new Error('金额超出允许范围。');
        return cents;
    }
    function moneyInput(cents) {
        const original = BigInt(cents), value = original < 0n ? -original : original;
        return `${original < 0n ? '-' : ''}${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
    }
    function formatMoney(cents) {
        const original = BigInt(cents), value = original < 0n ? -original : original;
        return `${original < 0n ? '-' : ''}${(value / 100n).toLocaleString('zh-CN')}.${String(value % 100n).padStart(2, '0')}`;
    }
    const sumMoney = rows => rows.reduce((total, row) => total + BigInt(row.amountCents), 0n);
    /** 日期使用本地年月日语义，避免 UTC 时区偏移。 */
    function isDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
            return false;
        const [year, month, day] = value.split('-').map(Number);
        if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1)
            return false;
        return day <= new Date(year, month, 0).getDate();
    }
    function today(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    function addDays(value, count) {
        const [year, month, day] = value.split('-').map(Number);
        return today(new Date(year, month - 1, day + count, 12));
    }
    function normalizeFilters(input = {}) {
        const result = Object.fromEntries(Object.keys(EMPTY_FILTERS).map(key => [key, text(input?.[key])]));
        if (result.status && result.status !== 'open' && !Object.hasOwn(Config.STATUS, result.status))
            throw new Error('报价状态不正确。');
        for (const key of ['createdFrom', 'createdTo']) {
            if (result[key] && !isDate(result[key]))
                throw new Error('请输入有效的创建日期。');
        }
        if (result.createdFrom && result.createdTo && result.createdFrom > result.createdTo)
            throw new Error('开始日期不能晚于结束日期。');
        return result;
    }
    function normalizeSort(sort = {}) {
        const allowed = Config.COLUMNS.filter(col => col.sortable).map(col => col.key);
        return allowed.includes(sort?.key) && ['asc', 'desc'].includes(sort?.order)
            ? { key: sort.key, order: sort.order } : { key: '', order: '' };
    }
    function queryRows(rows, filters = {}, sort = {}, columns = []) {
        const f = normalizeFilters(filters);
        const kw = f.keyword.toLocaleLowerCase();
        const result = rows.filter(row => (!kw || `${row.id}\n${row.name}\n${row.customer}`.toLocaleLowerCase().includes(kw)) &&
            (!f.customer || row.customer === f.customer) &&
            (!f.owner || row.owner === f.owner) &&
            (!f.region || row.region === f.region) &&
            (!f.status || (f.status === 'open' ? ['draft', 'review'].includes(row.status) : row.status === f.status)) &&
            (!f.createdFrom || row.createdDate >= f.createdFrom) &&
            (!f.createdTo || row.createdDate <= f.createdTo));
        const sorts = X.normalizeSorts(sort);
        if (sorts.length) {
            result.sort((a, b) => {
                for (const rule of sorts) {
                    const av = a[rule.key], bv = b[rule.key];
                    const aEmpty = av === null || av === undefined || av === '';
                    const bEmpty = bv === null || bv === undefined || bv === '';
                    if (aEmpty !== bEmpty)
                        return aEmpty ? 1 : -1;
                    if (aEmpty)
                        continue;
                    const map = columns.find(c => c.key === rule.key)?.mapping;
                    const indexOf = value => {
                        const found = R.resolveMapping(value, map);
                        const i = map.items.findIndex(item => item.raw === found?.raw);
                        return i < 0 ? map.items.length : i;
                    };
                    const mapped = map?.enabled && map.sort;
                    const delta = mapped ? indexOf(av) - indexOf(bv) : rule.key === 'amountCents' ? av - bv
                        : String(av).localeCompare(String(bv), 'zh-CN', { numeric: true });
                    if (delta)
                        return rule.order === 'desc' ? -delta : delta;
                }
                return 0;
            });
        }
        return result;
    }
    function paginate(rows, page = 1, pageSize = 10) {
        const size = Config.PAGE_SIZES.includes(Number(pageSize)) ? Number(pageSize) : 10;
        const pages = Math.max(1, Math.ceil(rows.length / size));
        const current = Math.min(pages, Math.max(1, Math.trunc(Number(page)) || 1));
        const start = (current - 1) * size;
        return { items: rows.slice(start, start + size), total: rows.length, page: current, pageSize: size, pages,
            from: rows.length ? start + 1 : 0, to: Math.min(start + size, rows.length) };
    }
    const normalizeColumns = input => X.normalizeColumns(input);
    /** 给每个冻结列计算独立偏移；有空余宽度时优先交给项目列。 */
    function layoutColumns(columns, batchMode = false, containerWidth = 0, rowNumbers = false) {
        const group = pin => pin === 'left' ? 0 : pin === 'right' ? 2 : 1;
        const visible = columns.filter(col => col.visible).map(col => ({ ...col })).sort((a, b) => group(a.pin) - group(b.pin));
        const selectionWidth = batchMode ? 44 : 0;
        const numberWidth = rowNumbers ? 48 : 0;
        const baseWidth = visible.reduce((sum, col) => sum + col.width, selectionWidth + numberWidth);
        const flexible = visible.find(col => col.key === 'name') || visible.find(col => !col.pin) || visible[0];
        if (flexible && containerWidth > baseWidth)
            flexible.width += Math.floor(containerWidth - baseWidth);
        let left = selectionWidth + numberWidth;
        for (const col of visible) {
            if (col.pin === 'left') {
                col.offset = left;
                left += col.width;
            }
        }
        let right = 0;
        for (const col of [...visible].reverse()) {
            if (col.pin === 'right') {
                col.offset = right;
                right += col.width;
            }
        }
        const leftCols = visible.filter(col => col.pin === 'left');
        const rightCols = visible.filter(col => col.pin === 'right');
        if (leftCols.length)
            leftCols.at(-1).boundary = true;
        if (rightCols.length)
            rightCols[0].boundary = true;
        return { columns: visible, selectionWidth, numberWidth, totalWidth: visible.reduce((sum, col) => sum + col.width, selectionWidth + numberWidth) };
    }
    function required(value, label, maxLength) {
        const result = text(value);
        if (!result)
            throw new Error(`请填写${label}。`);
        if (result.length > maxLength)
            throw new Error(`${label}不能超过 ${maxLength} 个字符。`);
        return result;
    }
    /** 外部数据只取白名单字段，不将不可信配置直接合入状态。 */
    function validateQuote(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new Error('报价数据格式不正确。');
        const id = required(input.id, '报价编号', 64);
        if (!/^[A-Za-z0-9_-]+$/.test(id))
            throw new Error('报价编号仅支持字母、数字、下划线和短横线。');
        if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0 || input.amountCents > Config.MAX_CENTS)
            throw new Error('含税金额不正确。');
        if (!Object.hasOwn(Config.STATUS, input.status))
            throw new Error('报价状态不正确。');
        if (!isDate(input.createdDate) || !isDate(input.date))
            throw new Error('创建日期或有效期不正确。');
        if (input.date < input.createdDate)
            throw new Error('有效期不能早于创建日期。');
        const region = required(input.region, '大区', 20);
        if (!Config.REGIONS.includes(region))
            throw new Error('请选择有效的大区。');
        const remark = input.remarkRich && typeof input.remark === 'string' ? input.remark : text(input.remark);
        let remarkRich;
        if (input.remarkRich) {
            remarkRich = R.normalizeDelta(input.remarkRich, { maxChars: 100002 });
            const plain = R.deltaText(remarkRich);
            if (plain.length > 1000)
                throw new Error('备注不能超过 1000 个字符。');
            if (plain !== remark)
                throw new Error('富文本与备注正文不一致，请重新编辑后保存。');
        }
        if (remark.length > 1000)
            throw new Error('备注不能超过 1000 个字符。');
        return {
            id, name: required(input.name, '项目名称', 100), customer: required(input.customer, '客户', 60),
            amountCents: input.amountCents, status: input.status, owner: required(input.owner, '负责人', 40),
            region, createdDate: input.createdDate, date: input.date, remark,
            ...(remarkRich ? { remarkRich } : {}),
            version: Number.isSafeInteger(input.version) && input.version > 0 ? input.version : 1,
            updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : ''
        };
    }
    function validateRows(input) {
        if (!Array.isArray(input) || input.length > Config.MAX_ROWS)
            throw new Error(`数据必须是数组，且不超过 ${Config.MAX_ROWS} 条。`);
        const seen = new Set();
        return input.map((item, index) => {
            let row;
            try {
                row = validateQuote(item);
            }
            catch (error) {
                throw new Error(`第 ${index + 1} 条：${error.message}`);
            }
            if (seen.has(row.id))
                throw new Error(`报价编号重复：${row.id}`);
            seen.add(row.id);
            return row;
        });
    }
    function nextId(rows, date = today()) {
        const prefix = `Q${date.replaceAll('-', '')}-`;
        const max = rows.reduce((value, row) => row.id.startsWith(prefix) && /^\d+$/.test(row.id.slice(prefix.length))
            ? Math.max(value, Number(row.id.slice(prefix.length))) : value, 0);
        return `${prefix}${String(max + 1).padStart(4, '0')}`;
    }
    /** CSV 只输出文本与数值，不生成公式。数据单元格统一引用并转义双引号。 */
    function csvCell(value) {
        let str = String(value ?? '');
        if (typeof value !== 'number' && /^(?:[\s\uFEFF]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|[\t\r\n])/u.test(str))
            str = `'${str}`;
        return `"${str.replaceAll('"', '""')}"`;
    }
    const toCSV = rows => '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
    function normalizeSnapshot(input = {}) {
        const settings = X.presentation(input);
        return { ...settings, columnFilters: R.normalizeFilterState(input.columnFilters, settings.columns), advancedQuery: R.normalizeAdvanced(input.advancedQuery, settings.columns), filters: normalizeFilters(input.filters), sort: settings.sorts[0] || { key: '', order: '' } };
    }
    function snapshotKey(snapshot) {
        return JSON.stringify(normalizeSnapshot(snapshot));
    }
    function moveItem(list, from, to) {
        const result = [...list];
        if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to)
            return result;
        result.splice(to, 0, ...result.splice(from, 1));
        return result;
    }
    return Object.freeze({ EMPTY_FILTERS, clone, text, parseMoney, moneyInput, formatMoney, sumMoney, isDate, today, addDays,
        normalizeFilters, normalizeSort, queryRows, paginate, normalizeColumns, layoutColumns, validateQuote, validateRows,
        nextId, csvCell, toCSV, normalizeSnapshot, snapshotKey, moveItem });
});
