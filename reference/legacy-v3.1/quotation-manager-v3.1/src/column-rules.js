/* 列规则纯函数。配置只改变展示/查询，不改原始业务数据；不依赖 DOM。 */
(function (root, factory) {
    const common = typeof module === 'object' && module.exports;
    const api = factory(common ? require('./config.js') : root.QuoteConfig);
    if (common)
        module.exports = api;
    else
        root.QuoteRules = api;
})(globalThis, function (Config) {
    'use strict';
    const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    const choice = (v, list, f) => list.includes(v) ? v : f;
    const text = (v, f = '', max = 120) => typeof v === 'string' ? v.slice(0, max) : f;
    const bool = (v, f = false) => typeof v === 'boolean' ? v : f;
    const integer = (v, a, b, f) => Number.isInteger(v) && v >= a && v <= b ? v : f;
    const color = v => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v) ? v.toLowerCase() : '';
    const FIELDS = new Set([...Config.COLUMNS.filter(c => c.key !== 'actions').map(c => c.key), 'remark']);
    const empty = v => v === null || v === undefined || v === '';
    function typeOf(key) {
        return key === 'amountCents' ? 'number' : ['date', 'createdDate'].includes(key) ? 'date' : key === 'status' ? 'multi' : 'text';
    }
    const FILTER_OPERATORS = Object.freeze({ text: [['contains', '包含'], ['eq', '等于'], ['ne', '不等于'], ['starts', '开头是'], ['empty', '为空'], ['notEmpty', '不为空']], number: [['eq', '等于'], ['ne', '不等于'], ['gt', '大于'], ['gte', '大于等于'], ['lt', '小于'], ['lte', '小于等于'], ['between', '区间'], ['empty', '为空'], ['notEmpty', '不为空']], date: [['eq', '当天'], ['gte', '不早于'], ['lte', '不晚于'], ['between', '日期范围'], ['nextDays', '未来天数'], ['pastDays', '过去天数'], ['empty', '为空'], ['notEmpty', '不为空']], single: [['in', '属于'], ['notIn', '不属于'], ['empty', '为空'], ['notEmpty', '不为空']], multi: [['in', '属于'], ['notIn', '不属于'], ['empty', '为空'], ['notEmpty', '不为空']], boolean: [['in', '属于'], ['empty', '为空'], ['notEmpty', '不为空']] });
    function normalizeNumber(raw = {}, legacy = {}) {
        const n = object(raw);
        const max = integer(n.maxDigits, 0, 8, legacy.decimals ?? 2);
        return { enabled: bool(n.enabled), mode: choice(n.mode, ['decimal', 'percent', 'currency'], 'decimal'), percentBase: choice(n.percentBase, ['ratio', 'hundred'], 'ratio'), minDigits: integer(n.minDigits, 0, 8, max), maxDigits: max, group: bool(n.group, legacy.thousands !== false), scale: choice(n.scale, [1, 1000, 10000, 100000000], 1), currency: choice(n.currency, ['CNY', 'USD', 'EUR', 'JPY'], 'CNY'), sign: choice(n.sign, ['auto', 'always', 'accounting'], 'auto'), prefix: text(n.prefix, '', 12), suffix: text(n.suffix, '', 12) };
    }
    function normalizeMapping(raw = {}) {
        const m = object(raw);
        return { enabled: bool(m.enabled), type: choice(m.type, ['text', 'number', 'boolean'], 'text'), unknown: text(m.unknown, '未知', 24), empty: text(m.empty, '未填写', 24), presentation: choice(m.presentation, ['text', 'tag', 'dot'], 'tag'), sort: bool(m.sort), items: (Array.isArray(m.items) ? m.items : []).slice(0, 200).map(i => {
                i = object(i);
                return { raw: text(i.raw, String(i.raw ?? ''), 100), label: text(i.label, '', 60), color: color(i.color) || '#334155', background: color(i.background) || '#f1f5f9', border: color(i.border), icon: choice(i.icon, ['', 'check', 'info', 'clock', 'close'], '') };
            }) };
    }
    function normalizeFilter(raw = {}, key) {
        const f = object(raw), type = choice(f.type, Object.keys(FILTER_OPERATORS), typeOf(key));
        return { enabled: key !== 'actions' && bool(f.enabled, true), type, source: choice(f.source, ['data', 'mapping', 'manual'], 'data'), valueType: choice(f.valueType, ['text', 'number', 'boolean'], key === 'amountCents' ? 'number' : 'text'), search: bool(f.search, true), counts: bool(f.counts, true), operators: Array.isArray(f.operators) ? [...new Set(f.operators.filter(o => FILTER_OPERATORS[type].some(([id]) => id === o)))] : FILTER_OPERATORS[type].map(([id]) => id), options: (Array.isArray(f.options) ? f.options : []).slice(0, 200).map(i => ({ value: text(i?.value, '', 100), label: text(i?.label, '', 60) })), defaultRule: f.defaultRule ? normalizeFilterRule(f.defaultRule) : null };
    }
    function safeLink(value) {
        if (typeof value !== 'string' || value.length > 1000 || /[\u0000-\u0020\u007f]/.test(value))
            return '';
        try {
            const u = new URL(value);
            return ['http:', 'https:', 'mailto:'].includes(u.protocol) && !u.username && !u.password ? u.href : '';
        }
        catch {
            return '';
        }
    }
    /** 文档只接收 insert 操作。移除图片、视频、任意 HTML、脚本属性和未知嵌入。 */
    function normalizeDelta(raw, { template = false, maxChars = 1000 } = {}) {
        const ops = [];
        let length = 0;
        const input = Array.isArray(raw?.ops) ? raw.ops : [];
        for (const op of input.slice(0, 2000)) {
            let insert;
            if (typeof op?.insert === 'string') {
                insert = op.insert.replace(/\r\n?/g, '\n').slice(0, Math.max(0, maxChars - length));
                length += insert.length;
            }
            else if (template && FIELDS.has(op?.insert?.qfield)) {
                insert = { qfield: op.insert.qfield };
                length++;
            }
            else
                continue;
            if (insert === '')
                continue;
            const a = object(op.attributes), attributes = {};
            for (const k of ['bold', 'italic', 'underline', 'strike'])
                if (a[k] === true)
                    attributes[k] = true;
            for (const k of ['color', 'background'])
                if (color(a[k]))
                    attributes[k] = color(a[k]);
            if (['system', 'yahei', 'pingfang', 'serif', 'mono'].includes(a.font))
                attributes.font = a.font;
            if (['12px', '13px', '14px', '15px', '16px', '18px', '20px', '22px', '24px'].includes(a.size))
                attributes.size = a.size;
            if (['left', 'center', 'right'].includes(a.align))
                attributes.align = a.align;
            if (['ordered', 'bullet'].includes(a.list))
                attributes.list = a.list;
            const link = safeLink(a.link);
            if (link && !template)
                attributes.link = link;
            ops.push(Object.keys(attributes).length ? { insert, attributes } : { insert });
            if (length >= maxChars)
                break;
        }
        if (!ops.length || typeof ops.at(-1).insert !== 'string' || !ops.at(-1).insert.endsWith('\n'))
            ops.push({ insert: '\n' });
        return { ops };
    }
    function deltaText(delta, resolver = k => `〔${Config.COLUMNS.find(c => c.key === k)?.label || k}〕`) {
        return (delta?.ops || []).map(op => typeof op.insert === 'string' ? op.insert : op.insert?.qfield ? resolver(op.insert.qfield) : '').join('').replace(/\n$/, '');
    }
    function normalizeTemplate(raw = {}) {
        return { enabled: bool(raw?.enabled), document: normalizeDelta(raw?.document, { template: true, maxChars: 3000 }) };
    }
    function normalizeColumn(raw, base) {
        return { filter: normalizeFilter(raw.filter, base.key), mapping: normalizeMapping(raw.mapping), number: normalizeNumber(raw.number, raw), template: normalizeTemplate(raw.template) };
    }
    /** 有限十进制转有理数，显示舍入使用 BigInt，避免 1.005 等浮点误差。 */
    function rational(value) {
        if (typeof value === 'bigint')
            return [value, 1n];
        if (typeof value === 'number' && !Number.isFinite(value))
            return null;
        const s = String(value).trim();
        const m = s.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
        if (!m || s.length > 180)
            return null;
        const exp = Number(m[4] || 0);
        if (Math.abs(exp) > 100)
            return null;
        const dec = (m[3] || '').length - exp;
        let n = BigInt(m[2] + (m[3] || '')) * (m[1] === '-' ? -1n : 1n), d = 1n;
        if (dec >= 0)
            d = 10n ** BigInt(dec);
        else
            n *= 10n ** BigInt(-dec);
        return [n, d];
    }
    function scaledRatio(value, n, divisor) {
        const r = rational(value);
        if (!r)
            return null;
        let [a, b] = r;
        b *= BigInt(divisor);
        if (n.mode === 'percent') {
            if (n.percentBase === 'ratio')
                a *= 100n;
        }
        else
            b *= BigInt(n.scale);
        return [a, b];
    }
    function formatNumber(value, raw = {}, divisor = 1) {
        if (empty(value))
            return '—';
        const n = normalizeNumber(raw), r = scaledRatio(value, n, divisor);
        if (!r)
            return '—';
        let [a, b] = r;
        const negative = a < 0n;
        if (negative)
            a = -a;
        const factor = 10n ** BigInt(n.maxDigits);
        let rounded = (a * factor * 2n + b) / (b * 2n);
        let whole = (rounded / factor).toString(), fraction = n.maxDigits ? String(rounded % factor).padStart(n.maxDigits, '0') : '';
        while (fraction.length > n.minDigits && fraction.endsWith('0'))
            fraction = fraction.slice(0, -1);
        if (n.group)
            whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        let s = whole + (fraction ? '.' + fraction : '');
        const symbol = n.mode === 'currency' ? ({ CNY: '¥', USD: '$', EUR: '€', JPY: '¥' }[n.currency]) : '';
        s = n.prefix + symbol + s + (n.mode === 'percent' ? '%' : '') + n.suffix;
        if (negative && rounded !== 0n)
            s = n.sign === 'accounting' ? `(${s})` : '-' + s;
        else if (n.sign === 'always' && rounded !== 0n)
            s = '+' + s;
        return s;
    }
    function matchKey(value, type, { config = false } = {}) {
        if (type === 'number') {
            if (!config && typeof value !== 'number')
                return null;
            const n = Number(value);
            return !empty(value) && Number.isFinite(n) ? `n:${n}` : null;
        }
        if (type === 'boolean') {
            if (config && ['true', 'false'].includes(value))
                return `b:${value}`;
            return typeof value === 'boolean' ? `b:${value}` : null;
        }
        return typeof value === 'string' ? `s:${value}` : null;
    }
    function resolveMapping(value, raw) {
        const m = normalizeMapping(raw);
        if (!m.enabled || empty(value))
            return null;
        const key = matchKey(value, m.type);
        return key === null ? null : m.items.find(i => matchKey(i.raw, m.type, { config: true }) === key) || null;
    }
    function mappedText(value, raw, fallback) {
        const m = normalizeMapping(raw);
        if (!m.enabled)
            return fallback;
        if (empty(value))
            return m.empty;
        const found = resolveMapping(value, m);
        return found ? found.label : `${m.unknown}（${String(value)}）`;
    }
    function formatScalar(row, col, fallback) {
        const value = row[col.key];
        if (col.mapping?.enabled)
            return mappedText(value, col.mapping, fallback);
        if (empty(value))
            return col.emptyText ?? '—';
        if (col.number?.enabled)
            return formatNumber(value, col.number, col.key === 'amountCents' ? 100 : 1);
        return fallback;
    }
    function normalizeFilterRule(raw = {}) {
        const f = object(raw);
        return { ...(f.basis ? { basis: normalizeNumber(f.basis) } : {}), op: text(f.op, 'contains', 20), value: text(f.value, String(f.value ?? ''), 200), to: text(f.to, String(f.to ?? ''), 200), values: (Array.isArray(f.values) ? f.values : []).slice(0, 500).filter(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean').map(v => v) };
    }
    function normalizeFilterState(raw, columns) {
        const result = {};
        for (const col of columns) {
            if (col.key === 'actions' || !col.filter?.enabled || !raw?.[col.key])
                continue;
            const rule = normalizeFilterRule(raw[col.key]);
            try {
                validateFilter(col, rule);
                result[col.key] = rule;
            }
            catch { /* 外部旧配置中的非法条件不执行；入口提交始终先显式校验。 */
            }
        }
        return result;
    }
    function filterNumericValue(value, col) {
        if (empty(value) || !rational(value))
            return NaN;
        let n = Number(value);
        if (col.number?.enabled) {
            const f = normalizeNumber(col.number);
            if (f.mode === 'percent' && f.percentBase === 'ratio')
                n /= 100;
            else if (f.mode !== 'percent')
                n *= f.scale;
        }
        return col.key === 'amountCents' ? n * 100 : n;
    }
    function captureFilter(col, raw) {
        const r = normalizeFilterRule(raw);
        if (normalizeFilter(col.filter, col.key).type === 'number' && !r.basis)
            r.basis = normalizeNumber(col.number || {});
        return r;
    }
    function filterUnit(col, raw) {
        const n = raw?.basis || col.number;
        if (n?.enabled && n.mode === 'percent')
            return '%';
        const scale = n?.enabled ? n.scale : 1;
        return col.key === 'amountCents' ? ({ 1: '元', 1000: '千元', 10000: '万元', 100000000: '亿元' }[scale] || '元') : '';
    }
    function numericThreshold(value, col, rule) {
        const n = rule.basis || normalizeNumber(col.number || {});
        const r = rational(value);
        if (!r)
            return null;
        let [a, b] = r;
        if (n.enabled) {
            if (n.mode === 'percent' && n.percentBase === 'ratio')
                b *= 100n;
            else if (n.mode !== 'percent')
                a *= BigInt(n.scale);
        }
        if (col.key === 'amountCents')
            a *= 100n;
        return [a, b];
    }
    function numericComparison(value, threshold) {
        const a = rational(value);
        if (!a || !threshold)
            return NaN;
        const n = a[0] * threshold[1] - threshold[0] * a[1];
        return n < 0n ? -1 : n > 0n ? 1 : 0;
    }
    function validateFilter(col, raw) {
        const f = normalizeFilterRule(raw), conf = normalizeFilter(col.filter, col.key);
        if (!conf.operators.includes(f.op))
            throw new Error('请选择允许的筛选条件。');
        if (['empty', 'notEmpty'].includes(f.op))
            return true;
        if (['in', 'notIn'].includes(f.op)) {
            if (!f.values.length)
                throw new Error('请至少选择一个筛选项。');
            return true;
        }
        if (!f.value.trim())
            throw new Error('请填写筛选值。');
        if (f.op === 'between' && !f.to.trim())
            throw new Error('请填写完整区间。');
        if (conf.type === 'number') {
            if (!Number.isFinite(filterNumericValue(f.value, col)) || (f.op === 'between' && !Number.isFinite(filterNumericValue(f.to, col))))
                throw new Error('请输入有效数字。');
            if (f.op === 'between' && Number(f.value) > Number(f.to))
                throw new Error('区间下限不能大于上限。');
        }
        else if (conf.type === 'date') {
            if (['nextDays', 'pastDays'].includes(f.op)) {
                if (!/^\d{1,4}$/.test(f.value) || Number(f.value) > 3650)
                    throw new Error('天数需要在 0–3650 之间。');
            }
            else {
                for (const v of [f.value, ...(f.op === 'between' ? [f.to] : [])]) {
                    if (!/^\d{4}-\d\d-\d\d$/.test(v) || Number.isNaN(Date.parse(v + 'T12:00:00Z')) || new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) !== v)
                        throw new Error('请输入有效日期。');
                }
                if (f.op === 'between' && f.value > f.to)
                    throw new Error('日期区间开始不能晚于结束。');
            }
        }
        return true;
    }
    function localDay() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function matchesFilter(row, col, raw, today = localDay()) {
        const f = normalizeFilterRule(raw), v = row[col.key];
        if (f.op === 'empty')
            return empty(v);
        if (f.op === 'notEmpty')
            return !empty(v);
        if (empty(v))
            return false;
        if (f.op === 'in' || f.op === 'notIn') {
            const found = f.values.some(x => x === v);
            return f.op === 'in' ? found : !found;
        }
        const type = normalizeFilter(col.filter, col.key).type;
        let a = v, b = f.value, c = f.to;
        if (type === 'number') {
            const delta = numericComparison(v, numericThreshold(f.value, col, f)), end = numericComparison(v, numericThreshold(f.to, col, f));
            switch (f.op) {
                case 'eq': return delta === 0;
                case 'ne': return Number.isFinite(delta) && delta !== 0;
                case 'gt': return delta > 0;
                case 'gte': return delta >= 0;
                case 'lt': return delta < 0;
                case 'lte': return delta <= 0;
                case 'between': return delta >= 0 && end <= 0;
                default: return false;
            }
        }
        else {
            a = String(a).toLocaleLowerCase();
            b = String(b).toLocaleLowerCase();
            c = String(c).toLocaleLowerCase();
        }
        if (f.op === 'nextDays' || f.op === 'pastDays') {
            const delta = Math.round((Date.parse(String(v) + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
            return f.op === 'nextDays' ? delta >= 0 && delta <= Number(f.value) : delta <= 0 && delta >= -Number(f.value);
        }
        switch (f.op) {
            case 'contains': return a.includes(b);
            case 'starts': return a.startsWith(b);
            case 'eq': return a === b;
            case 'ne': return a !== b;
            case 'gt': return a > b;
            case 'gte': return a >= b;
            case 'lt': return a < b;
            case 'lte': return a <= b;
            case 'between': return a >= b && a <= c;
            default: return false;
        }
    }
    function applyFilters(rows, columns, filters = {}, advanced = {}) {
        const cs = columns.filter(c => c.filter?.enabled);
        const rules = (advanced.rules || []).filter(r => cs.some(c => c.key === r.key));
        return rows.filter(row => cs.every(c => !filters[c.key] || matchesFilter(row, c, filters[c.key])) && (!rules.length || (advanced.join === 'or' ? rules.some(r => matchesFilter(row, cs.find(c => c.key === r.key), r)) : rules.every(r => matchesFilter(row, cs.find(c => c.key === r.key), r)))));
    }
    function normalizeAdvanced(raw = {}, columns = []) {
        return { join: choice(raw.join, ['and', 'or'], 'and'), rules: (Array.isArray(raw.rules) ? raw.rules : []).slice(0, 30).flatMap(r => {
                const c = columns.find(c => c.key === r?.key && c.filter?.enabled);
                if (!c)
                    return [];
                try {
                    const n = normalizeFilterRule(r);
                    validateFilter(c, n);
                    return [{ key: r.key, ...n }];
                }
                catch {
                    return [];
                }
            }) };
    }
    function filterOptions(rows, col) {
        const f = normalizeFilter(col.filter, col.key), m = normalizeMapping(col.mapping), counts = new Map(), distinct = new Map();
        const key = v => typeof v + ':' + String(v);
        for (const row of rows) {
            const v = row[col.key];
            if (empty(v))
                continue;
            counts.set(key(v), (counts.get(key(v)) || 0) + 1);
            if (!distinct.has(key(v)))
                distinct.set(key(v), v);
        }
        let items = [];
        if (f.source === 'mapping' && m.enabled)
            items = m.items.map(i => ({ value: m.type === 'number' ? Number(i.raw) : m.type === 'boolean' ? i.raw === 'true' : i.raw, label: i.label }));
        else if (f.source === 'manual')
            items = f.options.map(i => ({ value: f.valueType === 'number' ? Number(i.value) : f.valueType === 'boolean' ? i.value === 'true' : i.value, label: i.label || i.value }));
        else
            items = [...distinct.values()].map(v => ({ value: v, label: m.enabled ? mappedText(v, m, String(v)) : col.key === 'status' ? (Config.STATUS[v]?.label || String(v)) : String(v) }));
        return items.map(i => ({ ...i, count: counts.get(key(i.value)) || 0 }));
    }
    function validateColumn(c) {
        if (c.template?.enabled && !deltaText(c.template.document).trim())
            throw new Error('请先设置列模板内容，或关闭列显示模板。');
        if (c.filter?.enabled && c.filter.source === 'manual') {
            const seen = new Set();
            for (const o of c.filter.options || []) {
                const key = matchKey(o.value, c.filter.valueType || 'text', { config: true });
                if (key === null)
                    throw new Error('筛选项原始值与设置的数据类型不一致。');
                if (seen.has(key))
                    throw new Error('筛选项原始值重复。');
                seen.add(key);
            }
        }
        const m = c.mapping;
        if (m?.enabled) {
            const seen = new Set();
            for (const i of m.items || []) {
                if (!i.label?.trim())
                    throw new Error('映射显示文字不能为空。');
                const key = matchKey(i.raw, m.type || 'text', { config: true });
                if (key === null)
                    throw new Error('映射原始值与选择的数据类型不一致。');
                if (seen.has(key))
                    throw new Error('映射原始值重复。');
                seen.add(key);
                for (const k of ['color', 'background', 'border'])
                    if (i[k] && !color(i[k]))
                        throw new Error('映射颜色需要六位色值。');
            }
        }
        if (c.number?.enabled) {
            const n = c.number;
            if (!Number.isInteger(n.minDigits) || !Number.isInteger(n.maxDigits) || n.minDigits < 0 || n.maxDigits > 8 || n.minDigits > n.maxDigits)
                throw new Error('小数位需要 0–8 位，最少位数不能大于最多位数。');
        }
        if (c.filter?.enabled && c.filter.operators?.length === 0)
            throw new Error('至少保留一个筛选条件。');
        if (c.filter?.defaultRule)
            validateFilter(c, c.filter.defaultRule);
        return true;
    }
    const TOOLS = Object.freeze([
        { id: 'help-button', label: '使用说明', icon: 'info', area: 'header', mode: 'both' },
        { id: 'template-button', label: '模板下载', icon: 'file', area: 'header', mode: 'both' },
        { id: 'export-button', label: '导出', icon: 'download', area: 'header', mode: 'both' },
        { id: 'create-button', label: '新增报价', icon: 'plus', area: 'header', mode: 'both' },
        { id: 'more-button', label: '数据与说明', icon: 'more', area: 'header', mode: 'icon' },
        { id: 'batch-button', label: '批量操作', icon: 'batch', area: 'table', mode: 'icon' },
        { id: 'search-toggle-button', label: '显示或隐藏查询区域', icon: 'search', area: 'table', mode: 'icon' },
        { id: 'refresh-button', label: '刷新列表', icon: 'refresh', area: 'table', mode: 'icon' },
        { id: 'density-button', label: '行高', icon: 'rows', area: 'table', mode: 'icon' },
        { id: 'sort-settings-button', label: '排序规则', icon: 'sort', area: 'table', mode: 'icon' },
        { id: 'columns-button', label: '列设置', icon: 'columns', area: 'table', mode: 'icon', fixed: true },
        { id: 'settings-button', label: '表格设置', icon: 'settings', area: 'table', mode: 'both', locked: true },
        { id: 'data-tools-button', label: '数据工具', icon: 'filter', area: 'table', mode: 'icon' }
    ]);
    function normalizeToolbar(raw = {}) {
        const s = object(raw), items = [], seen = new Set();
        for (const r of [...(Array.isArray(s.items) ? s.items : []), ...TOOLS]) {
            const b = TOOLS.find(t => t.id === r?.id);
            if (!b || seen.has(b.id))
                continue;
            seen.add(b.id);
            items.push({ ...b, label: text(r.label, b.label, 16).trim() || b.label, placement: b.locked ? 'inline' : choice(r.placement, ['inline', 'more', 'hidden'], 'inline'), mode: choice(r.mode, ['text', 'both', 'icon'], b.mode), fixed: b.locked || (typeof r.fixed === 'boolean' ? r.fixed : b.fixed === true), divider: bool(r.divider) });
        }
        return { items, byView: bool(s.byView), gap: choice(s.gap, [4, 8, 12], 4) };
    }
    function excelNumber(value, raw, divisor = 1) {
        const n = normalizeNumber(raw);
        let v = Number(value) / divisor;
        if (n.mode === 'percent' && n.percentBase === 'hundred')
            v /= 100;
        else if (n.mode !== 'percent')
            v /= n.scale;
        const digits = n.maxDigits ? '.' + '0'.repeat(n.minDigits) + '#'.repeat(Math.max(0, n.maxDigits - n.minDigits)) : '';
        const q = t => t ? `"${String(t).replaceAll('"', '""')}"` : '';
        let format = q(n.prefix) + (n.mode === 'currency' ? q({ CNY: '¥', USD: '$', EUR: '€', JPY: '¥' }[n.currency]) : '') + (n.group ? '#,##0' : '0') + digits + (n.mode === 'percent' ? '%' : '') + q(n.suffix);
        if (n.sign === 'accounting')
            format += `;(${format})`;
        else if (n.sign === 'always')
            format = `+${format};-${format};${format}`;
        return { value: v, format };
    }
    /** 只读数据工具。组标题不作为报价记录返回，汇总仍为整数分。 */
    function groupRows(rows, keys) {
        const key = keys[0];
        if (!key)
            return [];
        const groups = new Map();
        for (const row of rows) {
            const value = row[key] ?? '';
            const id = typeof value + ':' + String(value);
            if (!groups.has(id))
                groups.set(id, { key, value, rows: [], totalCents: 0n });
            const g = groups.get(id);
            g.rows.push(row);
            g.totalCents += BigInt(row.amountCents || 0);
        }
        return [...groups.values()].map(g => ({ ...g, children: keys.length > 1 ? groupRows(g.rows, keys.slice(1)) : [] }));
    }
    function normalizeMarks(raw, columns) {
        return (Array.isArray(raw) ? raw : []).slice(0, 30).flatMap(r => {
            const col = columns.find(c => c.key === r?.key && c.key !== 'actions');
            if (!col)
                return [];
            const rule = normalizeFilterRule(r);
            delete rule.basis;
            const standard = { ...col, filter: normalizeFilter({}, col.key), number: { enabled: false } };
            try {
                validateFilter(standard, rule);
            }
            catch {
                return [];
            }
            return [{ key: col.key, ...rule, enabled: r.enabled !== false, label: text(r.label, '关注', 24), color: color(r.color) || '#92400e', background: color(r.background) || '#fffbeb' }];
        });
    }
    function rowMark(row, rules, columns) {
        for (const rule of normalizeMarks(rules, columns)) {
            const col = columns.find(c => c.key === rule.key);
            if (rule.enabled && matchesFilter(row, { ...col, filter: normalizeFilter({}, col.key), number: { enabled: false } }, rule))
                return rule;
        }
        return null;
    }
    function compareFields(rows, columns, differences = false) {
        return columns.filter(c => c.key !== 'actions' && c.visible !== false && (!differences || new Set(rows.map(r => typeof r[c.key] + ':' + String(r[c.key] ?? ''))).size > 1));
    }
    return Object.freeze({ matchKey, captureFilter, filterUnit, groupRows, normalizeMarks, rowMark, compareFields, FIELDS, typeOf, FILTER_OPERATORS, normalizeColumn, normalizeNumber, normalizeMapping, normalizeFilter, normalizeTemplate, normalizeDelta, deltaText, safeLink, formatNumber, resolveMapping, mappedText, formatScalar, normalizeFilterRule, normalizeFilterState, filterNumericValue, validateFilter, matchesFilter, applyFilters, normalizeAdvanced, filterOptions, validateColumn, TOOLS, normalizeToolbar, excelNumber, localDay });
});
