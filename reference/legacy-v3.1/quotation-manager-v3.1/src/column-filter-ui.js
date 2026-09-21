/* 表头筛选和组合筛选共用编辑器。应用前校验，取消不更改查询。 */
(function (root) {
    'use strict';
    const U = root.QuoteUI, R = root.QuoteRules;
    let counter = 0;
    function editor(col, rows, initial, onChange = () => {
    }, unique = false) {
        const uid = unique ? 'filter-rule-' + (++counter) : 'column-filter';
        const f = R.normalizeFilter(col.filter, col.key);
        let rule = R.captureFilter(col, initial || { op: f.operators[0] || 'contains' });
        const host = U.el('div', { class: 'filter-rule-editor' }), operator = U.el('select', { 'aria-label': '筛选条件', id: uid + '-operator' }), fields = U.el('div', { class: 'filter-values' });
        operator.append(...R.FILTER_OPERATORS[f.type].filter(([k]) => f.operators.includes(k)).map(([k, l]) => U.el('option', { value: k }, l)));
        if (!f.operators.includes(rule.op))
            rule.op = f.operators[0];
        operator.value = rule.op;
        operator.addEventListener('change', () => {
            rule.op = operator.value;
            paint();
            onChange(rule);
        });
        host.append(U.field('条件', operator), fields);
        function paint() {
            fields.replaceChildren();
            if (['empty', 'notEmpty'].includes(rule.op))
                return;
            if (['in', 'notIn'].includes(rule.op)) {
                const options = R.filterOptions(rows, col), list = U.el('div', { class: 'filter-option-list' }), search = U.el('input', { type: 'search', placeholder: '搜索筛选项', 'aria-label': '搜索筛选项' });
                function listItems() {
                    const q = search.value.toLocaleLowerCase();
                    list.replaceChildren(...options.filter(i => i.label.toLocaleLowerCase().includes(q)).slice(0, 200).map(i => U.el('label', { class: 'filter-option' }, U.el('input', { type: f.type === 'single' ? 'radio' : 'checkbox', name: uid + '-option', checked: rule.values.includes(i.value), 'aria-label': i.label, onchange: e => {
                            rule.values = f.type === 'single' ? [i.value] : e.target.checked ? [...new Set([...rule.values, i.value])] : rule.values.filter(v => v !== i.value);
                            onChange(rule);
                        } }), U.el('span', {}, i.label), f.counts ? U.el('small', {}, String(i.count)) : null)));
                    if (options.filter(i => i.label.toLocaleLowerCase().includes(q)).length > 200)
                        list.append(U.el('p', { class: 'small-note' }, '仅列出前 200 项，请搜索缩小范围；已选条件保留。'));
                    if (!list.children.length)
                        list.append(U.el('p', { class: 'small-note' }, '没有匹配的筛选项'));
                }
                search.addEventListener('input', listItems);
                if (f.search)
                    fields.append(search);
                fields.append(list);
                listItems();
                return;
            }
            const date = f.type === 'date' && !['nextDays', 'pastDays'].includes(rule.op), numeric = f.type === 'number' || ['nextDays', 'pastDays'].includes(rule.op);
            function input(which, label) {
                return U.field(label, U.el('input', { type: date ? 'date' : 'text', inputmode: numeric ? 'decimal' : undefined, id: uid + '-' + which, value: rule[which], placeholder: col.number?.enabled && col.number.mode === 'percent' ? '例如 10 代表 10%' : '请输入', oninput: e => {
                        rule[which] = e.target.value;
                        onChange(rule);
                    } }));
            }
            fields.append(input('value', rule.op === 'between' ? '开始 / 下限' : ['nextDays', 'pastDays'].includes(rule.op) ? '天数' : '筛选值'));
            if (rule.op === 'between')
                fields.append(input('to', '结束 / 上限'));
            if (col.key === 'amountCents')
                fields.append(U.el('p', { class: 'small-note' }, `输入单位：${R.filterUnit(col, rule)}。条件保存后，修改列显示格式不会改变筛选范围。`));
        }
        paint();
        return { element: host, get: () => ({ ...rule }), validate: () => R.validateFilter(col, rule) };
    }
    function open({ col, rows, current, onApply, onClose }) {
        const box = U.panel({ title: `筛选 · ${col.label}`, subtitle: '与当前查询及其他列条件同时生效。', onClose }), form = editor(col, rows, current), error = U.el('p', { class: 'form-error', role: 'alert', hidden: true });
        box.element.classList.add('column-filter-dialog');
        box.body.append(form.element, error);
        box.footer.append(U.button('清除此列', () => {
            onApply(null);
            box.close();
        }, { tone: 'text', id: 'column-filter-clear' }), U.button('取消', () => box.close()), U.button('应用筛选', () => {
            try {
                form.validate();
                onApply(form.get());
                box.close();
            }
            catch (e) {
                error.textContent = e.message;
                error.hidden = false;
            }
        }, { tone: 'primary', id: 'column-filter-apply' }));
        box.open();
        return box;
    }
    function summary(col, rule) {
        const f = R.normalizeFilter(col.filter, col.key), label = R.FILTER_OPERATORS[f.type].find(([id]) => id === rule.op)?.[1] || rule.op;
        const mapped = v => col.mapping?.enabled ? R.mappedText(v, col.mapping, String(v)) : col.key === 'status' ? (root.QuoteConfig.STATUS[v]?.label || String(v)) : String(v);
        return `${col.label}：${label}${['empty', 'notEmpty'].includes(rule.op) ? '' : Array.isArray(rule.values) && rule.values.length ? ' ' + rule.values.map(mapped).join('、') : ' ' + rule.value + (rule.op === 'between' ? ' ～ ' + rule.to : '')}${f.type === 'number' ? ' ' + R.filterUnit(col, rule) : ''}`;
    }
    function advanced({ columns, rows, value, onApply, onClose }) {
        const draft = JSON.parse(JSON.stringify(value || { join: 'and', rules: [] })), box = U.panel({ title: '组合筛选', subtitle: '基础查询、列筛选和这里的组合条件共同生效。', kind: 'drawer', onClose }), host = U.el('div', { class: 'advanced-rule-list' }), error = U.el('p', { class: 'form-error', role: 'alert', hidden: true });
        box.element.classList.add('advanced-query-dialog');
        const eligible = columns.filter(c => c.filter?.enabled && c.key !== 'actions');
        const join = U.el('select', { 'aria-label': '组合方式', id: 'advanced-query-join', onchange: e => draft.join = e.target.value }, U.el('option', { value: 'and' }, '同时满足所有条件'), U.el('option', { value: 'or' }, '满足任一条件'));
        join.value = draft.join;
        let forms = [];
        function paint() {
            forms = [];
            host.replaceChildren(...draft.rules.map((r, index) => {
                const sel = U.el('select', { 'aria-label': '筛选字段', onchange: e => {
                        const col = eligible.find(c => c.key === e.target.value);
                        draft.rules[index] = { key: col.key, op: col.filter.operators[0] };
                        paint();
                    } }, eligible.map(c => U.el('option', { value: c.key }, c.label)));
                sel.value = r.key;
                const col = eligible.find(c => c.key === r.key) || eligible[0], form = editor(col, rows, r, next => {
                    draft.rules[index] = { key: col.key, ...next };
                }, true);
                forms.push(form);
                return U.el('section', { class: 'advanced-rule' }, U.el('div', { class: 'section-heading' }, U.field(`条件 ${index + 1}`, sel), U.iconButton('trash', '删除条件', () => {
                    draft.rules.splice(index, 1);
                    paint();
                })), form.element);
            }));
            if (!draft.rules.length)
                host.append(U.el('div', { class: 'settings-empty' }, '尚未添加条件'));
        }
        box.body.append(U.field('组合方式', join), host, U.button('添加条件', () => {
            if (draft.rules.length < 30 && eligible.length) {
                const c = eligible[0];
                draft.rules.push({ key: c.key, op: c.filter.operators[0] });
                paint();
            }
        }, { icon: 'plus', id: 'advanced-add-condition' }), error);
        box.footer.append(U.button('清空条件', () => {
            draft.rules = [];
            paint();
        }, { tone: 'text' }), U.button('取消', () => box.close()), U.button('应用条件', () => {
            try {
                forms.forEach(f => f.validate());
                draft.rules = draft.rules.map((r, i) => ({ key: r.key, ...forms[i].get() }));
                onApply(draft);
                box.close();
            }
            catch (e) {
                error.textContent = e.message;
                error.hidden = false;
            }
        }, { tone: 'primary', id: 'advanced-query-apply' }));
        paint();
        box.open();
        return box;
    }
    root.QuoteFilterUI = Object.freeze({ open, editor, summary, advanced });
})(globalThis);
