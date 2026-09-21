/* 导出窗口只负责选择范围与方案；文件生成规则在 export-data.js / xlsx.js。 */
(function (root) {
    'use strict';
    const U = root.QuoteUI, C = root.QuoteCore, E = root.QuoteExportData, W = root.QuoteXlsx;
    function open({ snapshot, groups, initialScope = 'filtered', presets = [], onPresets, onComplete }) {
        let options = E.normalizeOptions(), scope = initialScope, saved = E.normalizePresets(presets), busy = false, selectedPreset = '';
        let order = E.FIELDS.map(f => f.key);
        const box = U.panel({ title: '导出报价', subtitle: '使用已应用的查询结果。文件在本地生成，不上传数据。', onRequestClose: () => {
                if (!busy)
                    box.close();
            } });
        box.element.classList.add('export-modal');
        const error = U.el('p', { class: 'form-error', role: 'alert', hidden: true }), status = U.el('p', { class: 'export-status', role: 'status' });
        const layout = U.el('div', { class: 'export-layout' }), side = U.el('div', { class: 'export-sidebar' }), fields = U.el('div', { class: 'export-fields' });
        const presetSelect = U.el('select', { id: 'export-preset', 'aria-label': '已保存的导出方案', onchange: () => {
                selectedPreset = presetSelect.value;
                const p = saved.find(v => v.name === selectedPreset);
                if (p) {
                    options = E.normalizeOptions(p.options);
                    order = [...options.keys, ...E.FIELDS.map(f => f.key).filter(k => !options.keys.includes(k))];
                    nameInput.value = p.name;
                    render();
                }
            } });
        const nameInput = U.el('input', { id: 'export-preset-name', type: 'text', maxlength: 30, placeholder: '方案名称，例如：财务核对', 'aria-label': '导出方案名称' });
        const deletePreset = U.iconButton('trash', '删除导出方案', async () => {
            const name = presetSelect.value;
            if (!name)
                return;
            if (!await U.confirm({ title: '删除导出方案', message: `确认删除“${name}”？不删除任何报价数据。`, confirmText: '删除方案', danger: true }))
                return;
            saved = saved.filter(v => v.name !== name);
            selectedPreset = '';
            const durable = onPresets(saved);
            status.textContent = durable ? '方案已删除。' : '本页已删除，修改未保存到本地。';
            renderPresets();
        });
        const savePreset = U.button('保存方案', async () => {
            const name = nameInput.value.trim(), key = name.normalize('NFKC').toLowerCase();
            if (!name || name.length > 30) {
                showError('请输入 1–30 个字符的方案名称。');
                return;
            }
            if (!options.keys.length) {
                showError('请至少选择一个导出字段。');
                return;
            }
            const existing = saved.find(v => v.name.normalize('NFKC').toLowerCase() === key);
            if (existing && !await U.confirm({ title: '更新导出方案', message: `使用当前字段和格式更新“${existing.name}”？`, confirmText: '更新方案' }))
                return;
            if (!existing && saved.length >= 20) {
                showError('最多保存 20 个导出方案。');
                return;
            }
            if (existing) {
                existing.name = name;
                existing.options = E.normalizeOptions(options);
            }
            else
                saved.push({ name, options: E.normalizeOptions(options) });
            const durable = onPresets(saved);
            selectedPreset = name;
            error.hidden = true;
            status.textContent = durable ? '导出方案已保存。' : '方案本页可用，但未保存到本地。';
            renderPresets();
        }, { id: 'save-export-preset' });
        box.body.append(U.el('div', { class: 'export-presets' }, U.field('导出方案', presetSelect), deletePreset), layout, error, status, U.el('div', { class: 'save-export-row' }, nameInput, savePreset));
        layout.append(side, fields);
        function showError(text) {
            error.hidden = false;
            error.textContent = text;
        }
        function select(label, value, choices, onValue, id) {
            const node = U.el('select', { id, onchange: () => {
                    onValue(node.value);
                    error.hidden = true;
                    render();
                } });
            node.append(...choices.map(([v, label]) => U.el('option', { value: v }, label)));
            node.value = value;
            return U.field(label, node);
        }
        function check(label, checked, onValue, id, disabled = false) {
            return U.el('label', { class: 'setting-check' }, U.el('input', { id, type: 'checkbox', checked, disabled, onchange: e => {
                    onValue(e.target.checked);
                    error.hidden = true;
                    render();
                } }), label);
        }
        function renderPresets() {
            presetSelect.replaceChildren(U.el('option', { value: '' }, '不使用方案'), ...saved.map(p => U.el('option', { value: p.name }, p.name)));
            presetSelect.value = selectedPreset;
            deletePreset.disabled = !selectedPreset;
        }
        function render() {
            const labels = { filtered: '全部查询结果', page: '当前页', selected: '选中的报价', single: '当前报价' };
            const ranges = U.el('div', { class: 'radio-list export-ranges' });
            for (const [value, rows] of Object.entries(groups))
                ranges.append(U.el('label', { class: 'radio-option' }, U.el('input', { type: 'radio', name: 'export-scope', value, checked: scope === value, disabled: !rows.length, onchange: () => {
                        scope = value;
                        error.hidden = true;
                        updateConfirm();
                    } }), `${labels[value] || value}（${rows.length} 条）`));
            const visible = E.visibleKeys(snapshot), sameVisible = options.keys.length === visible.length && options.keys.every(k => visible.includes(k));
            side.replaceChildren(U.el('h3', {}, '导出范围'), ranges, select('文件格式', options.format, [['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV (.csv)']], v => options.format = v, 'export-format'), select('导出值', options.valueMode, [['display', '显示值（包含映射和数字格式）'], ['raw', '原值（金额仍以元输出）'], ['both', '显示值与原值分别输出']], v => options.valueMode = v, 'export-value-mode'), check('使用自定义列名', options.aliases, v => options.aliases = v, 'export-use-aliases'), check('应用当前文字样式', options.style === 'current', v => options.style = v ? 'current' : 'standard', 'export-current-style', options.format === 'csv'), check('附加金额合计', options.total, v => options.total = v, 'export-total', !options.keys.includes('amountCents')), check('附加查询条件和导出时间', options.metadata, v => options.metadata = v, 'export-metadata'), U.el('p', { class: 'small-note' }, options.format === 'csv' ? 'CSV 不保留样式；附加说明放在数据末尾。编号前导零请在表格软件中按文本导入。' : 'Excel 保留金额数值和日期类型；附加说明放在单独的工作表。'));
            const list = U.el('div', { class: 'export-field-list' });
            function move(from, to) {
                order = C.moveItem(order, order.indexOf(from), order.indexOf(to));
                options.keys = order.filter(k => options.keys.includes(k));
                render();
            }
            order.forEach((key, index) => {
                const f = E.FIELDS.find(v => v.key === key), col = snapshot.columns.find(c => c.key === key), label = options.aliases && col ? col.label : f.label;
                list.append(U.el('div', { class: 'export-field-row', dataset: { rowKey: key } }, U.iconButton('grip', `拖动${label}导出顺序`, null, { className: 'icon-btn drag-handle', draggable: 'true', dataset: { drag: key } }), U.el('label', {}, U.el('input', { type: 'checkbox', checked: options.keys.includes(key), 'aria-label': `导出${f.label}`, dataset: { exportField: key }, onchange: e => {
                        const chosen = new Set(options.keys);
                        e.target.checked ? chosen.add(key) : chosen.delete(key);
                        options.keys = order.filter(k => chosen.has(k));
                        render();
                    } }), U.el('span', {}, label)), U.el('div', { class: 'move-actions' }, U.iconButton('up', `上移导出字段${f.label}`, () => move(key, order[index - 1]), { disabled: index === 0 }), U.iconButton('down', `下移导出字段${f.label}`, () => move(key, order[index + 1]), { disabled: index === order.length - 1 }))));
            });
            U.draggableList(list, move);
            fields.replaceChildren(U.el('div', { class: 'section-heading' }, U.el('h3', {}, `导出字段（${options.keys.length}）`), U.button('全部字段', () => {
                options.keys = order.slice();
                render();
            }, { tone: 'text' })), check('仅导出当前显示的列', sameVisible, v => {
                options.keys = v ? visible : order.slice();
                order = [...options.keys, ...order.filter(k => !options.keys.includes(k))];
            }, 'export-visible-only'), list, U.el('p', { class: 'small-note' }, '拖动或用上下按钮调整导出顺序。操作按钮和选择框不会导出。'));
            renderPresets();
            updateConfirm();
        }
        const cancel = U.button('取消', () => {
            if (!busy)
                box.close();
        });
        const confirm = U.button('导出 Excel', async () => {
            if (busy)
                return;
            const rows = groups[scope];
            if (!rows?.length) {
                showError('没有可导出的记录。');
                return;
            }
            if (!options.keys.length) {
                showError('请至少选择一个导出字段。');
                return;
            }
            busy = true;
            confirm.disabled = true;
            cancel.disabled = true;
            box.element.setAttribute('aria-busy', 'true');
            confirm.textContent = '正在生成…';
            try {
                await new Promise(resolve => setTimeout(resolve, 30));
                const info = { scope: { filtered: '全部查询结果', page: '当前页', selected: '选中记录', single: '当前报价' }[scope], filters: snapshot.filters };
                const data = options.format === 'xlsx' ? W.write(E.createWorkbook(rows, snapshot, options, info)) : E.createCSV(rows, snapshot, options, info);
                U.download(data, `报价列表_${info.scope}_${C.today().replaceAll('-', '')}.${options.format}`, options.format === 'xlsx' ? W.MIME : 'text/csv;charset=utf-8');
                box.close();
                onComplete?.(rows.length, options.format);
            }
            catch (e) {
                showError(e.message || '生成失败，请重试。');
            }
            finally {
                busy = false;
                cancel.disabled = false;
                box.element.removeAttribute('aria-busy');
                updateConfirm();
            }
        }, { tone: 'primary', icon: 'download', id: 'export-confirm' });
        function updateConfirm() {
            if (!confirm)
                return;
            confirm.disabled = busy || !options.keys.length || !groups[scope]?.length;
            if (!busy)
                confirm.textContent = `导出 ${options.format === 'xlsx' ? 'Excel' : 'CSV'}`;
        }
        box.footer.append(U.button('预览', () => {
            try {
                const book = E.createWorkbook((groups[scope] || []).slice(0, 10), snapshot, { ...options, total: false, metadata: false });
                const preview = U.panel({ title: '导出预览', subtitle: `范围 ${groups[scope]?.length || 0} 条；下方最多显示前 10 条，不含合计。` });
                const table = U.el('table', { class: 'export-preview-table' });
                for (const [i, row] of book.sheets[0].rows.entries())
                    table.append(U.el('tr', {}, row.map(cell => U.el(i ? 'td' : 'th', {}, cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : String(cell.value ?? '')))));
                preview.body.append(U.el('p', { class: 'small-note' }, '数值展示为将写入文件的底层值；百分比等显示格式由 Excel 应用。'), table);
                preview.footer.append(U.button('关闭', () => preview.close()));
                preview.open();
            }
            catch (e) {
                showError(e.message);
            }
        }, { id: 'export-preview' }), U.el('span', { class: 'footer-note' }, '模板下载使用固定字段，不受这里影响。'), cancel, confirm);
        render();
        box.open();
        return box;
    }
    root.QuoteExportDialog = Object.freeze({ open });
})(globalThis);
