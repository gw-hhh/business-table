/* 本地演示数据适配器。正式环境应替换为有权限校验与事务支持的服务端接口。 */
(function (root, factory) {
    const common = typeof module === 'object' && module.exports;
    const value = factory(common ? require('./config.js') : root.QuoteConfig, common ? require('./core.js') : root.QuoteCore);
    if (common)
        module.exports = value;
    else
        root.QuoteRepository = value;
})(globalThis, function (Config, Core) {
    'use strict';
    class LocalRepository {
        constructor({ storage = null, onWarning = () => {
        } } = {}) {
            this.storage = storage;
            this.onWarning = onWarning;
            this.isTemporary = !storage;
            this.rows = null;
            this.lastRaw = null;
            this.revision = 0;
        }
        parse(raw) {
            const payload = JSON.parse(raw);
            if (payload?.schemaVersion !== 1 || !Number.isSafeInteger(payload.revision) || payload.revision < 1)
                throw new Error('不支持此数据版本。');
            return { rows: Core.validateRows(payload.rows), revision: payload.revision };
        }
        list(reload = false) {
            if (this.rows && (!reload || this.isTemporary))
                return Core.clone(this.rows);
            if (this.isTemporary) {
                this.rows ??= Core.clone(Config.SEED_ROWS);
                this.onWarning('本地存储不可用，当前修改只保留到页面关闭。');
                return Core.clone(this.rows);
            }
            const hadRows = this.rows !== null;
            try {
                const raw = this.storage.getItem(Config.DATA_KEY);
                if (raw === null) {
                    // 刷新时发现存储被清除，不会自动写回旧数据。
                    const initialRows = Core.clone(Config.SEED_ROWS);
                    const initial = JSON.stringify({ schemaVersion: 1, revision: 1, rows: initialRows });
                    // 先确认写入成功，再替换内存快照；失败时保留用户当前列表。
                    this.storage.setItem(Config.DATA_KEY, initial);
                    this.rows = initialRows;
                    this.revision = 1;
                    this.lastRaw = initial;
                }
                else {
                    const data = this.parse(raw);
                    this.rows = data.rows;
                    this.revision = data.revision;
                    this.lastRaw = raw;
                }
            }
            catch (error) {
                if (hadRows)
                    throw new Error('读取本地数据失败，当前列表未被覆盖。请检查浏览器存储或备份数据。');
                this.isTemporary = true;
                this.rows = Core.clone(Config.SEED_ROWS);
                this.onWarning('本地数据无法读取，已切换临时模式；原存储内容未覆盖。');
            }
            return Core.clone(this.rows);
        }
        commit(nextRows) {
            const validated = Core.validateRows(nextRows);
            if (!this.isTemporary) {
                try {
                    const current = this.storage.getItem(Config.DATA_KEY);
                    if (current !== this.lastRaw)
                        throw new Error('数据已被其他页面修改，请刷新列表后再试。');
                    const raw = JSON.stringify({ schemaVersion: 1, revision: this.revision + 1, rows: validated });
                    this.storage.setItem(Config.DATA_KEY, raw);
                    this.lastRaw = raw;
                }
                catch (error) {
                    if (error.message.includes('请刷新'))
                        throw error;
                    throw new Error('保存失败，数据未更改。请检查浏览器存储空间或导出备份。');
                }
            }
            this.rows = validated;
            this.revision += 1;
            return this.list();
        }
        create(input) {
            const rows = this.list();
            if (rows.length >= Config.MAX_ROWS)
                throw new Error(`本地演示最多保存 ${Config.MAX_ROWS} 条记录。`);
            const item = Core.validateQuote({ ...input, id: Core.nextId(rows, input.createdDate), version: 1, updatedAt: new Date().toISOString() });
            this.commit([item, ...rows]);
            return Core.clone(item);
        }
        update(id, input, expectedVersion) {
            const rows = this.list();
            const current = rows.find(row => row.id === id);
            if (!current)
                throw new Error('这条报价已被删除，请刷新列表。');
            if (current.version !== expectedVersion)
                throw new Error('这条报价已被修改，请重新打开后再试。');
            const item = Core.validateQuote({ ...input, id, createdDate: current.createdDate, version: current.version + 1, updatedAt: new Date().toISOString() });
            this.commit(rows.map(row => row.id === id ? item : row));
            return Core.clone(item);
        }
        remove(ids) {
            const rows = this.list();
            const selected = new Set(ids);
            if (!selected.size)
                throw new Error('请先选择要删除的报价。');
            if (rows.filter(row => selected.has(row.id)).length !== selected.size)
                throw new Error('部分报价已被修改或删除，请刷新列表后再试。');
            const removed = rows.filter(row => selected.has(row.id));
            this.commit(rows.filter(row => !selected.has(row.id)));
            return removed;
        }
        replace(rows) {
            this.list();
            return this.commit(rows);
        }
        backup() {
            return { app: 'quotation-demo', schemaVersion: 1, exportedAt: new Date().toISOString(), rows: this.list() };
        }
    }
    class Preferences {
        constructor(storage, onWarning = () => {
        }) {
            this.storage = storage;
            this.onWarning = onWarning;
        }
        read() {
            try {
                const raw = this.storage?.getItem(Config.PREFS_KEY);
                if (!raw)
                    return {};
                const value = JSON.parse(raw);
                if (value?.schemaVersion !== 1 || !value.data || typeof value.data !== 'object')
                    throw new Error('version');
                return value.data;
            }
            catch {
                this.onWarning('表格设置无法读取，已使用默认设置。');
                return {};
            }
        }
        write(data) {
            if (!this.storage)
                return false;
            try {
                this.storage.setItem(Config.PREFS_KEY, JSON.stringify({ schemaVersion: 1, data }));
                return true;
            }
            catch {
                this.onWarning('设置未能保存到本地，重新打开页面后可能恢复默认。');
                return false;
            }
        }
    }
    return Object.freeze({ LocalRepository, Preferences });
});
