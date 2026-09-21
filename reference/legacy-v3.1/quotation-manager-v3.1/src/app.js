/* 页面控制器：编排状态、视图和用户操作。数据处理规则放在 core.js。 */
(function () {
    'use strict';
    const Config = window.QuoteConfig, C = window.QuoteCore, U = window.QuoteUI, X = window.QuoteCustomization, E = window.QuoteExportData;
    const $ = id => document.getElementById(id);
    document.querySelectorAll('[data-icon]').forEach(node => node.replaceChildren(U.icon(node.dataset.icon)));
    const notices = new U.Notices($('toast-host'));
    const popover = new U.Popover();
    const warn = message => {
        $('storage-warning').textContent = message;
        $('storage-warning').hidden = false;
    };
    let storage = null;
    try {
        storage = window.localStorage;
    }
    catch {
        warn('本地存储不可用，当前修改只保留到页面关闭。');
    }
    const repo = new window.QuoteRepository.LocalRepository({ storage, onWarning: warn });
    const preferences = new window.QuoteRepository.Preferences(storage, warn);
    const stored = preferences.read();
    const base = C.normalizeSnapshot();
    const defaultViews = [
        { id: 'all', name: '全部报价', snapshot: C.clone(base) },
        { id: 'mine', name: '我负责的未结报价', snapshot: C.normalizeSnapshot({ filters: { owner: Config.CURRENT_USER, status: 'open' } }) },
        { id: 'customer', name: '澄川水务专属', snapshot: C.normalizeSnapshot({ filters: { customer: '澄川水务' } }) }
    ];
    let views;
    try {
        if (!Array.isArray(stored.views))
            views = C.clone(defaultViews);
        else {
            const ids = new Set(['all']), names = new Set(['全部报价']);
            views = [C.clone(defaultViews[0])];
            for (const item of stored.views.slice(0, 50)) {
                if (!item || item.id === 'all')
                    continue;
                if (typeof item.id !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id))
                    continue;
                const name = C.text(item.name);
                if (!name || name.length > 30 || names.has(name))
                    continue;
                views.push({ id: item.id, name, snapshot: C.normalizeSnapshot(item.snapshot) });
                ids.add(item.id);
                names.add(name);
            }
        }
    }
    catch {
        views = C.clone(defaultViews);
        warn('已保存的视图格式不正确，已使用默认视图。');
    }
    let defaultViewId = views.some(view => view.id === stored.defaultViewId) ? stored.defaultViewId : 'all';
    let currentViewId = defaultViewId;
    let initial;
    try {
        initial = currentViewId === 'all' ? C.normalizeSnapshot({ ...stored.layout, filters: {} }) : C.clone(views.find(view => view.id === currentViewId).snapshot);
    }
    catch {
        initial = C.clone(base);
    }
    if (stored.layout?.toolbar && !stored.layout.toolbar.byView)
        initial.toolbar = window.QuoteRules.normalizeToolbar(stored.layout.toolbar);
    const state = { ...initial, rows: repo.list(), selected: new Set(), batchMode: false, page: 1, filtered: [], pagination: null,
        searchVisible: stored.searchVisible !== false, advanced: stored.advanced === true };
    let exportPresets = E.normalizePresets(stored.exportPresets);
    let settingsHistory = (Array.isArray(stored.settingsHistory) ? stored.settingsHistory : []).slice(0, 20).flatMap(item => {
        try {
            if (typeof item?.at !== 'string' || !Number.isFinite(Date.parse(item.at)))
                return [];
            return [{ at: item.at, label: C.text(item.label).slice(0, 40), settings: X.presentation(item.settings) }];
        }
        catch {
            return [];
        }
    });
    let rangeSelection = null;
    function rememberSettings(label) {
        const settings = X.presentation(state);
        if (settingsHistory[0] && JSON.stringify(settingsHistory[0].settings) === JSON.stringify(settings))
            return;
        settingsHistory.unshift({ at: new Date().toISOString(), label, settings });
        settingsHistory = settingsHistory.slice(0, 20);
    }
    let openDrawer = null;
    let table;
    const toolbar = new window.QuoteToolbar();
    const guard = fn => (...args) => {
        Promise.resolve().then(() => fn(...args)).catch(error => notices.show(error.message || '操作失败，请重试。', 'error'));
    };
    const bind = (id, event, handler) => $(id).addEventListener(event, guard(handler));
    const snapshot = () => C.normalizeSnapshot(state);
    function persist() {
        return preferences.write({ views, defaultViewId, layout: X.presentation(state), exportPresets, settingsHistory,
            searchVisible: state.searchVisible, advanced: state.advanced });
    }
    function currentView() {
        return views.find(view => view.id === currentViewId) || views[0];
    }
    function readSearch() {
        return Object.fromEntries(Object.keys(C.EMPTY_FILTERS).map(key => [key, $(`filter-${key}`).value]));
    }
    function draftChanged() {
        try {
            return JSON.stringify(C.normalizeFilters(readSearch())) !== JSON.stringify(state.filters);
        }
        catch {
            return true;
        }
    }
    function viewChanged() {
        if (currentViewId === 'all')
            return JSON.stringify(state.filters) !== JSON.stringify(C.EMPTY_FILTERS) || Object.keys(state.columnFilters || {}).length > 0 || state.advancedQuery?.rules.length > 0;
        return C.snapshotKey(snapshot()) !== C.snapshotKey(currentView().snapshot);
    }
    function fillSearch() {
        for (const [key, value] of Object.entries(state.filters))
            $(`filter-${key}`).value = value;
        $('search-error').hidden = true;
        if (['owner', 'region', 'createdFrom', 'createdTo'].some(key => state.filters[key]))
            state.advanced = true;
        renderSearchVisibility();
    }
    function refreshOptions() {
        const draft = readSearch();
        const union = (key, extra = []) => [...new Set([...state.rows.map(row => row[key]), draft[key], state.filters[key], ...views.map(view => view.snapshot.filters[key]), ...extra].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
        U.options($('filter-customer'), union('customer'), '全部客户');
        U.options($('filter-owner'), union('owner', [Config.CURRENT_USER]), '全部负责人');
        U.options($('filter-region'), Config.REGIONS, '全部大区');
    }
    function renderSearchVisibility() {
        $('search-form').hidden = !state.searchVisible;
        $('search-toggle-button').setAttribute('aria-expanded', String(state.searchVisible));
        $('search-toggle-button').classList.toggle('is-active', state.searchVisible);
        $('advanced-fields').hidden = !state.advanced;
        $('advanced-button').setAttribute('aria-expanded', String(state.advanced));
        $('advanced-label').textContent = state.advanced ? '收起' : '展开';
    }
    function updateFilterSummary() {
        const labels = { keyword: '关键词', customer: '客户', status: '状态', owner: '负责人', region: '大区', createdFrom: '创建自', createdTo: '创建至' };
        const chips = [];
        for (const [key, value] of Object.entries(state.filters)) {
            if (!value)
                continue;
            const caption = key === 'status' ? value === 'open' ? '未结' : Config.STATUS[value].label : value;
            const close = U.iconButton('close', `移除${labels[key]}条件`, () => {
                state.filters = { ...state.filters, [key]: '' };
                state.page = 1;
                state.selected.clear();
                fillSearch();
                render();
            });
            chips.push(U.el('span', { class: 'filter-chip' }, U.el('span', { title: `${labels[key]}：${caption}` }, `${labels[key]}：${caption}`), close));
        }
        for (const [key, rule] of Object.entries(state.columnFilters || {})) {
            const col = state.columns.find(c => c.key === key);
            if (!col)
                continue;
            const label = window.QuoteFilterUI.summary(col, rule);
            chips.push(U.el('span', { class: 'filter-chip', title: label }, U.el('span', {}, label), U.iconButton('close', `清除${col.label}列筛选`, () => {
                delete state.columnFilters[key];
                state.page = 1;
                state.selected.clear();
                render();
            })));
        }
        if (state.advancedQuery?.rules.length) {
            chips.push(U.el('span', { class: 'filter-chip' }, U.button(`组合条件 ${state.advancedQuery.rules.length} 项`, openAdvancedQuery, { tone: 'text' }), U.iconButton('close', '清除组合条件', () => {
                state.advancedQuery = { join: 'and', rules: [] };
                state.page = 1;
                state.selected.clear();
                render();
            })));
        }
        if (chips.length)
            chips.push(U.button('清除条件', reset, { tone: 'text', className: 'chip-clear' }));
        $('filter-chips').replaceChildren(...chips);
        const pending = draftChanged();
        $('query-pending').hidden = !pending;
        $('filter-summary').hidden = !chips.length && !pending;
        $('view-modified').hidden = !viewChanged();
    }
    function renderPagination() {
        const p = state.pagination;
        $('page-info').textContent = p.total ? `共 ${p.total} 条 · 第 ${p.from}–${p.to} 条` : '共 0 条';
        $('page-size').value = String(p.pageSize);
        $('page-jump').max = String(p.pages);
        $('page-jump').value = String(p.page);
        const make = (label, page, { disabled = false, current = false, iconName } = {}) => U.el('button', { type: 'button', class: 'page-btn', disabled,
            'aria-label': iconName ? label : `第 ${page} 页`, 'aria-current': current ? 'page' : undefined, onclick: () => goPage(page) }, iconName ? U.icon(iconName) : label);
        const buttons = [make('上一页', p.page - 1, { disabled: p.page <= 1, iconName: 'left' })];
        const pages = [...new Set([1, p.pages, p.page - 1, p.page, p.page + 1].filter(number => number >= 1 && number <= p.pages))].sort((a, b) => a - b);
        let previous = 0;
        for (const page of pages) {
            if (page - previous > 1)
                buttons.push(U.el('span', { class: 'page-ellipsis', 'aria-hidden': 'true' }, '…'));
            buttons.push(make(String(page), page, { current: page === p.page }));
            previous = page;
        }
        buttons.push(make('下一页', p.page + 1, { disabled: p.page >= p.pages, iconName: 'right' }));
        $('page-buttons').replaceChildren(...buttons);
    }
    function render() {
        state.filtered = window.QuoteRules.applyFilters(C.queryRows(state.rows, state.filters, state.sorts, state.columns), state.columns, state.columnFilters, state.advancedQuery);
        const visibleIds = new Set(state.filtered.map(row => row.id));
        for (const id of state.selected)
            if (!visibleIds.has(id))
                state.selected.delete(id);
        state.pagination = C.paginate(state.filtered, state.page, state.pageSize);
        state.page = state.pagination.page;
        $('result-count').textContent = String(state.filtered.length);
        $('current-view-name').textContent = currentView().name;
        const selecting = state.batchMode && state.selected.size > 0;
        $('table-title').hidden = selecting;
        $('selection-bar').hidden = !selecting;
        $('selected-count').textContent = String(state.selected.size);
        $('batch-button').classList.toggle('is-active', state.batchMode);
        $('batch-button').setAttribute('aria-pressed', String(state.batchMode));
        $('select-filtered-button').textContent = `选择全部 ${state.filtered.length} 条`;
        $('select-filtered-button').hidden = state.selected.size === state.filtered.length;
        $('export-button').disabled = !state.filtered.length;
        const sortHint = state.sorts.map(rule => `${state.columns.find(col => col.key === rule.key).label} ${rule.order === 'asc' ? '升序' : '降序'}`).join('，');
        $('sort-settings-button').classList.toggle('is-active', state.sorts.length > 0);
        $('sort-settings-button').title = sortHint ? `排序规则：${sortHint}` : '排序规则';
        const sumRows = selecting ? state.filtered.filter(row => state.selected.has(row.id)) : state.filtered;
        $('amount-label').textContent = selecting ? '所选合计' : '筛选合计';
        $('amount-total').textContent = `¥ ${C.formatMoney(C.sumMoney(sumRows))}`;
        renderPagination();
        updateFilterSummary();
        table.render({ ...state, items: state.pagination.items, hasAnyRows: state.rows.length > 0 });
        toolbar.apply(state.toolbar);
        rangeSelection?.reset();
    }
    function query(event) {
        event?.preventDefault();
        try {
            const filters = C.normalizeFilters(readSearch());
            state.filters = filters;
            state.page = 1;
            state.selected.clear();
            fillSearch();
            render();
            $('table-viewport').scrollTop = 0;
        }
        catch (error) {
            $('search-error').textContent = error.message;
            $('search-error').hidden = false;
            if (!state.advanced) {
                state.advanced = true;
                renderSearchVisibility();
            }
        }
    }
    function reset() {
        state.filters = C.clone(C.EMPTY_FILTERS);
        state.columnFilters = {};
        state.advancedQuery = { join: 'and', rules: [] };
        state.selected.clear();
        state.page = 1;
        currentViewId = 'all';
        fillSearch();
        render();
    }
    function goPage(page) {
        if (!Number.isInteger(page) || page < 1 || page > state.pagination.pages) {
            notices.show(`请输入 1–${state.pagination.pages} 之间的页码。`, 'info');
            return;
        }
        state.page = page;
        render();
        $('table-viewport').scrollTop = 0;
    }
    function refresh() {
        state.rows = repo.list(true);
        $('external-warning').hidden = true;
        refreshOptions();
        render();
        notices.show(repo.isTemporary ? '已刷新当前页面数据。' : '已读取最新本地数据。');
    }
    function openEditor(row = null, copy = false) {
        popover.close();
        if (openDrawer)
            return;
        openDrawer = window.QuoteForms.editor({ row, copy, rows: state.rows,
            onSave: (values, version) => row && !copy ? repo.update(row.id, values, version) : repo.create(values),
            onClose: () => {
                openDrawer = null;
            },
            onSaved: saved => {
                state.rows = repo.list();
                refreshOptions();
                render();
                const visible = state.filtered.some(item => item.id === saved.id);
                notices.show(visible ? '报价已保存。' : '报价已保存，当前查询条件下不显示此记录。');
            }
        });
    }
    function openDetail(id) {
        const row = state.rows.find(item => item.id === id);
        if (!row)
            return;
        popover.close();
        if (openDrawer)
            return;
        openDrawer = window.QuoteForms.detail(row, { columns: state.columns, onEdit: record => openEditor(record), onCopy: record => openEditor(record, true), onClose: () => {
                openDrawer = null;
            } });
    }
    async function remove(ids) {
        const records = state.rows.filter(row => ids.includes(row.id));
        if (!records.length) {
            notices.show('请先选择要删除的报价。', 'info');
            return;
        }
        const message = records.length === 1 ? `确认删除报价 ${records[0].id}？\n${records[0].name}\n\n删除后无法直接恢复，重要数据请先备份。` :
            `确认删除选中的 ${records.length} 条报价？\n删除范围包括其他页已选中的记录。删除后无法直接恢复，重要数据请先备份。`;
        const confirmed = await U.confirm({ title: records.length === 1 ? '删除报价' : '批量删除', message, confirmText: '确认删除', danger: true });
        if (!confirmed)
            return;
        repo.remove(ids);
        state.rows = repo.list();
        ids.forEach(id => state.selected.delete(id));
        refreshOptions();
        render();
        notices.show(`已删除 ${records.length} 条报价。`);
    }
    table = new window.QuoteTable({ viewport: $('table-viewport'), table: $('quote-table'), head: $('table-head'), body: $('table-body'), cols: $('table-cols'),
        onAction: guard((action, id, detail = {}) => {
            if (action === 'detail')
                openDetail(id);
            else if (action === 'edit')
                openEditor(state.rows.find(row => row.id === id));
            else if (action === 'copy')
                openEditor(state.rows.find(row => row.id === id), true);
            else if (action === 'copyId')
                return copyText(id);
            else if (action === 'copyValue')
                return copyText(detail.value);
            else if (action === 'export')
                return exportSingle(id, detail.format);
            else if (action === 'delete')
                return remove([id]);
            else if (action === 'reset')
                reset();
            else if (action === 'create')
                openEditor();
        }),
        onSort: key => {
            const rule = state.sorts.find(item => item.key === key);
            // 表头操作为单字段三态；组合排序在“排序规则”中配置。
            setSorts(!rule ? [{ key, order: 'asc' }] : rule.order === 'asc' ? [{ key, order: 'desc' }] : []);
        },
        onHeaderAction: guard(headerAction),
        onSelect: (id, selected) => {
            if (selected)
                state.selected.add(id);
            else
                state.selected.delete(id);
            render();
        },
        onSelectPage: selected => {
            state.pagination.items.forEach(row => selected ? state.selected.add(row.id) : state.selected.delete(row.id));
            render();
        },
        onResize: (key, width) => {
            state.columns = C.normalizeColumns(state.columns.map(col => col.key === key ? { ...col, width } : col));
            persist();
            render();
        },
        onResetWidth: key => {
            state.columns = state.columns.map(col => col.key === key ? { ...col, width: Config.COLUMNS.find(item => item.key === key).width } : col);
            persist();
            render();
        }
    });
    function openColumnFilter(key) {
        const col = state.columns.find(c => c.key === key);
        if (!col?.filter?.enabled || openDrawer)
            return;
        popover.close();
        window.QuoteMenus.close();
        openDrawer = window.QuoteFilterUI.open({ col, rows: state.rows, current: state.columnFilters[key], onClose: () => openDrawer = null, onApply: rule => {
                if (rule)
                    state.columnFilters[key] = rule;
                else
                    delete state.columnFilters[key];
                state.page = 1;
                state.selected.clear();
                render();
            } });
    }
    function openAdvancedQuery() {
        if (openDrawer)
            return;
        popover.close();
        openDrawer = window.QuoteFilterUI.advanced({ columns: state.columns, rows: state.rows, value: state.advancedQuery, onClose: () => openDrawer = null, onApply: q => {
                state.advancedQuery = q;
                state.page = 1;
                state.selected.clear();
                render();
            } });
    }
    function openReadTool(name) {
        if (openDrawer)
            return;
        popover.close();
        const shared = { columns: state.columns, rows: state.filtered, onClose: () => openDrawer = null };
        if (name === 'groups')
            openDrawer = window.QuoteWorkbench.grouping(shared);
        else if (name === 'compare')
            openDrawer = window.QuoteWorkbench.comparison({ ...shared, selected: state.selected });
        else if (name === 'marks')
            openDrawer = window.QuoteWorkbench.marks({ ...shared, value: state.marks, onApply: marks => {
                    rememberSettings('应用条件标记');
                    state.marks = marks;
                    persist();
                    render();
                } });
        else if (name === 'history')
            openDrawer = window.QuoteWorkbench.history({ entries: settingsHistory.slice(), current: snapshot(), onClose: shared.onClose, onRestore: settings => {
                    rememberSettings('恢复历史设置');
                    Object.assign(state, C.normalizeSnapshot({ ...state, ...X.presentation(settings) }));
                    persist();
                    render();
                } });
    }
    function openDataTools() {
        window.QuoteMenus.open($('data-tools-button'), [
            { label: '组合筛选', icon: 'filter', onSelect: openAdvancedQuery },
            { label: '条件标记', icon: 'info', onSelect: () => openReadTool('marks') },
            { label: '分组汇总', icon: 'rows', onSelect: () => openReadTool('groups') },
            { label: '记录对比', icon: 'columns', onSelect: () => openReadTool('compare') },
            { label: rangeSelection.enabled ? '关闭区域选择' : '开启区域选择', icon: 'batch', onSelect: () => rangeSelection.toggle() },
            { separator: true }, { label: '设置历史', icon: 'clock', onSelect: () => openReadTool('history') },
            { label: '工具栏设置', icon: 'settings', onSelect: () => openSettings('toolbar') }
        ], '数据工具');
    }
    rangeSelection = new window.QuoteWorkbench.CellRange({ table: $('quote-table'), getModel: () => table.model, onCopy: copyText });
    function setSorts(rules) {
        state.sorts = X.normalizeSorts(rules, state.columns);
        state.sort = state.sorts[0] || { key: '', order: '' };
        state.page = 1;
        persist();
        render();
    }
    function openSettings(tab = 'columns', columnKey = 'name', columns) {
        popover.close();
        window.QuoteMenus.close();
        if (openDrawer)
            return;
        openDrawer = window.QuoteSettings.open({
            snapshot: columns ? C.normalizeSnapshot({ ...snapshot(), columns }) : snapshot(),
            baselineSnapshot: snapshot(),
            rows: state.rows, tab, columnKey,
            onClose: () => {
                openDrawer = null;
            },
            onApply: next => {
                rememberSettings('应用表格设置');
                Object.assign(state, C.normalizeSnapshot({ ...next, filters: state.filters }));
                state.page = 1;
                const durable = persist();
                render();
                notices.show(durable ? '表格设置已应用。' : '设置已在本页应用，未保存到本地。', durable ? 'success' : 'info');
            }
        });
    }
    function headerAction(key, action) {
        const col = state.columns.find(item => item.key === key);
        if (!col)
            return;
        if (action === 'filter') {
            openColumnFilter(key);
            return;
        }
        if (action === 'settings') {
            openSettings('columns', key);
            return;
        }
        if (action === 'rename') {
            renameColumn(key);
            return;
        }
        if (['asc', 'desc', 'unsort'].includes(action)) {
            const rules = state.sorts.filter(rule => rule.key !== key);
            if (action !== 'unsort')
                rules.unshift({ key, order: action });
            setSorts(rules);
            return;
        }
        if (['left', 'right'].includes(action))
            col.pin = col.pin === action ? '' : action;
        if (action === 'width')
            col.width = Config.COLUMNS.find(item => item.key === key).width;
        persist();
        render();
    }
    function renameColumn(key) {
        const col = state.columns.find(item => item.key === key);
        const box = U.panel({ title: '重命名列', subtitle: '只修改显示名称，不改变字段和原始数据。' });
        const form = U.el('form', { id: 'rename-column-form' });
        const input = U.el('input', { id: 'rename-column-input', value: col.label, maxlength: 30, autofocus: true });
        const error = U.el('p', { class: 'form-error', role: 'alert', hidden: true });
        form.append(U.field('列名称', input), error);
        form.addEventListener('submit', event => {
            event.preventDefault();
            const next = snapshot();
            next.columns.find(item => item.key === key).label = input.value.trim();
            try {
                X.validateSettings(next);
            }
            catch (e) {
                error.textContent = e.message;
                error.hidden = false;
                input.focus();
                return;
            }
            state.columns = C.normalizeColumns(next.columns);
            const durable = persist();
            box.close();
            render();
            notices.show(durable ? '列名称已更新。' : '列名称已在本页更新，未保存到本地。', durable ? 'success' : 'info');
        });
        box.body.append(form);
        box.footer.append(U.button('取消', () => box.close()), U.button('保存', null, { type: 'submit', form: form.id, tone: 'primary' }));
        box.open();
    }
    async function copyText(value) {
        const text = String(value ?? '');
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                notices.show('已复制。');
                return;
            }
        }
        catch { /* 非安全来源或未授予剪贴板权限时，尝试浏览器复制入口。 */
        }
        const input = U.el('textarea', { value: text, readonly: true, style: { position: 'fixed', left: '-9999px', top: '0' } });
        document.body.append(input);
        input.select();
        let copied = false;
        try {
            copied = document.execCommand('copy');
        }
        catch { /* 下方给出可手动复制的内容。 */
        }
        input.remove();
        if (copied) {
            notices.show('已复制。');
            return;
        }
        const box = U.panel({ title: '复制内容', subtitle: '浏览器未允许自动复制，请选中内容后复制。' });
        const manual = U.el('textarea', { value: text, readonly: true, 'aria-label': '待复制内容', rows: 4 });
        box.body.append(manual);
        box.footer.append(U.button('关闭', () => box.close()));
        box.open();
        manual.select();
    }
    function applyView(id, notify = true) {
        const view = views.find(item => item.id === id);
        if (!view)
            return;
        const next = id === 'all' ? C.normalizeSnapshot({ ...state, filters: {}, columnFilters: {}, advancedQuery: { rules: [] } }) : C.clone(view.snapshot);
        if (!state.toolbar.byView)
            next.toolbar = C.clone(state.toolbar);
        Object.assign(state, next);
        state.page = 1;
        state.selected.clear();
        currentViewId = id;
        popover.close();
        refreshOptions();
        fillSearch();
        persist();
        render();
        if (notify)
            notices.show(`已切换到“${view.name}”。`, 'info');
    }
    function requireApplied() {
        if (!draftChanged())
            return true;
        popover.close();
        state.searchVisible = true;
        renderSearchVisibility();
        notices.show('查询条件还未应用，请先点击查询，再保存视图。', 'info');
        $('search-button').focus();
        return false;
    }
    function nameView(view = null) {
        if (!view && !requireApplied())
            return;
        if (!view && views.length >= 50) {
            notices.show('最多保存 50 个视图，请先删除不再使用的视图。', 'info');
            return;
        }
        popover.close();
        const box = U.panel({ title: view ? '重命名视图' : '保存视图', subtitle: view ? '修改名称，不改变已保存的条件。' : '保存当前查询、列样式、排序规则、操作按钮和表格外观。' });
        const form = U.el('form', { id: 'view-name-form', novalidate: '' });
        const input = U.el('input', { id: 'view-name-input', type: 'text', maxlength: '30', value: view ? view.name : '', placeholder: '例如：华东待评审报价', autofocus: true, autocomplete: 'off' });
        const error = U.el('p', { class: 'form-error', role: 'alert', hidden: true, style: { marginTop: '12px' } });
        form.append(U.field('视图名称', input, { required: true, hint: '最多 30 个字符，不能与已有视图重名。' }), error);
        form.addEventListener('submit', event => {
            event.preventDefault();
            const name = input.value.trim();
            const key = name.normalize('NFKC').toLocaleLowerCase();
            if (!name || name.length > 30) {
                error.textContent = '请输入 1–30 个字符的视图名称。';
                error.hidden = false;
                input.focus();
                return;
            }
            if (views.some(item => item.id !== view?.id && item.name.normalize('NFKC').toLocaleLowerCase() === key)) {
                error.textContent = '这个名称已被使用，请换一个。';
                error.hidden = false;
                input.focus();
                return;
            }
            if (view)
                view.name = name;
            else {
                const id = `v_${window.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`}`;
                views.push({ id, name, snapshot: snapshot() });
                currentViewId = id;
            }
            const durable = persist();
            box.close();
            render();
            notices.show(durable ? '视图已保存。' : '视图已在本次页面保存；本地设置未持久化。', durable ? 'success' : 'info');
        });
        box.body.append(form);
        box.footer.append(U.button('取消', () => box.close()), U.button('保存', null, { tone: 'primary', type: 'submit', form: form.id, id: 'view-save' }));
        box.open();
    }
    async function updateCurrentView() {
        if (currentViewId === 'all' || !requireApplied())
            return;
        const view = currentView();
        popover.close();
        if (!await U.confirm({ title: '更新视图', message: `将当前查询、排序和表格设置保存到“${view.name}”？`, confirmText: '更新视图' }))
            return;
        view.snapshot = snapshot();
        persist();
        render();
        notices.show('视图设置已更新。');
    }
    async function deleteView(view) {
        if (view.id === 'all')
            return;
        popover.close();
        if (!await U.confirm({ title: '删除视图', message: `确认删除“${view.name}”？只删除视图设置，不会删除报价数据。`, confirmText: '删除视图', danger: true }))
            return;
        views = views.filter(item => item.id !== view.id);
        if (defaultViewId === view.id)
            defaultViewId = 'all';
        if (currentViewId === view.id)
            applyView('all', false);
        else
            render();
        persist();
        notices.show('视图已删除。');
    }
    function viewPanel() {
        const content = U.el('div');
        const list = U.el('div', { class: 'popover-list' });
        const redraw = () => popover.replace(viewPanel());
        const move = (from, to) => {
            const a = views.findIndex(view => view.id === from), b = views.findIndex(view => view.id === to);
            if (a <= 0 || b <= 0)
                return;
            views = C.moveItem(views, a, b);
            persist();
            redraw();
        };
        views.forEach((view, index) => {
            const row = U.el('div', { class: `view-row ${view.id === currentViewId ? 'is-current' : ''}`, dataset: { rowKey: view.id } });
            const handle = U.iconButton('grip', '拖动视图排序', null, { className: 'icon-btn drag-handle', draggable: index > 0 ? 'true' : 'false', disabled: index === 0, dataset: { drag: view.id } });
            const select = U.el('button', { type: 'button', class: 'view-name-btn', onclick: () => applyView(view.id), dataset: { focus: `view-${view.id}` } }, U.el('span', { class: 'view-name-text', title: view.name }, view.name), defaultViewId === view.id ? U.el('span', { class: 'default-tag' }, '默认') : null);
            const tools = U.el('div', { class: 'view-tools' }, U.iconButton('star', defaultViewId === view.id ? '当前默认视图' : `将${view.name}设为默认`, () => {
                defaultViewId = view.id;
                persist();
                redraw();
                notices.show('重新打开页面时将使用此视图。', 'info');
            }, { className: `icon-btn ${defaultViewId === view.id ? 'is-active' : ''}`, dataset: { focus: `default-${view.id}` } }), U.iconButton('edit', `重命名${view.name}`, () => nameView(view), { disabled: view.id === 'all' }), U.iconButton('up', `上移${view.name}`, () => move(view.id, views[index - 1].id), { disabled: index <= 1, className: 'icon-btn view-move', dataset: { focus: `view-up-${view.id}` } }), U.iconButton('down', `下移${view.name}`, () => move(view.id, views[index + 1].id), { disabled: index === 0 || index === views.length - 1, className: 'icon-btn view-move', dataset: { focus: `view-down-${view.id}` } }), U.iconButton('trash', `删除视图${view.name}`, guard(() => deleteView(view)), { disabled: view.id === 'all' }));
            row.append(handle, select, tools);
            list.append(row);
        });
        U.draggableList(list, move);
        content.append(U.el('div', { class: 'popover-header' }, U.el('h3', {}, '我的视图'), U.el('span', { class: 'small-note' }, `${views.length} / 50`)), U.el('p', { class: 'popover-description' }, '保存查询和表格设置；标为默认后，重新打开时自动应用。'), list, U.el('div', { class: 'popover-footer' }, U.button('更新当前视图', guard(updateCurrentView), { tone: 'text', disabled: currentViewId === 'all' || !viewChanged() }), U.button('另存为视图', () => nameView(), { tone: 'primary', icon: 'plus' })));
        return content;
    }
    function openViews() {
        popover.open('views', $('view-button'), viewPanel(), 438);
    }
    function openColumns() {
        let draft = C.clone(state.columns);
        // 切换图标或勾选列后保留滚动位置；Popover.replace 按 data-focus 恢复焦点。
        const paint = () => {
            const scrollTop = popover.element?.querySelector('.column-list')?.scrollTop || 0;
            popover.replace(content());
            const list = popover.element?.querySelector('.column-list');
            if (list)
                list.scrollTop = scrollTop;
        };
        const move = (from, to) => {
            const fromIndex = draft.findIndex(col => col.key === from);
            const toIndex = draft.findIndex(col => col.key === to);
            if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex)
                return;
            draft = C.moveItem(draft, fromIndex, toIndex);
            paint();
        };
        const pinButton = (col, side) => {
            const active = col.pin === side;
            const position = side === 'left' ? '左侧' : '右侧';
            return U.iconButton(side === 'left' ? 'pinLeft' : 'pinRight', `${col.label}：冻结在${position}`, () => {
                // 同侧再次点击取消；切换方向自动替换，不会同时冻结在两侧。
                col.pin = col.pin === side ? '' : side;
                paint();
            }, {
                className: `icon-btn pin-button${active ? ' is-active' : ''}`,
                title: active ? `取消${position}冻结` : `冻结在${position}`,
                'aria-pressed': String(active),
                dataset: { pin: side, focus: `pin-${col.key}-${side}` }
            });
        };
        function content() {
            const optional = draft.filter(col => col.key !== 'id');
            const checked = optional.filter(col => col.visible).length;
            const all = U.el('input', {
                type: 'checkbox', checked: checked === optional.length,
                indeterminate: checked > 0 && checked < optional.length,
                'aria-label': '显示全部可选列', dataset: { focus: 'all-columns' },
                onchange: event => {
                    draft = draft.map(col => ({ ...col, visible: col.key === 'id' || event.target.checked }));
                    paint();
                }
            });
            const list = U.el('div', { class: 'popover-list column-list' });
            draft.forEach((col, index) => {
                const checkboxId = `column-visible-${col.key}`;
                const checkbox = U.el('input', {
                    id: checkboxId, type: 'checkbox', checked: col.visible, disabled: col.key === 'id',
                    'aria-label': `显示${col.label}`, title: col.key === 'id' ? '报价编号始终显示' : `显示${col.label}`,
                    dataset: { focus: `column-${col.key}` },
                    onchange: event => {
                        col.visible = event.target.checked;
                        paint();
                    }
                });
                const handle = U.iconButton('grip', `拖动${col.label}排序`, null, {
                    className: 'icon-btn drag-handle', draggable: 'true',
                    title: '拖动排序，也可用上下方向键移动',
                    'aria-keyshortcuts': 'ArrowUp ArrowDown',
                    dataset: { drag: col.key, focus: `column-drag-${col.key}` },
                    onkeydown: event => {
                        if (!['ArrowUp', 'ArrowDown'].includes(event.key))
                            return;
                        event.preventDefault();
                        event.stopPropagation();
                        const target = draft[index + (event.key === 'ArrowUp' ? -1 : 1)];
                        if (target) {
                            move(col.key, target.key);
                            popover.element?.querySelector(`[data-drag="${CSS.escape(col.key)}"]`)
                                ?.scrollIntoView({ block: 'nearest' });
                        }
                    }
                });
                const label = U.el('label', {
                    class: `settings-label${col.visible ? '' : ' is-column-hidden'}`,
                    for: checkboxId, title: col.key === 'id' ? '报价编号始终显示' : col.label
                }, U.el('span', {}, col.label));
                const pins = U.el('div', {
                    class: `pin-actions${col.pin ? ' has-pin' : ''}`, role: 'group',
                    'aria-label': `${col.label}冻结位置`
                }, pinButton(col, 'left'), pinButton(col, 'right'));
                // 桌面拖动或使用方向键；触屏保留原有上下移动按钮。
                const moves = U.el('div', { class: 'move-actions column-move-actions' }, U.iconButton('up', `上移${col.label}`, () => move(col.key, draft[index - 1]?.key), {
                    disabled: index === 0, dataset: { focus: `column-up-${col.key}` }
                }), U.iconButton('down', `下移${col.label}`, () => move(col.key, draft[index + 1]?.key), {
                    disabled: index === draft.length - 1, dataset: { focus: `column-down-${col.key}` }
                }));
                list.append(U.el('div', {
                    class: 'settings-row column-row', dataset: { rowKey: col.key }
                }, checkbox, handle, label, pins, moves));
            });
            U.draggableList(list, move);
            return U.el('div', { class: 'column-panel' }, U.el('div', { class: 'popover-header' }, U.el('label', { class: 'settings-label column-check-all', title: '报价编号始终显示' }, all, '全部')), U.el('p', { class: 'sr-only' }, '报价编号始终显示。拖动排序，或聚焦拖动按钮后按上下方向键移动。'), list, U.button('更多设置', () => openSettings('columns', 'name', draft), { tone: 'text', className: 'column-more-settings', id: 'columns-more-settings', icon: 'settings' }), U.el('div', { class: 'popover-footer' }, U.button('恢复默认', () => {
                draft = C.normalizeColumns();
                paint();
            }, {
                tone: 'text', className: 'column-reset', dataset: { focus: 'columns-reset' }
            }), U.el('div', { class: 'right-actions' }, U.button('取消', () => popover.close(true), { tone: 'text' }), U.button('确认', () => {
                state.columns = C.normalizeColumns(draft);
                state.sorts = X.normalizeSorts(state.sorts, state.columns);
                state.sort = state.sorts[0] || { key: '', order: '' };
                persist();
                popover.close(true);
                render();
                notices.show('列设置已应用。');
            }, { tone: 'text', className: 'column-confirm', id: 'columns-apply' }))));
        }
        const touchControls = window.matchMedia('(hover: none), (pointer: coarse)').matches;
        popover.open('columns', $('columns-button'), content(), touchControls ? 320 : 280);
    }
    function openDensity() {
        const items = [['compact', '紧凑'], ['normal', '默认'], ['loose', '宽松']];
        const list = U.el('div', { class: 'popover-list' }, items.map(([value, label]) => U.el('button', { type: 'button', class: `menu-option ${state.density === value ? 'is-current' : ''}`,
            onclick: () => {
                state.density = value;
                persist();
                popover.close(true);
                render();
            }, 'aria-pressed': String(state.density === value) }, label, state.density === value ? U.icon('check', 'end-icon') : null)));
        popover.open('density', $('density-button'), list, 150);
    }
    function openExport(initialScope = 'filtered') {
        popover.close();
        window.QuoteMenus.close();
        const groups = { filtered: C.clone(state.filtered), page: C.clone(state.pagination.items), selected: C.clone(state.filtered.filter(row => state.selected.has(row.id))) };
        if (!groups[initialScope]?.length) {
            notices.show('没有可导出的记录。', 'info');
            return;
        }
        window.QuoteExportDialog.open({ snapshot: snapshot(), groups, initialScope, presets: exportPresets,
            onPresets: next => {
                exportPresets = E.normalizePresets(next);
                return persist();
            },
            onComplete: (count, format) => notices.show(`已生成 ${count} 条报价的 ${format === 'xlsx' ? 'Excel' : 'CSV'} 文件。`)
        });
    }
    function exportSingle(id, format = 'xlsx') {
        const row = state.rows.find(item => item.id === id);
        if (!row)
            return;
        const options = { format, keys: E.visibleKeys(snapshot()), aliases: true, style: 'current' };
        const data = format === 'csv' ? E.createCSV([row], snapshot(), options) : window.QuoteXlsx.write(E.createWorkbook([row], snapshot(), options));
        U.download(data, `${id}.${format === 'csv' ? 'csv' : 'xlsx'}`, format === 'csv' ? 'text/csv;charset=utf-8' : window.QuoteXlsx.MIME);
        notices.show('已生成当前报价文件。');
    }
    function openTemplates() {
        popover.close();
        const box = U.panel({ title: '模板下载', subtitle: '使用固定业务字段，不受个人列名称、显示顺序或隐藏列影响。' });
        box.body.append(U.el('div', { class: 'about-copy' }, U.el('p', {}, '空白模板包含“数据填写”和“填写说明”；带示例模板另外提供“示例”工作表，不在填写区混入示例数据。'), U.el('p', { class: 'small-note' }, '金额和日期有填写说明，状态与大区提供下拉选项。此版本仅提供模板下载，尚未提供 Excel 导入。')));
        const download = withExample => {
            try {
                U.download(window.QuoteXlsx.write(E.createTemplate(withExample)), `报价模板_${withExample ? '带示例' : '空白'}.xlsx`, window.QuoteXlsx.MIME);
                notices.show('模板已生成。');
            }
            catch (error) {
                notices.show(error.message || '模板生成失败。', 'error');
            }
        };
        box.footer.append(U.button('关闭', () => box.close()), U.button('空白模板', () => download(false), { icon: 'download', id: 'download-blank-template' }), U.button('带示例模板', () => download(true), { tone: 'primary', icon: 'download', id: 'download-example-template' }));
        box.open();
    }
    function about() {
        popover.close();
        const box = U.panel({ title: '使用说明', subtitle: '报价管理 · 本地演示' });
        box.body.append(U.el('div', { class: 'about-copy' }, U.el('p', {}, U.el('strong', {}, '数据范围：'), '页面使用原型中的 6 条示例报价。新增、修改和删除只作用于当前浏览器，没有连接业务服务器。'), U.el('p', {}, U.el('strong', {}, '查询与选择：'), '修改条件后点击查询或按 Enter。翻页保留选择；查询和切换视图会清空选择。表头全选只选当前页。'), U.el('p', {}, U.el('strong', {}, '视图与表格：'), '视图保存查询、列名与样式、多字段排序、操作按钮和表格外观。完整设置有独立预览，点击应用才生效；表头边缘可拖动调整宽度。'), U.el('p', {}, U.el('strong', {}, '本地保存：'), '建议通过固定本地地址打开。清除浏览器数据、更换浏览器或移动单文件可能无法找到原记录，重要内容请导出 JSON 备份。'), U.el('p', {}, U.el('strong', {}, '快捷操作：'), '在非输入区域按 / 定位查询框；编辑时 Ctrl / ⌘ + Enter 保存，Esc 关闭窗口。')));
        box.footer.append(U.button('知道了', () => box.close(), { tone: 'primary' }));
        box.open();
    }
    function backup() {
        popover.close();
        U.download(JSON.stringify(repo.backup(), null, 2), `报价数据备份_${C.today()}.json`, 'application/json;charset=utf-8');
        notices.show('已生成报价数据备份。');
    }
    async function restore(file) {
        if (!file)
            return;
        if (file.size > 8 * 1024 * 1024)
            throw new Error('备份文件不能超过 8 MB。');
        let data;
        try {
            data = JSON.parse(await file.text());
        }
        catch {
            throw new Error('备份文件不是有效的 JSON。');
        }
        if (data?.app !== 'quotation-demo' || data.schemaVersion !== 1)
            throw new Error('这不是当前版本的报价备份文件。');
        const rows = C.validateRows(data.rows);
        if (!await U.confirm({ title: '恢复报价备份', message: `将用备份中的 ${rows.length} 条报价替换当前 ${state.rows.length} 条记录。\n此操作不会合并数据，也不会修改表格设置。建议先备份当前数据。`, confirmText: '确认替换', danger: true }))
            return;
        repo.replace(rows);
        state.rows = repo.list();
        state.selected.clear();
        state.page = 1;
        refreshOptions();
        render();
        notices.show('报价数据已恢复。');
    }
    async function resetDemo() {
        popover.close();
        if (!await U.confirm({ title: '恢复示例数据', message: '当前报价数据将被原始 6 条示例记录替换，表格设置保持不变。建议先备份当前数据。', confirmText: '确认恢复', danger: true }))
            return;
        repo.replace(C.clone(Config.SEED_ROWS));
        state.rows = repo.list();
        state.selected.clear();
        reset();
        refreshOptions();
        render();
        notices.show('已恢复原始示例数据。');
    }
    function openMore() {
        const option = (name, label, callback) => U.el('button', { type: 'button', class: 'menu-option', onclick: guard(callback) }, U.icon(name), label);
        popover.open('more', $('more-button'), U.el('div', { class: 'popover-list' }, option('download', '备份报价数据（JSON）', backup), option('upload', '恢复报价备份', () => {
            popover.close();
            $('restore-file').click();
        }), U.el('div', { class: 'menu-separator' }), option('refresh', '恢复示例数据', resetDemo), option('info', '使用说明', about)), 250);
    }
    // 事件只注册一次。重新渲染不会堆叠监听器，也不依赖内联 onclick 或全局 event。
    $('search-form').addEventListener('submit', query);
    $('search-form').addEventListener('input', () => {
        $('search-error').hidden = true;
        updateFilterSummary();
    });
    $('search-form').addEventListener('change', updateFilterSummary);
    bind('reset-button', 'click', reset);
    bind('advanced-button', 'click', () => {
        state.advanced = !state.advanced;
        renderSearchVisibility();
        persist();
    });
    bind('search-toggle-button', 'click', () => {
        state.searchVisible = !state.searchVisible;
        renderSearchVisibility();
        persist();
    });
    bind('batch-button', 'click', () => {
        state.batchMode = !state.batchMode;
        if (!state.batchMode)
            state.selected.clear();
        render();
    });
    bind('clear-selection', 'click', () => {
        state.selected.clear();
        render();
    });
    bind('select-filtered-button', 'click', () => {
        state.filtered.forEach(row => state.selected.add(row.id));
        render();
    });
    bind('batch-delete', 'click', () => remove([...state.selected]));
    bind('batch-export', 'click', () => openExport('selected'));
    bind('refresh-button', 'click', refresh);
    bind('external-refresh', 'click', refresh);
    bind('create-button', 'click', () => openEditor());
    bind('export-button', 'click', () => openExport());
    bind('view-button', 'click', openViews);
    bind('columns-button', 'click', openColumns);
    bind('settings-button', 'click', () => openSettings());
    bind('sort-settings-button', 'click', () => openSettings('sorts'));
    bind('template-button', 'click', openTemplates);
    bind('density-button', 'click', openDensity);
    bind('more-button', 'click', openMore);
    bind('help-button', 'click', about);
    bind('data-tools-button', 'click', openDataTools);
    bind('page-size', 'change', event => {
        state.pageSize = Number(event.target.value);
        state.page = 1;
        persist();
        render();
        $('table-viewport').scrollTop = 0;
    });
    $('page-jump-form').addEventListener('submit', event => {
        event.preventDefault();
        goPage($('page-jump').valueAsNumber);
    });
    bind('restore-file', 'change', async (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        await restore(file);
    });
    document.addEventListener('keydown', event => {
        if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('dialog[open]') &&
            !event.target.closest('input,textarea,select,[contenteditable="true"]')) {
            event.preventDefault();
            popover.close();
            state.searchVisible = true;
            renderSearchVisibility();
            $('filter-keyword').focus();
        }
    });
    window.addEventListener('storage', event => {
        if (event.key === Config.DATA_KEY || event.key === null)
            $('external-warning').hidden = false;
    });
    if (repo.isTemporary) {
        $('mode-badge').textContent = '临时模式';
        $('mode-badge').classList.add('temporary');
        $('persistence-note').textContent = '当前修改只保留到页面关闭，请及时导出备份。';
    }
    refreshOptions();
    fillSearch();
    render();
})();
