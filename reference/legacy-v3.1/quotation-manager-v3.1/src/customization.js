/* 表格配置模型：只接受显示白名单，不执行配置中的脚本，不改业务字段。 */
(function (root, factory) {
    const common = typeof module === 'object' && module.exports;
    const api = factory(common ? require('./config.js') : root.QuoteConfig, common ? require('./column-rules.js') : root.QuoteRules);
    if (common)
        module.exports = api;
    else
        root.QuoteCustomization = api;
})(globalThis, function (Config, R) {
    'use strict';
    const FONTS = Object.freeze({
        system: { label: '系统字体', css: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif', excel: 'Microsoft YaHei' },
        yahei: { label: '微软雅黑', css: '"Microsoft YaHei", "PingFang SC", sans-serif', excel: 'Microsoft YaHei' },
        pingfang: { label: '苹方', css: '"PingFang SC", "Microsoft YaHei", sans-serif', excel: 'PingFang SC' },
        serif: { label: '宋体', css: 'SimSun, "Songti SC", serif', excel: 'SimSun' },
        mono: { label: '等宽字体', css: 'Consolas, "SFMono-Regular", monospace', excel: 'Consolas' }
    });
    const ACTIONS = Object.freeze([
        { id: 'detail', label: '查看', icon: 'info', placement: 'inline', group: 'common' },
        { id: 'edit', label: '修改', icon: 'edit', placement: 'inline', group: 'common' },
        { id: 'copy', label: '复制为草稿', icon: 'copy', placement: 'more', group: 'common' },
        { id: 'copyId', label: '复制编号', icon: 'copy', placement: 'more', group: 'common' },
        { id: 'export', label: '导出本条', icon: 'download', placement: 'more', group: 'export' },
        { id: 'delete', label: '删除', icon: 'trash', placement: 'more', group: 'danger', danger: true }
    ]);
    const clone = value => JSON.parse(JSON.stringify(value));
    const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const str = (value, fallback = '', max = 100) => typeof value === 'string' ? value.trim().slice(0, max) : fallback;
    const choice = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
    const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
    const num = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value))) : fallback;
    const color = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : '';
    function normalizeStyle(raw = {}) {
        const s = object(raw);
        return { family: choice(s.family, Object.keys(FONTS), ''), size: s.size === 0 ? 0 : num(s.size, 12, 20, 0),
            color: color(s.color), weight: choice(s.weight, [400, 500, 600, 700], 0), align: choice(s.align, ['left', 'center', 'right'], '') };
    }
    function normalizeAppearance(raw = {}) {
        const s = object(raw);
        return { family: choice(s.family, Object.keys(FONTS), 'system'), size: num(s.size, 12, 20, 14), color: color(s.color) || '#334155',
            headerColor: color(s.headerColor) || '#334155', headerSize: num(s.headerSize, 12, 20, 14),
            striped: bool(s.striped, false), borders: choice(s.borders, ['horizontal', 'all', 'none'], 'horizontal'),
            rowNumbers: bool(s.rowNumbers, false), hover: bool(s.hover, true) };
    }
    function normalizeColumns(input) {
        const source = Array.isArray(input) ? input : Config.COLUMNS;
        const definitions = new Map(Config.COLUMNS.map(col => [col.key, col]));
        const seen = new Set();
        const columns = [];
        for (const raw of [...source.slice(0, 100), ...Config.COLUMNS]) {
            if (!raw || !definitions.has(raw.key) || seen.has(raw.key))
                continue;
            seen.add(raw.key);
            const base = definitions.get(raw.key), c = object(raw);
            columns.push({ ...base, ...R.normalizeColumn(c, base), label: str(c.label, base.label, 30) || base.label,
                visible: base.key === 'id' ? true : bool(c.visible, base.visible),
                pin: choice(c.pin, ['', 'left', 'right'], base.pin),
                width: num(c.width, base.minWidth, 640, base.width), sortable: base.sortable && bool(c.sortable, true),
                body: normalizeStyle(c.body), header: normalizeStyle(c.header),
                wrap: choice(c.wrap, ['ellipsis', 'two', 'wrap'], 'ellipsis'),
                emptyText: typeof c.emptyText === 'string' ? c.emptyText.slice(0, 16) : '—',
                description: str(c.description, '', 120), copyable: bool(c.copyable, false), showCustomer: bool(c.showCustomer, true),
                decimals: choice(c.decimals, [0, 1, 2], 2), thousands: bool(c.thousands, true), dateFormat: choice(c.dateFormat, ['iso', 'slash', 'cn'], 'iso')
            });
        }
        return columns;
    }
    function normalizeSorts(input, columns = normalizeColumns()) {
        const raw = Array.isArray(input) ? input : input && input.key ? [input] : [];
        const keys = new Set(columns.filter(c => c.sortable).map(c => c.key)), seen = new Set();
        return raw.filter(rule => {
            if (!rule || !keys.has(rule.key) || seen.has(rule.key) || !['asc', 'desc'].includes(rule.order))
                return false;
            seen.add(rule.key);
            return true;
        }).map(rule => ({ key: rule.key, order: rule.order }));
    }
    function normalizeActions(raw = {}) {
        const s = object(raw), source = Array.isArray(s.items) ? s.items.slice(0, 30) : [], seen = new Set();
        const items = [];
        for (const item of [...source, ...ACTIONS]) {
            const base = ACTIONS.find(v => v.id === item?.id);
            if (!base || seen.has(base.id))
                continue;
            seen.add(base.id);
            const c = { ...base, label: base.danger ? base.label : str(item.label, base.label, 12) || base.label,
                placement: choice(item.placement, ['inline', 'more', 'hidden'], base.placement),
                mode: choice(item.mode, ['text', 'both', 'icon'], ''),
                group: base.danger ? 'danger' : choice(item.group, ['common', 'export'], base.group), divider: bool(item.divider, false) };
            if (base.id === 'export') {
                const children = [], childSeen = new Set();
                for (const child of [...(Array.isArray(item.children) ? item.children : []), { id: 'xlsx' }, { id: 'csv' }]) {
                    if (!['xlsx', 'csv'].includes(child?.id) || childSeen.has(child.id))
                        continue;
                    childSeen.add(child.id);
                    children.push({ id: child.id, label: child.id === 'xlsx' ? 'Excel (.xlsx)' : 'CSV', visible: bool(child.visible, true) });
                }
                c.children = children;
                if (!children.some(v => v.visible))
                    c.placement = 'hidden';
            }
            items.push(c);
        }
        return { items, maxInline: num(s.maxInline, 0, 4, 2), mode: choice(s.mode, ['text', 'both', 'icon'], 'text'),
            align: choice(s.align, ['left', 'center', 'right'], 'left'), gap: choice(s.gap, [4, 8, 12, 16, 20], 12), groups: bool(s.groups, true) };
    }
    function effectiveStyle(col, appearance, part = 'body') {
        const a = normalizeAppearance(appearance), c = col || {}, body = normalizeStyle(c.body), header = normalizeStyle(c.header);
        const s = part === 'header' ? header : body;
        return { family: s.family || a.family, size: s.size || (part === 'header' ? a.headerSize : a.size),
            color: s.color || (part === 'header' ? a.headerColor : a.color), weight: s.weight || (part === 'header' ? 600 : 400),
            align: s.align || (part === 'header' ? body.align : '') || c.align || 'left' };
    }
    function styleCSS(style) {
        return { fontFamily: FONTS[style.family]?.css || FONTS.system.css, fontSize: `${style.size}px`, color: style.color,
            fontWeight: String(style.weight), textAlign: style.align };
    }
    function baseFormatValue(row, col) {
        const value = row[col.key];
        if (value === null || value === undefined || value === '')
            return col.emptyText ?? '—';
        if (col.key === 'amountCents') {
            const digits = choice(col.decimals, [0, 1, 2], 2), step = 10n ** BigInt(2 - digits);
            const rounded = (BigInt(value) + step / 2n) / step;
            const scale = 10n ** BigInt(digits), whole = rounded / scale;
            const main = col.thousands === false ? whole.toString() : whole.toLocaleString('zh-CN');
            return digits ? `${main}.${String(rounded % scale).padStart(digits, '0')}` : main;
        }
        if (col.key === 'status')
            return Config.STATUS[value]?.label || String(value);
        if (['date', 'createdDate'].includes(col.key)) {
            if (col.dateFormat === 'slash')
                return String(value).replaceAll('-', '/');
            if (col.dateFormat === 'cn') {
                const [y, m, d] = String(value).split('-');
                return `${y}年${Number(m)}月${Number(d)}日`;
            }
        }
        return String(value);
    }
    function formatValue(row, col) {
        return R.formatScalar(row, col, baseFormatValue(row, col));
    }
    function validateSettings(settings) {
        const columns = settings?.columns;
        if (!Array.isArray(columns))
            throw new Error('列设置格式不正确。');
        const validColor = value => !value || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));
        for (const key of ['color', 'headerColor'])
            if (!validColor(settings.appearance?.[key]))
                throw new Error('颜色请输入完整的六位色值，例如 #334155。');
        const seen = new Set();
        for (const c of columns) {
            R.validateColumn(c);
            const label = typeof c.label === 'string' ? c.label.trim() : '';
            if (!label || label.length > 30)
                throw new Error('列名需要 1–30 个字符。');
            const key = label.normalize('NFKC').toLocaleLowerCase();
            if (seen.has(key))
                throw new Error(`列名重复：“${label}”，请换一个名称。`);
            seen.add(key);
            for (const part of ['header', 'body'])
                if (!validColor(c[part]?.color))
                    throw new Error(`“${label}”文字颜色请输入完整的六位色值，例如 #334155。`);
            if (!Number.isFinite(c.width) || c.width < c.minWidth || c.width > 640)
                throw new Error(`“${label}”列宽需要在 ${c.minWidth}–640 px 之间。`);
        }
        for (const a of settings.actions?.items || []) {
            if (!String(a.label || '').trim() || a.label.length > 12)
                throw new Error('按钮名称需要 1–12 个字符。');
        }
        for (const tool of settings.toolbar?.items || []) {
            if (!String(tool.label || '').trim() || tool.label.length > 16)
                throw new Error('工具栏名称需要 1–16 个字符。');
        }
        return true;
    }
    function contrastRatio(foreground, background = '#ffffff') {
        const luma = hex => {
            const rgb = (color(hex) || '#000000').slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const a = luma(foreground), b = luma(background);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }
    function presentation(input = {}) {
        const s = object(input), columns = normalizeColumns(s.columns);
        return { schemaVersion: 3, columns, marks: R.normalizeMarks(s.marks, columns), toolbar: R.normalizeToolbar(s.toolbar), sorts: normalizeSorts(Array.isArray(s.sorts) ? s.sorts : s.sort, columns),
            appearance: normalizeAppearance(s.appearance), actions: normalizeActions(s.actions),
            density: choice(s.density, ['compact', 'normal', 'loose'], 'normal'), pageSize: choice(s.pageSize, Config.PAGE_SIZES, 10) };
    }
    function settingsBackup(snapshot) {
        validateSettings(snapshot);
        return { app: 'quotation-table-settings', schemaVersion: 3, exportedAt: new Date().toISOString(), settings: presentation(snapshot) };
    }
    function readSettingsBackup(data) {
        if (data?.app !== 'quotation-table-settings' || ![2, 3].includes(data.schemaVersion) || !Array.isArray(data.settings?.columns))
            throw new Error('这不是当前版本的表格设置备份。');
        const result = presentation(data.settings);
        validateSettings(result);
        return result;
    }
    return Object.freeze({ FONTS, ACTIONS, clone, normalizeStyle, normalizeAppearance, normalizeColumns, normalizeSorts,
        normalizeActions, effectiveStyle, styleCSS, formatValue, validateSettings, contrastRatio, presentation, settingsBackup, readSettingsBackup });
});
