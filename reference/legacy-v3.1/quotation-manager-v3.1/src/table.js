/* 表格仅消费视图模型；原始数据和配置写入由控制器负责。 */
(function (root) {
    'use strict';
    const C = root.QuoteCore, U = root.QuoteUI, Config = root.QuoteConfig, X = root.QuoteCustomization, Menu = root.QuoteMenus;
    class QuoteTable {
        constructor(options) {
            Object.assign(this, options);
            const { table, viewport } = this;
            if (this.preview) return;
            table.addEventListener('click', event => {
                const target = event.target.closest('[data-table-action]');
                if (!target)
                    return;
                const { tableAction, key, id } = target.dataset;
                if (tableAction === 'sort')
                    this.onSort(key);
                else
                    this.onAction(tableAction, id);
            });
            table.addEventListener('contextmenu', event => {
                const th = event.target.closest('th[data-column]');
                if (th) {
                    event.preventDefault();
                    this.headerMenu(th.dataset.column, th.querySelector('.column-menu-trigger') || th);
                }
            });
            table.addEventListener('change', event => {
                const input = event.target;
                if (input.matches('[data-select-row]'))
                    this.onSelect(input.dataset.selectRow, input.checked);
                if (input.matches('[data-select-page]'))
                    this.onSelectPage(input.checked);
            });
            table.addEventListener('pointerdown', event => this.startResize(event));
            table.addEventListener('dblclick', event => {
                const handle = event.target.closest('[data-resize]');
                if (handle) {
                    event.preventDefault();
                    this.onResetWidth(handle.dataset.resize);
                }
            });
            table.addEventListener('keydown', event => {
                const handle = event.target.closest('[data-resize]');
                if (!handle || !['ArrowLeft', 'ArrowRight'].includes(event.key))
                    return;
                event.preventDefault();
                const col = this.model.columns.find(c => c.key === handle.dataset.resize);
                this.onResize(col.key, col.width + (event.key === 'ArrowRight' ? 10 : -10));
            });
            this.lastWidth = 0;
            this.observer = new ResizeObserver(() => {
                const width = viewport.clientWidth;
                if (!this.model || width === this.lastWidth)
                    return;
                this.lastWidth = width;
                cancelAnimationFrame(this.frame);
                this.frame = requestAnimationFrame(() => this.render(this.model));
            });
            this.observer.observe(viewport);
        }
        headerMenu(key, anchor) {
            const col = this.model.columns.find(c => c.key === key);
            if (!col)
                return;
            const run = action => () => this.onHeaderAction?.(key, action);
            const items = [{ label: '重命名列', icon: 'edit', onSelect: run('rename') }, { label: '设置此列', icon: 'settings', onSelect: run('settings') }];
            if (col.filter?.enabled)
                items.push({ label: '筛选此列', icon: 'filter', onSelect: run('filter') });
            if (col.sortable)
                items.push({ separator: true }, { label: '升序排列', icon: 'arrowUp', onSelect: run('asc') }, { label: '降序排列', icon: 'arrowDown', onSelect: run('desc') }, { label: '取消此列排序', onSelect: run('unsort') });
            items.push({ separator: true }, { label: col.pin === 'left' ? '取消左侧冻结' : '冻结在左侧', icon: 'pinLeft', onSelect: run('left') }, { label: col.pin === 'right' ? '取消右侧冻结' : '冻结在右侧', icon: 'pinRight', onSelect: run('right') }, { label: '恢复默认列宽', onSelect: run('width') });
            Menu.open(anchor, items, `${col.label}设置`);
        }
        render(model) {
            Menu.closeFor(this.table);
            this.model = model;
            this.lastWidth = this.viewport.clientWidth;
            const focusKey = this.table.contains(document.activeElement) ? document.activeElement.dataset.focus : '';
            const appearance = X.normalizeAppearance(model.appearance), sorts = X.normalizeSorts(model.sorts || model.sort, model.columns);
            const layout = C.layoutColumns(model.columns, model.batchMode, this.lastWidth, appearance.rowNumbers);
            this.layout = layout;
            this.table.style.width = `${layout.totalWidth}px`;
            this.table.className = `quote-table density-${model.density} custom-table ${appearance.striped ? 'is-striped' : ''} ${appearance.hover ? '' : 'no-hover'} borders-${appearance.borders}`;
            this.cols.replaceChildren(...[
                ...(model.batchMode ? [U.el('col', { style: { width: '44px' } })] : []),
                ...(appearance.rowNumbers ? [U.el('col', { style: { width: '48px' } })] : []),
                ...layout.columns.map(col => U.el('col', { style: { width: `${col.width}px` } }))
            ]);
            const header = document.createDocumentFragment();
            if (model.batchMode) {
                const selected = model.items.filter(r => model.selected.has(r.id)).length;
                header.append(U.el('th', { scope: 'col', class: 'check-cell pinned', style: { left: '0px' } }, U.el('input', { type: 'checkbox', 'aria-label': '选择当前页全部报价', checked: !!model.items.length && selected === model.items.length, indeterminate: selected > 0 && selected < model.items.length, disabled: !model.items.length, dataset: { selectPage: 'true', focus: 'select-page' } })));
            }
            if (appearance.rowNumbers)
                header.append(U.el('th', { scope: 'col', class: 'number-cell pinned', style: { left: `${layout.selectionWidth}px` } }, '序号'));
            for (const col of layout.columns) {
                const index = sorts.findIndex(s => s.key === col.key), rule = sorts[index];
                const th = this.cell('th', col);
                th.setAttribute('scope', 'col');
                const content = U.el('div', { class: 'header-content' });
                if (col.sortable) {
                    th.setAttribute('aria-sort', rule ? index === 0 ? (rule.order === 'asc' ? 'ascending' : 'descending') : 'other' : 'none');
                    const next = !rule ? '升序' : rule.order === 'asc' ? '降序' : '取消排序';
                    content.append(U.el('button', { type: 'button', class: 'sort-button', title: col.description || col.label, dataset: { tableAction: 'sort', key: col.key, focus: `sort-${col.key}` }, 'aria-label': `${col.label}：${next}` }, U.el('span', {}, col.label), U.icon(rule ? (rule.order === 'asc' ? 'arrowUp' : 'arrowDown') : 'sort'), sorts.length > 1 && rule ? U.el('small', { class: 'sort-priority' }, String(index + 1)) : null));
                }
                else
                    content.append(U.el('span', { class: 'header-label', title: col.description || col.label }, col.label));
                const menu = U.iconButton('more', `${col.label}列菜单`, () => this.headerMenu(col.key, menu), { className: 'icon-btn column-menu-trigger', 'aria-haspopup': 'menu', 'aria-expanded': 'false', dataset: { focus: `col-menu-${col.key}` } });
                if (col.filter?.enabled && col.key !== 'actions') {
                    const active = Boolean(model.columnFilters?.[col.key]);
                    content.append(U.iconButton('filter', `筛选${col.label}`, e => {
                        e.stopPropagation();
                        this.onHeaderAction?.(col.key, 'filter');
                    }, { className: `icon-btn column-filter-trigger${active ? ' is-active' : ''}`, 'aria-pressed': String(active), dataset: { columnFilter: col.key, focus: `filter-${col.key}` } }));
                }
                content.append(menu);
                th.append(content);
                th.append(U.el('span', { class: 'resize-handle', role: 'separator', tabindex: '0', 'aria-label': `调整${col.label}列宽`, 'aria-orientation': 'vertical', 'aria-valuemin': col.minWidth, 'aria-valuemax': Math.max(640, col.width), 'aria-valuenow': Math.round(col.width), title: '拖动调整列宽，双击恢复；方向键微调', dataset: { resize: col.key, focus: `resize-${col.key}` } }));
                header.append(th);
            }
            this.head.replaceChildren(header);
            const fragment = document.createDocumentFragment(), fits = [];
            if (!model.items.length)
                fragment.append(U.el('tr', {}, U.el('td', { colspan: layout.columns.length + (model.batchMode ? 1 : 0) + (appearance.rowNumbers ? 1 : 0), class: 'empty-cell' }, U.el('div', { class: 'empty-state' }, U.el('span', { class: 'empty-icon' }, U.icon('folder')), U.el('p', {}, model.hasAnyRows ? '没有找到符合条件的报价' : '暂无报价'), U.el('small', {}, model.hasAnyRows ? '调整查询条件后再试试。' : '点击新增报价，创建第一条记录。'), U.button(model.hasAnyRows ? '清除条件' : '新增报价', () => this.onAction(model.hasAnyRows ? 'reset' : 'create'), { tone: 'text' })))));
            else {
                const customerVisible = layout.columns.some(c => c.key === 'customer');
                model.items.forEach((row, rowIndex) => {
                    const mark = root.QuoteRules.rowMark(row, model.marks, model.columns);
                    const tr = U.el('tr', { class: model.selected.has(row.id) ? 'is-selected' : '', dataset: { rowId: row.id } });
                    if (mark) {
                        tr.style.setProperty('--mark-background', mark.background);
                        tr.classList.add('has-rule-mark');
                    }
                    if (model.batchMode)
                        tr.append(U.el('td', { class: 'check-cell pinned', style: { left: '0px' } }, U.el('input', { type: 'checkbox', checked: model.selected.has(row.id), 'aria-label': `选择报价 ${row.id}`, dataset: { selectRow: row.id, focus: `select-${row.id}` } })));
                    if (appearance.rowNumbers)
                        tr.append(U.el('td', { class: 'number-cell pinned', style: { left: `${layout.selectionWidth}px` } }, String((model.page - 1) * model.pageSize + rowIndex + 1)));
                    for (const col of layout.columns) {
                        const td = this.cell('td', col), value = X.formatValue(row, col);
                        if (col.key === 'actions') {
                            const actions = root.QuoteActions.render(row, model.actions, (...args) => this.onAction(...args), { preview: !!this.preview });
                            td.append(actions.element);
                            fits.push(actions.fit);
                        }
                        else {
                            const group = U.el('div', { class: `cell-value-group wrap-${col.wrap}` });
                            let main;
                            if (col.key === 'id')
                                main = U.el('button', { type: 'button', class: 'text-link cell-id cell-main', dataset: { tableAction: 'detail', id: row.id, focus: `detail-${row.id}` }, title: `查看 ${row.id}` }, value);
                            else if (col.key === 'status')
                                main = U.el('span', { class: `status-pill status-${Config.STATUS[row.status]?.tone || 'neutral'}` }, value);
                            else
                                main = U.el('div', { class: `cell-main ${col.key === 'name' ? 'cell-name' : col.key === 'amountCents' ? 'money' : ['date', 'createdDate'].includes(col.key) ? 'date-value' : 'cell-ellipsis'}`, title: value }, value);
                            if (col.template?.enabled || col.mapping?.enabled) {
                                const special = root.QuoteRichText.renderCell(row, col, model.columns);
                                if (col.key === 'id')
                                    main.replaceChildren(special);
                                else
                                    main = special;
                            }
                            const text = U.el('div', { class: 'cell-text' }, main);
                            if (col.key === 'name' && col.showCustomer && !customerVisible && !col.template?.enabled)
                                text.append(U.el('div', { class: 'cell-customer', title: row.customer }, row.customer));
                            if (mark && col.key === mark.key)
                                text.append(U.el('span', { class: 'row-mark', style: { color: mark.color, backgroundColor: mark.background } }, U.icon('info'), mark.label));
                            if (col.key === 'date' && row.date < C.today() && row.status !== 'contract')
                                text.append(U.el('div', { class: 'expired-label' }, '已过期'));
                            group.append(text);
                            if (col.copyable)
                                group.append(U.iconButton('copy', `复制${col.label}`, e => {
                                    e.stopPropagation();
                                    this.onAction('copyValue', row.id, { value });
                                }, { className: 'icon-btn cell-copy', dataset: { focus: `copy-${row.id}-${col.key}` } }));
                            td.append(group);
                        }
                        tr.append(td);
                    }
                    fragment.append(tr);
                });
            }
            this.body.replaceChildren(fragment);
            fits.forEach(fit => fit());
            if (focusKey)
                this.table.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
        }
        cell(tag, col) {
            const style = X.styleCSS(X.effectiveStyle(col, this.model.appearance, tag === 'th' ? 'header' : 'body'));
            if (col.pin)
                style[col.pin] = `${col.offset}px`;
            return U.el(tag, { class: [col.pin ? 'pinned' : '', col.boundary ? `boundary-${col.pin}` : '', col.align === 'right' ? 'align-right' : ''].join(' '), dataset: { column: col.key }, style });
        }
        startResize(event) {
            const handle = event.target.closest('[data-resize]');
            if (!handle || event.button !== 0)
                return;
            event.preventDefault();
            const col = this.layout.columns.find(item => item.key === handle.dataset.resize);
            const startX = event.clientX;
            const guide = U.el('div', { class: 'resize-guide', style: { left: `${startX}px` } });
            document.body.append(guide);
            document.documentElement.classList.add('is-resizing');
            const controller = new AbortController();
            const finish = commit => {
                controller.abort();
                guide.remove();
                document.documentElement.classList.remove('is-resizing');
                // 单击不重绘表头，否则第二次单击的目标被替换，浏览器无法派发 dblclick。
                if (commit && lastX !== startX)
                    this.onResize(col.key, Math.max(col.minWidth, Math.min(640, col.width + lastX - startX)));
            };
            let lastX = startX;
            document.addEventListener('pointermove', move => {
                lastX = move.clientX;
                guide.style.left = `${lastX}px`;
            }, { signal: controller.signal });
            document.addEventListener('pointerup', () => finish(true), { once: true, signal: controller.signal });
            document.addEventListener('pointercancel', () => finish(false), { once: true, signal: controller.signal });
            document.addEventListener('keydown', key => {
                if (key.key === 'Escape')
                    finish(false);
            }, { signal: controller.signal });
            window.addEventListener('blur', () => finish(false), { once: true, signal: controller.signal });
        }
    }
    root.QuoteTable = QuoteTable;
})(globalThis);
