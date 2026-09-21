/* 报价编辑与详情。保存逻辑由调用方注入，不直接访问数据仓库。 */
(function (root) {
    'use strict';
    const U = root.QuoteUI, C = root.QuoteCore, Config = root.QuoteConfig;
    function editor({ row = null, copy = false, rows = [], onSave, onSaved, onClose }) {
        const editing = Boolean(row && !copy);
        const createdDate = editing ? row.createdDate : C.today();
        const initial = row ? { ...row } : { name: '', customer: '', owner: Config.CURRENT_USER, region: '', status: 'draft', amountCents: 0, remark: '' };
        if (copy) {
            initial.name = `${initial.name.slice(0, 95)}（副本）`;
            initial.status = 'draft';
        }
        const initialDate = editing ? row.date : row?.date >= createdDate ? row.date : C.addDays(createdDate, 30);
        let busy = false, closing = false, dirty = () => false;
        const beforeUnload = event => {
            if (dirty()) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        const box = U.panel({ title: editing ? '修改报价' : copy ? '复制报价' : '新增报价', subtitle: editing ? row.id : '填写报价信息，保存后生成编号。', kind: 'drawer',
            onRequestClose: async () => {
                if (busy || closing)
                    return;
                if (!dirty()) {
                    box.close();
                    return;
                }
                closing = true;
                const leave = await U.confirm({ title: '放弃修改？', message: '还有未保存的内容，关闭后不会保留。', confirmText: '放弃修改', danger: true });
                closing = false;
                if (leave)
                    box.close();
            },
            onClose: () => {
                window.removeEventListener('beforeunload', beforeUnload);
                onClose?.();
            }
        });
        const form = U.el('form', { id: 'quote-form', novalidate: '' });
        const error = U.el('p', { class: 'form-error editor-error', role: 'alert', hidden: true, tabindex: '-1', id: 'quote-error' });
        const name = U.el('input', { id: 'quote-name', type: 'text', value: initial.name, maxlength: '100', placeholder: '请输入项目名称', required: '', autofocus: true });
        const customer = U.el('input', { id: 'quote-customer', type: 'text', value: initial.customer, maxlength: '60', list: 'customer-suggestions', placeholder: '输入或选择客户', required: '' });
        const owner = U.el('input', { id: 'quote-owner', type: 'text', value: initial.owner, maxlength: '40', list: 'owner-suggestions', placeholder: '输入或选择负责人', required: '' });
        const region = U.options(U.el('select', { id: 'quote-region', required: '' }), Config.REGIONS, '请选择大区');
        region.value = initial.region;
        const status = U.options(U.el('select', { id: 'quote-status' }), Object.entries(Config.STATUS).map(([value, { label }]) => ({ value, label })));
        status.value = initial.status;
        const amount = U.el('input', { id: 'quote-amount', type: 'text', inputmode: 'decimal', value: row ? C.moneyInput(initial.amountCents) : '', placeholder: '0.00', maxlength: '14', required: '' });
        const created = U.el('input', { id: 'quote-createdDate', type: 'date', value: createdDate, readOnly: true });
        const date = U.el('input', { id: 'quote-date', type: 'date', value: initialDate, min: createdDate, required: '' });
        const remark = U.el('textarea', { id: 'quote-remark', maxlength: '1000', placeholder: '补充报价说明（选填）' }, initial.remark || '');
        let richDocument = initial.remarkRich ? C.clone(initial.remarkRich) : null;
        const richHint = U.el('span', { class: 'field-hint rich-remark-hint' }, richDocument ? '已保留富文本样式；直接修改纯文本会在保存时替换样式。' : '');
        const richButton = U.button('富文本编辑', () => root.QuoteRichText.open({ title: '编辑备注', document: richDocument, text: remark.value, maxChars: 1000, onSave: doc => {
                richDocument = doc;
                remark.value = root.QuoteRules.deltaText(doc);
                counter.textContent = `${remark.value.length} / 1000`;
                richHint.textContent = '已设置富文本样式，保存报价后生效。';
            } }), { icon: 'edit', id: 'edit-rich-remark' });
        remark.addEventListener('input', () => {
            if (richDocument) {
                richDocument = null;
                richHint.textContent = '当前备注改为纯文本，保存报价后生效。';
            }
        });
        const counter = U.el('span', { class: 'field-hint' }, `${remark.value.length} / 1000`);
        remark.addEventListener('input', () => counter.textContent = `${remark.value.length} / 1000`);
        const customers = U.el('datalist', { id: 'customer-suggestions' }, [...new Set(rows.map(item => item.customer))].map(value => U.el('option', { value })));
        const owners = U.el('datalist', { id: 'owner-suggestions' }, [...new Set([Config.CURRENT_USER, ...rows.map(item => item.owner)])].map(value => U.el('option', { value })));
        form.append(error, U.el('h3', { class: 'section-heading' }, '基本信息'), U.el('div', { class: 'form-grid' }, U.field('报价编号', U.el('input', { value: editing ? row.id : '保存后自动生成', readOnly: true }), { wide: true }), U.field('项目名称', name, { required: true, wide: true }), U.field('客户', customer, { required: true }), U.field('负责人', owner, { required: true }), U.field('大区', region, { required: true }), U.field('状态', status)), U.el('h3', { class: 'section-heading section-gap' }, '报价信息'), U.el('div', { class: 'form-grid' }, U.field('含税金额（元）', amount, { required: true, wide: true, hint: '最多保留两位小数。' }), U.field('创建日期', created), U.field('有效期至', date, { required: true }), U.el('div', { class: 'field field-wide' }, U.el('label', { for: remark.id }, '备注'), remark, counter, richButton, richHint)), customers, owners);
        const read = () => ({ id: editing ? row.id : 'AUTO', name: name.value, customer: customer.value, owner: owner.value, region: region.value, status: status.value,
            amount: amount.value, createdDate, date: date.value, remark: remark.value, ...(richDocument ? { remarkRich: richDocument } : {}) });
        const original = JSON.stringify(read());
        dirty = () => JSON.stringify(read()) !== original;
        window.addEventListener('beforeunload', beforeUnload);
        const saveButton = U.button('保存报价', null, { tone: 'primary', type: 'submit', form: form.id, id: 'quote-save' });
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (busy)
                return;
            error.hidden = true;
            try {
                const values = read();
                const valid = C.validateQuote({ ...values, amountCents: C.parseMoney(values.amount) });
                busy = true;
                saveButton.disabled = true;
                saveButton.textContent = '正在保存…';
                const saved = await onSave(valid, editing ? row.version : null);
                box.close();
                onSaved?.(saved);
            }
            catch (problem) {
                error.textContent = problem.message || '保存失败，请稍后重试。';
                error.hidden = false;
                error.focus();
                error.scrollIntoView({ block: 'nearest' });
            }
            finally {
                busy = false;
                saveButton.disabled = false;
                saveButton.textContent = '保存报价';
            }
        });
        form.addEventListener('keydown', event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                form.requestSubmit();
            }
        });
        box.body.append(form);
        box.footer.append(U.el('span', { class: 'footer-note' }, 'Ctrl / ⌘ + Enter 保存'), U.button('取消', () => box.requestClose()), saveButton);
        box.open();
        return box;
    }
    function detail(row, { onEdit, onCopy, onClose, columns = [] }) {
        const status = Config.STATUS[row.status];
        const box = U.panel({ title: '报价详情', subtitle: row.id, kind: 'drawer', onClose });
        const values = [['报价编号', row.id], ['客户', row.customer], ['负责人', row.owner], ['大区', row.region], ['创建日期', row.createdDate], ['有效期至', row.date]];
        box.body.append(U.el('section', { class: 'detail-hero' }, U.el('h3', {}, row.name), U.el('p', {}, row.customer), U.el('div', { class: 'detail-amount' }, U.el('div', {}, U.el('small', {}, '含税金额（元）'), U.el('strong', {}, `¥ ${C.formatMoney(row.amountCents)}`)), U.el('span', { class: `status-pill status-${status.tone}` }, status.label))), U.el('h3', { class: 'section-heading' }, '基本信息'), U.el('dl', { class: 'detail-grid' }, values.map(([label, value]) => U.el('div', { class: 'detail-field' }, U.el('dt', {}, label), U.el('dd', {}, value)))), U.el('h3', { class: 'section-heading section-gap' }, '备注'), U.el('p', { class: 'detail-remark' }, row.remark || '暂无备注'));
        if (row.remarkRich) {
            const p = box.body.querySelector('.detail-remark');
            p.classList.add('rich-display');
            p.replaceChildren(root.QuoteRichText.render(row.remarkRich));
        }
        const mapped = columns.find(c => c.key === 'status');
        if (mapped?.mapping?.enabled)
            box.body.querySelector('.detail-hero .status-pill')?.replaceWith(root.QuoteRichText.mappedNode(row.status, mapped));
        box.footer.append(U.button('关闭', () => box.close()), U.button('复制报价', () => {
            box.close();
            onCopy(row);
        }, { icon: 'copy' }), U.button('修改报价', () => {
            box.close();
            onEdit(row);
        }, { tone: 'primary', icon: 'edit' }));
        box.open();
        return box;
    }
    root.QuoteForms = Object.freeze({ editor, detail });
})(globalThis);
