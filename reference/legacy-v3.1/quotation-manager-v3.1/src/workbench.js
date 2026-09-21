/* 可选的只读数据工具。平铺表格、原分页与原操作均保留。 */
(function (root) {
    'use strict';
    const U = root.QuoteUI, C = root.QuoteCore, X = root.QuoteCustomization, R = root.QuoteRules, W = root.QuoteXlsx;
    const business = columns => columns.filter(c => c.key !== 'actions');
    function table(headers, rows, className = 'data-report-table') {
        return U.el('div', { class: 'report-scroll' }, U.el('table', { class: className }, U.el('thead', {}, U.el('tr', {}, headers.map(v => U.el('th', {}, v)))), U.el('tbody', {}, rows.map(row => U.el('tr', {}, row.map(v => U.el('td', {}, v)))))));
    }
    function download(headers, rows, name) {
        const book = { sheets: [{ name, columns: headers.map(() => ({ width: 28 })), rows: [headers.map(value => ({ value, style: { bold: true, fill: '#edf3ff' } })), ...rows.map(row => row.map(value => ({ value, style: { wrap: true, format: typeof value === 'number' ? '#,##0.00' : '@' } })))], freeze: true }] };
        U.download(W.write(book), name + '_' + C.today() + '.xlsx', W.MIME);
    }
    function grouping({ rows, columns, onClose }) {
        const box = U.panel({ title: '分组汇总', subtitle: `完整查询结果 ${rows.length} 条。此面板只读，不改变原表格排序和分页。`, kind: 'drawer', onClose });
        box.element.classList.add('report-dialog');
        const choices = business(columns).filter(c => !['id', 'name', 'amountCents', 'date', 'createdDate'].includes(c.key));
        const first = U.el('select', { id: 'group-by', 'aria-label': '第一分组' }), second = U.el('select', { id: 'group-then', 'aria-label': '第二分组' }), host = U.el('div', { id: 'group-results' });
        first.append(...choices.map(c => U.el('option', { value: c.key }, c.label)));
        first.value = 'customer';
        function updateSecond() {
            const keep = second.value;
            second.replaceChildren(U.el('option', { value: '' }, '不再分组'), ...choices.filter(c => c.key !== first.value).map(c => U.el('option', { value: c.key }, c.label)));
            second.value = keep === first.value ? '' : keep;
        }
        function describe(g) {
            const col = columns.find(c => c.key === g.key);
            return `${col.label}：${X.formatValue({ [g.key]: g.value }, col) || '未填写'}`;
        }
        function draw(groups) {
            return groups.map(g => {
                const details = U.el('details', { class: 'data-group' });
                details.append(U.el('summary', { dataset: { groupCount: g.rows.length } }, U.el('strong', {}, describe(g)), U.el('span', {}, `${g.rows.length} 笔`), U.el('span', { class: 'money' }, `¥ ${C.formatMoney(g.totalCents)}`)));
                details.append(g.children.length ? U.el('div', { class: 'nested-groups' }, draw(g.children)) : table(['报价编号', '项目名称', '含税金额（元）'], g.rows.map(r => [r.id, r.name, C.formatMoney(r.amountCents)]), 'group-detail-table'));
                return details;
            });
        }
        function keys() {
            return [first.value, second.value].filter(Boolean);
        }
        function paint() {
            host.replaceChildren(...draw(R.groupRows(rows, keys())));
            if (!rows.length)
                host.append(U.el('p', { class: 'settings-empty' }, '没有符合条件的记录'));
        }
        first.addEventListener('change', () => {
            updateSecond();
            paint();
        });
        second.addEventListener('change', paint);
        updateSecond();
        box.body.append(U.el('div', { class: 'setting-grid two' }, U.field('第一分组', first), U.field('第二分组', second)), host);
        box.footer.append(U.button('展开全部', () => host.querySelectorAll('details').forEach(d => d.open = true)), U.button('收起全部', () => host.querySelectorAll('details').forEach(d => d.open = false)), U.button('导出汇总', () => {
            const result = [];
            function collect(gs, path = []) {
                for (const g of gs) {
                    const next = [...path, describe(g)];
                    if (g.children.length)
                        collect(g.children, next);
                    else
                        result.push([next.join(' / '), g.rows.length, g.totalCents <= 999999999999999n ? Number(C.moneyInput(g.totalCents)) : C.moneyInput(g.totalCents) + '（精确文本）']);
                }
            }
            collect(R.groupRows(rows, keys()));
            download(['分组', '报价笔数', '金额合计（元）'], result, '分组汇总');
        }, { disabled: !rows.length }), U.button('关闭', () => box.close(), { tone: 'primary' }));
        paint();
        box.open();
        return box;
    }
    function comparison({ rows, columns, selected, onClose }) {
        const chosen = new Set([...selected].filter(id => rows.some(r => r.id === id)).slice(0, 4));
        const box = U.panel({ title: '记录对比', subtitle: '选择 2–4 条报价，只读核对。默认第一条为基准，不修改任何数据。', kind: 'drawer', onClose });
        box.element.classList.add('report-dialog');
        const search = U.el('input', { type: 'search', placeholder: '搜索编号 / 项目名称', id: 'compare-search' }), list = U.el('div', { class: 'compare-picks' }), report = U.el('div'), diff = U.el('input', { type: 'checkbox', id: 'compare-differences' }), base = U.el('select', { 'aria-label': '对比基准', id: 'compare-base' });
        let data = [], headers = [];
        function orderedRows() {
            let rs = rows.filter(r => chosen.has(r.id));
            const b = base.value;
            return [...rs.filter(r => r.id === b), ...rs.filter(r => r.id !== b)];
        }
        function paintList() {
            const q = search.value.toLocaleLowerCase();
            const matches = rows.filter(r => (r.id + ' ' + r.name).toLocaleLowerCase().includes(q));
            list.replaceChildren(...matches.slice(0, 100).map(row => U.el('label', { class: 'compare-pick' }, U.el('input', { type: 'checkbox', checked: chosen.has(row.id), disabled: chosen.size >= 4 && !chosen.has(row.id), dataset: { comparePick: row.id }, onchange: e => {
                    e.target.checked ? chosen.add(row.id) : chosen.delete(row.id);
                    paint();
                } }), row.id + ' · ' + row.name)));
            if (matches.length > 100)
                list.append(U.el('p', { class: 'small-note' }, '仅列出前 100 条，请输入关键词缩小范围。'));
        }
        function paint() {
            paintList();
            const old = base.value;
            const rs = rows.filter(r => chosen.has(r.id));
            base.replaceChildren(...rs.map(r => U.el('option', { value: r.id }, r.id)));
            if (rs.some(r => r.id === old))
                base.value = old;
            const ordered = orderedRows();
            report.replaceChildren();
            if (ordered.length < 2) {
                report.append(U.el('p', { class: 'settings-empty' }, '请至少选择两条记录'));
                save.disabled = true;
                return;
            }
            headers = ['字段', ...ordered.map((r, i) => r.id + (i === 0 ? '（基准）' : ''))];
            data = R.compareFields(ordered, columns, diff.checked).map(col => [col.label, ...ordered.map(r => X.formatValue(r, col))]);
            const amountCol = columns.find(c => c.key === 'amountCents');
            if (amountCol?.visible !== false)
                data.push(['与基准金额差（元）', ...ordered.map((r, i) => i === 0 ? '—' : C.formatMoney(BigInt(r.amountCents) - BigInt(ordered[0].amountCents)))]);
            report.append(table(headers, data, 'comparison-table'));
            save.disabled = false;
        }
        const save = U.button('导出对比', () => download(headers, data, '报价对比'), { disabled: true });
        search.addEventListener('input', paintList);
        diff.addEventListener('change', paint);
        base.addEventListener('change', paint);
        box.body.append(search, list, U.el('div', { class: 'setting-inline' }, U.el('label', { class: 'setting-check' }, diff, '只看不同项'), U.field('对比基准', base)), report);
        box.footer.append(save, U.button('关闭', () => box.close(), { tone: 'primary' }));
        paint();
        box.open();
        return box;
    }
    function marks({ columns, rows, value, onApply, onClose }) {
        const draft = C.clone(value || []), box = U.panel({ title: '条件标记', subtitle: '按顺序命中第一条启用规则；金额条件按元填写。只标记显示，不改变业务状态。', kind: 'drawer', onClose }), list = U.el('div'), error = U.el('p', { class: 'form-error', hidden: true, role: 'alert' });
        box.element.classList.add('report-dialog');
        let forms = [];
        const eligible = business(columns);
        function paint() {
            forms = [];
            list.replaceChildren(...draft.map((r, i) => {
                const select = U.el('select', { dataset: { markKey: 'true' }, 'aria-label': '标记字段', onchange: e => {
                        r.key = e.target.value;
                        r.op = R.normalizeFilter({}, r.key).operators[0];
                        r.value = '';
                        r.values = [];
                        delete r.basis;
                        paint();
                    } }, eligible.map(c => U.el('option', { value: c.key }, c.label)));
                select.value = r.key;
                const col = { ...eligible.find(c => c.key === r.key), filter: R.normalizeFilter({}, r.key), number: { enabled: false } };
                const form = root.QuoteFilterUI.editor(col, rows, r, next => Object.assign(r, next), true);
                forms.push(form);
                return U.el('section', { class: 'mark-rule' }, U.el('div', { class: 'setting-inline' }, U.el('label', { class: 'setting-check' }, U.el('input', { type: 'checkbox', checked: r.enabled !== false, onchange: e => r.enabled = e.target.checked }), '启用'), U.field('字段', select), U.field('提示文字', U.el('input', { value: r.label, maxlength: 24, dataset: { markLabel: 'true' }, oninput: e => r.label = e.target.value })), U.iconButton('up', '上移规则', () => {
                    const x = draft[i - 1];
                    draft[i - 1] = draft[i];
                    draft[i] = x;
                    paint();
                }, { disabled: !i }), U.iconButton('trash', '删除规则', () => {
                    draft.splice(i, 1);
                    paint();
                })), form.element, U.el('div', { class: 'setting-inline' }, U.field('文字颜色', U.el('input', { type: 'color', value: r.color || '#92400e', oninput: e => r.color = e.target.value })), U.field('背景颜色', U.el('input', { type: 'color', value: r.background || '#fffbeb', oninput: e => r.background = e.target.value }))));
            }));
        }
        box.body.append(list, U.button('添加规则', () => {
            if (draft.length < 30) {
                draft.push({ key: 'name', op: 'contains', value: '', label: '关注', enabled: true, color: '#92400e', background: '#fffbeb' });
                paint();
            }
        }, { id: 'mark-add', icon: 'plus' }), error);
        box.footer.append(U.button('取消', () => box.close()), U.button('应用标记', () => {
            try {
                forms.forEach(f => f.validate());
                draft.forEach((r, i) => Object.assign(r, forms[i].get()));
                onApply(R.normalizeMarks(draft, columns));
                box.close();
            }
            catch (e) {
                error.textContent = e.message;
                error.hidden = false;
            }
        }, { id: 'marks-apply', tone: 'primary' }));
        paint();
        box.open();
        return box;
    }
    function history({ entries, current, onRestore, onClose }) {
        const box = U.panel({ title: '设置历史', subtitle: '保留最近 20 次完整设置应用前的布局。恢复列、工具栏、排序和标记，不恢复报价数据或查询条件。', kind: 'drawer', onClose }), list = U.el('div', { id: 'history-list' });
        for (const [i, item] of entries.entries())
            list.append(U.el('section', { class: 'history-item' }, U.el('div', {}, U.el('strong', {}, item.label), U.el('p', { class: 'small-note' }, new Date(item.at).toLocaleString('zh-CN'))), U.button('查看差异', () => {
                const old = X.presentation(item.settings), now = X.presentation(current);
                const diff = [];
                for (const c of old.columns) {
                    const n = now.columns.find(v => v.key === c.key);
                    if (JSON.stringify(c) !== JSON.stringify(n))
                        diff.push([c.label, n?.label || c.key, '该列设置有变化']);
                }
                for (const [k, label] of [['toolbar', '工具栏'], ['actions', '操作按钮'], ['appearance', '表格外观'], ['sorts', '排序规则'], ['marks', '条件标记']])
                    if (JSON.stringify(old[k]) !== JSON.stringify(now[k]))
                        diff.push([label, '', '配置有变化']);
                const detail = U.panel({ title: '配置差异' });
                detail.body.append(table(['历史配置', '当前配置', '变化'], diff.length ? diff : [['—', '—', '与当前设置相同']]));
                detail.footer.append(U.button('关闭', () => detail.close()));
                detail.open();
            }), U.button('恢复这版', async () => {
                if (!await U.confirm({ title: '恢复表格设置？', message: '将覆盖当前布局和排序。当前布局会先保存为新的历史记录，报价与查询条件保持不变。', confirmText: '恢复这版' }))
                    return;
                onRestore(item.settings);
                box.close();
            }, { dataset: { restoreHistory: i }, tone: 'primary' })));
        if (!entries.length)
            list.append(U.el('p', { class: 'settings-empty' }, '暂无设置历史。应用表格设置后，这里会保留修改前的配置。'));
        box.body.append(list);
        box.footer.append(U.button('关闭', () => box.close()));
        box.open();
        return box;
    }
    class CellRange {
        constructor({ table, onCopy, getModel }) {
            this.table = table;
            this.onCopy = onCopy;
            this.getModel = getModel;
            this.enabled = false;
            this.a = null;
            this.b = null;
            this.bar = U.el('div', { id: 'range-summary', class: 'range-summary', hidden: true, role: 'status' });
            table.closest('#table-viewport').before(this.bar);
            table.addEventListener('pointerdown', e => {
                const td = e.target.closest('td[data-column]');
                if (!this.enabled || !td || td.dataset.column === 'actions' || e.target.closest('button,a,input,[data-resize]') || e.button !== 0)
                    return;
                e.preventDefault();
                this.dragging = true;
                this.a = this.point(td);
                this.b = this.a;
                td.focus({ preventScroll: true });
                this.paint();
            });
            table.addEventListener('pointerover', e => {
                const td = e.target.closest('td[data-column]');
                if (this.dragging && td && td.dataset.column !== 'actions') {
                    this.b = this.point(td);
                    this.paint();
                }
            });
            root.addEventListener('pointerup', () => this.dragging = false);
            root.addEventListener('blur', () => this.dragging = false);
            table.addEventListener('keydown', e => {
                if (!this.enabled || !e.target.closest('td[data-column]') || e.target.closest('button,a,input'))
                    return;
                if (e.key === 'Escape') {
                    this.a = this.b = null;
                    this.paint();
                }
                else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && this.a) {
                    e.preventDefault();
                    this.copy();
                }
                else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                    e.preventDefault();
                    const p = this.b || this.point(e.target.closest('td[data-column]'));
                    const { columns, items } = this.grid();
                    const next = { r: Math.min(items.length - 1, Math.max(0, p.r + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0))), c: Math.min(columns.length - 1, Math.max(0, p.c + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0))) };
                    this.a = e.shiftKey ? (this.a || p) : next;
                    this.b = next;
                    this.paint();
                    this.cells()?.find(t => {
                        const q = this.point(t);
                        return q.r === next.r && q.c === next.c;
                    })?.focus({ preventScroll: true });
                }
            });
        }
        grid() {
            const m = this.getModel();
            return { items: m.items, columns: [...this.table.querySelectorAll('thead th[data-column]')].map(n => m.columns.find(c => c.key === n.dataset.column)).filter(c => c && c.key !== 'actions') };
        }
        point(td) {
            const g = this.grid();
            return { r: g.items.findIndex(r => r.id === td.parentElement.dataset.rowId), c: g.columns.findIndex(c => c.key === td.dataset.column) };
        }
        cells() {
            return [...this.table.querySelectorAll('tbody td[data-column]:not([data-column="actions"])')];
        }
        toggle() {
            this.enabled = !this.enabled;
            this.reset();
        }
        reset() {
            this.a = this.b = null;
            this.dragging = false;
            this.paint();
        }
        selected() {
            if (!this.a || !this.b)
                return [];
            const { items, columns } = this.grid();
            return items.flatMap((row, r) => columns.flatMap((col, c) => r >= Math.min(this.a.r, this.b.r) && r <= Math.max(this.a.r, this.b.r) && c >= Math.min(this.a.c, this.b.c) && c <= Math.max(this.a.c, this.b.c) ? [{ row, col, r, c }] : []));
        }
        paint() {
            const selected = this.selected();
            for (const td of this.cells()) {
                if (this.enabled)
                    td.tabIndex = 0;
                else
                    td.removeAttribute('tabindex');
                const p = this.point(td);
                const yes = this.enabled && selected.some(s => s.r === p.r && s.c === p.c);
                td.classList.toggle('range-selected', yes);
                td.setAttribute('aria-selected', String(yes));
            }
            if (this.enabled)
                this.table.setAttribute('role', 'grid');
            else
                this.table.removeAttribute('role');
            for (const td of this.cells()) {
                if (this.enabled)
                    td.setAttribute('role', 'gridcell');
                else {
                    td.removeAttribute('role');
                    td.removeAttribute('aria-selected');
                }
            }
            this.table.classList.toggle('range-mode', this.enabled);
            this.bar.hidden = !this.enabled;
            if (!this.enabled)
                return;
            const amounts = selected.filter(s => s.col.key === 'amountCents'), sum = amounts.reduce((n, s) => n + BigInt(s.row.amountCents), 0n);
            let text = selected.length ? `当前页已选 ${selected.length} 个单元格` : '区域选择已开启：拖动框选，Shift + 方向键扩选，Ctrl/Cmd+C 复制。';
            if (amounts.length) {
                const vals = amounts.map(s => s.row.amountCents);
                text += ` · ${amounts.length} 个金额 · 合计 ¥ ${C.formatMoney(sum)} · 平均 ¥ ${R.formatNumber(sum, { minDigits: 2, maxDigits: 2 }, 100 * amounts.length)} · 最小 ${C.formatMoney(Math.min(...vals))} · 最大 ${C.formatMoney(Math.max(...vals))}`;
            }
            this.bar.replaceChildren(U.el('span', {}, text), U.button('复制区域', () => this.copy(), { tone: 'text', disabled: !selected.length }), U.button('退出', () => this.toggle(), { tone: 'text' }));
        }
        copy() {
            const chosen = this.selected(), rs = [];
            let last = -1;
            for (const { row, col, r } of chosen) {
                if (r !== last) {
                    rs.push([]);
                    last = r;
                }
                const v = X.formatValue(row, col);
                rs.at(-1).push(C.csvCell(v));
            }
            return this.onCopy(rs.map(r => r.join('\t')).join('\r\n'));
        }
    }
    root.QuoteWorkbench = Object.freeze({ grouping, comparison, marks, history, CellRange });
})(globalThis);
