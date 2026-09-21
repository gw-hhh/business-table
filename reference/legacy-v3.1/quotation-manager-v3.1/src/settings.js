/* 完整表格设置抽屉。所有修改在 draft 中；预览不持有真实操作回调。 */
(function (root) {
    'use strict';
    const U = root.QuoteUI, C = root.QuoteCore, X = root.QuoteCustomization, Config = root.QuoteConfig, E = root.QuoteExperience;
    function open({ snapshot, baselineSnapshot = snapshot, rows = [], tab = 'columns', columnKey = 'name', onApply, onClose }) {
        let draft = C.clone(snapshot), activeTab = tab, activeKey = columnKey, selected = new Set([columnKey]);
        const baseline = C.clone(baselineSnapshot), original = JSON.stringify(baselineSnapshot);
        let previewController = null, activeSection = '', mappingIndex = 0, paintedView = '';
        const memory = new Map(), columnSections = new Map(), uiState = { folded: new Set(), mappingOpen: new Set(), trials: new Map() };
        let changeSummary;
        let body, tabs, content, preview, error, message, box;
        const current = () => draft.columns.find(c => c.key === activeKey) || draft.columns[0];
        const fail = text => {
            error.replaceChildren(U.el('span', {}, text), U.button('定位设置', () => locateError(text), { tone: 'text', id: 'locate-setting-error' }));
            error.hidden = false;
            locateError(text);
        };
        const change = () => {
            error.hidden = true;
            content.querySelectorAll('[aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
            content.querySelectorAll('.inline-setting-error').forEach(n => n.remove());
            message.textContent = '';
            updateMeta();
            renderPreview();
        };
        const dirty = () => JSON.stringify(draft) !== original;
        const requestClose = async () => {
            if (!dirty() || await U.confirm({ title: '放弃修改？', message: '本次表格设置还没有应用。关闭后不保留这些修改。', confirmText: '放弃修改' }))
                box.close();
        };
        box = U.panel({ title: '表格设置', subtitle: '修改先预览，应用后生效。', kind: 'drawer', onRequestClose: requestClose, onClose: () => { previewController?.destroy(); onClose?.(); } });
        box.element.classList.add('settings-drawer');
        tabs = U.el('div', { class: 'settings-tabs', role: 'tablist', 'aria-label': '表格设置分类' });
        content = U.el('div', { class: 'settings-content', role: 'tabpanel', id: 'settings-tab-panel' });
        preview = U.el('section', { class: 'settings-preview', 'aria-label': '表格设置预览' });
        error = U.el('p', { class: 'form-error settings-error', role: 'alert', hidden: true });
        message = U.el('p', { class: 'settings-message', role: 'status' });
        changeSummary = U.el('div', { id: 'settings-change-summary', class: 'settings-change-summary' });
        body = U.el('div', { class: 'settings-body' }, tabs, error, message, changeSummary, content, preview);
        box.body.append(body);
        previewController = new root.QuoteSettingsPreview(preview, () => ({ draft, rows, tab: activeTab, key: activeKey, section: activeSection, mappingIndex, trialValue:activeSection==='section-trial'?content.querySelector('#rule-trial-value')?.value:undefined }));
        content.addEventListener('input',e=>{if(e.target.id==='rule-trial-value')renderPreview();});
        content.addEventListener('focusin', e => {
            const section = e.target.closest('.feature-section')?.id || '';
            const map = e.target.closest('[data-mapping-row]');
            if (map) mappingIndex = Number(map.dataset.mappingRow);
            if (activeTab === 'columns' && activeSection !== section) {
                activeSection = section; columnSections.set(activeKey, section); renderPreview();
            } else if (map) renderPreview();
        });
        function updateMeta() {
            const changed = E.changes(baseline, draft), apply = box.element.querySelector('#settings-apply');
            if (apply) { apply.disabled = !dirty(); apply.title = dirty() ? '应用本次修改' : '没有待应用的修改'; }
            changeSummary.replaceChildren(U.el('span', { class: changed.length ? 'has-changes' : '' }, changed.length ? `待应用 ${changed.length} 项：${changed.slice(0, 2).map(x => x.label).join('、')}${changed.length > 2 ? '…' : ''}` : '当前设置已应用'));
            if (changed.length) changeSummary.append(U.button('查看修改', () => {
                const panel = U.panel({ title: '本次修改', subtitle: '只包含尚未应用的设置。点击可定位。' });
                const list = U.el('div', { class: 'change-review-list' });
                changed.forEach(item => list.append(U.button(item.label, () => { panel.close(); activeTab=item.tab; if(item.key)activeKey=item.key; activeSection=item.section||''; paint(); E.reveal(content.querySelector(item.field?'#'+item.field:item.section?'#'+item.section:'.column-detail-heading') || content); }, { tone:'text' })));
                panel.body.append(list); panel.footer.append(U.button('返回设置', () => panel.close())); panel.open();
            }, { tone:'text', id:'review-setting-changes' }));
            const heading=content.querySelector('#editing-column-context');
            if(heading) heading.textContent=`当前编辑：${current().label||'未命名列'}`;
            const meta=content.querySelector('#editing-column-meta');
            if(meta){const c=current();meta.textContent=`${c.key==='actions'?'操作列':c.key==='amountCents'?'数字字段':['date','createdDate'].includes(c.key)?'日期字段':c.key==='status'?'状态字段':'文本字段'} · ${c.visible?'显示中':'已隐藏'}${c.pin?' · '+(c.pin==='left'?'左侧冻结':'右侧冻结'):''}`;}
            const number=current().number;if(number){content.querySelector('#number-precision-fixed')?.setAttribute('aria-pressed',String(number.minDigits===number.maxDigits));content.querySelector('#number-precision-max')?.setAttribute('aria-pressed',String(number.minDigits===0&&number.minDigits!==number.maxDigits));}
            for (const n of content.querySelectorAll('[data-rule-summary]')) n.textContent=E.summary(current(),n.dataset.ruleSummary);
            for (const node of content.querySelectorAll('[data-mapping-preview]')) {
                const item=current().mapping?.items[Number(node.dataset.mappingPreview)];if(!item)continue;
                let value=item.raw;if(current().mapping.type==='number')value=Number(value);if(current().mapping.type==='boolean')value=value===true||value==='true';
                node.replaceChildren(root.QuoteRichText.mappedNode(value,current()));
            }
        }
        function locateError(text) {
            let col = null, id = '', section = '', targetTab='columns';
            const badColor=v=>v&&!/^#[a-f0-9]{6}$/i.test(v);
            for(const [prop,field] of [['color','appearance-color'],['headerColor','appearance-header-color']])if(badColor(draft.appearance[prop])){id=field;targetTab='appearance';break;}
            const labels=new Set();
            if(!id)for(const c of draft.columns){
                try{root.QuoteRules.validateColumn(c);}catch(e){col=c;
                    if(e.message.includes('映射')){
                        section='section-mapping';const seen=new Set();let index=0,prop='raw';
                        for(let i=0;i<c.mapping.items.length;i++){
                            const item=c.mapping.items[i],raw=root.QuoteRules.matchKey(item.raw,c.mapping.type,{config:true});
                            index=i;if(!item.label.trim()){prop='label';break;}if(raw===null||seen.has(raw))break;seen.add(raw);
                            const color=['color','background','border'].find(k=>badColor(item[k]));if(color){prop=color;uiState.mappingOpen.add(c.key+':'+i);break;}
                        }id=`mapping-${prop}-${index}`;
                    }
                    else if(e.message.includes('小数')){section='section-number';id=c.number.maxDigits>8?'number-max':'number-min';}
                    else if(e.message.includes('模板')){section='section-template';id='edit-column-template';}
                    else {section='section-filter';id='filter-enabled';}break;
                }
                const label=String(c.label||'').trim().normalize('NFKC').toLocaleLowerCase();
                if(!label||label.length>30||labels.has(label)){col=c;id='setting-column-label';break;}labels.add(label);
                for(const part of ['header','body'])if(badColor(c[part]?.color)){col=c;id=`setting-${part}-color`;break;}if(col)break;
                if(!Number.isFinite(c.width)||c.width<c.minWidth||c.width>640){col=c;id='setting-column-width';break;}
            }
            if(!id)for(const item of draft.actions.items)if(!item.label.trim()||item.label.length>12){id=`action-${item.id}-label`;targetTab='actions';break;}
            if(!id)for(const item of draft.toolbar.items)if(!item.label.trim()||item.label.length>16){id=`tool-label-${item.id}`;targetTab='toolbar';break;}
            if(!id)return;
            activeTab=targetTab;if(col)activeKey=col.key;activeSection=section;if(section)uiState.folded.delete(col.key+':'+section);
            paint();const n=content.querySelector('#'+id)||content.querySelector('#'+section);
            if(n){n.setAttribute('aria-invalid','true');const note=U.el('small',{class:'inline-setting-error',id:'setting-field-error'},text);(n.closest('.field')||n.parentElement).append(note);n.setAttribute('aria-describedby','setting-field-error');E.reveal(n);}
        }
        function renderTabs() {
            const choices = [['columns', '列设置'], ['sorts', '排序规则'], ['actions', '操作按钮'], ['appearance', '表格外观'], ['toolbar', '工具栏']];
            tabs.replaceChildren(...choices.map(([id, label], index) => U.el('button', { type: 'button', role: 'tab', id: `settings-tab-${id}`, 'aria-selected': String(id === activeTab), 'aria-controls': 'settings-tab-panel', tabindex: id === activeTab ? '0' : '-1', class: id === activeTab ? 'is-active' : '', dataset: { settingsTab: id },
                onclick: () => {
                    activeTab = id;
                    paint();
                }, onkeydown: e => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key))
                        return;
                    e.preventDefault();
                    activeTab = choices[e.key === 'Home' ? 0 : e.key === 'End' ? choices.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : choices.length - 1)) % choices.length][0];
                    paint();
                    tabs.querySelector('[aria-selected="true"]').focus();
                } }, label, id === 'sorts' && draft.sorts.length ? U.el('span', { class: 'tab-count' }, String(draft.sorts.length)) : null)));
            content.setAttribute('aria-labelledby', `settings-tab-${activeTab}`);
        }
        function select(label, value, choices, onValue, id) {
            const node = U.el('select', { id: id || undefined, onchange: e => {
                    onValue(e.target.value);
                    change();
                } });
            node.append(...choices.map(([key, text]) => U.el('option', { value: String(key) }, text)));
            node.value = String(value);
            return U.field(label, node);
        }
        function input(label, value, onValue, { id, maxlength = 120, type = 'text', min, max, step = 1, hint } = {}) {
            const node = U.el('input', { id: id || undefined, type, value, maxlength, min, max, step, oninput: e => {
                    onValue(type === 'number' ? e.target.valueAsNumber : e.target.value);
                    change();
                } });
            return U.field(label, node, { hint });
        }
        function check(label, value, onValue, { id, disabled = false } = {}) {
            return U.el('label', { class: 'setting-check' }, U.el('input', { id: id || undefined, type: 'checkbox', checked: value, disabled, onchange: e => {
                    onValue(e.target.checked);
                    change();
                } }), label);
        }
        function colorField(label, target, key, fallback, id) {
            const picker = U.el('input', { type: 'color', value: /^#[\da-f]{6}$/i.test(target[key]) ? target[key] : fallback, 'aria-label': `${label}颜色选择器` });
            const hex = U.el('input', { id: id || undefined, type: 'text', value: target[key] || '', placeholder: '跟随默认', maxlength: 7, 'aria-label': label });
            picker.addEventListener('input', () => {
                target[key] = picker.value;
                hex.value = picker.value;
                change();
            });
            hex.addEventListener('input', () => {
                target[key] = hex.value.trim();
                if (/^#[\da-f]{6}$/i.test(hex.value))
                    picker.value = hex.value;
                change();
            });
            const reset = U.button('默认', () => {
                target[key] = '';
                hex.value = '';
                picker.value = fallback;
                change();
            }, { tone: 'text' });
            return U.field(label, U.el('div', { class: 'color-control' }, picker, hex, reset, E.palette(value=>{target[key]=value;picker.value=value;hex.value=value;change();})));
        }
        function styleGroup(title, col, part) {
            const style = col[part], defaultStyle = X.effectiveStyle({ ...col, [part]: {} }, draft.appearance, part);
            const group = U.el('section', { class: 'settings-section' });
            group.append(U.el('div', { class: 'section-heading' }, U.el('h3', {}, title), U.button('恢复', () => {
                col[part] = X.normalizeStyle();
                paint();
            }, { tone: 'text', className: 'small-reset' })));
            const fields = U.el('div', { class: 'setting-grid three' });
            fields.append(select('字体', style.family, [['', '跟随表格'], ...Object.entries(X.FONTS).map(([k, v]) => [k, v.label])], v => style.family = v, `setting-${part}-family`), select('字号', style.size, [[0, '跟随表格'], ...[12, 13, 14, 15, 16, 17, 18, 19, 20].map(v => [v, `${v} px`])], v => style.size = Number(v), `setting-${part}-size`), select('字重', style.weight, [[0, '默认'], [400, '常规'], [500, '中等'], [600, '加粗'], [700, '粗体']], v => style.weight = Number(v), `setting-${part}-weight`), select('对齐方式', style.align, [['', part === 'header' ? '跟随内容' : '字段默认'], ['left', '左对齐'], ['center', '居中'], ['right', '右对齐']], v => style.align = v, `setting-${part}-align`), colorField('文字颜色', style, 'color', defaultStyle.color, `setting-${part}-color`));
            group.append(fields);
            return group;
        }
        function moveColumn(from, to) {
            const a = draft.columns.findIndex(c => c.key === from), b = draft.columns.findIndex(c => c.key === to);
            draft.columns = C.moveItem(draft.columns, a, b);
            paint();
        }
        function renderColumns() {
            content.className = 'settings-content columns-editor';
            const aside = U.el('aside', { class: 'settings-column-list', 'aria-label': '选择列' }), list = U.el('div', { class: 'settings-column-items' });
            const all = check('全选样式列', selected.size === draft.columns.length, v => {
                selected = v ? new Set(draft.columns.map(c => c.key)) : new Set();
                paint();
            });
            aside.append(U.el('div', { class: 'batch-style-caption' }, U.el('strong', {}, '批量样式'), U.el('span', {}, '勾选仅用于复制文字样式')), all);
            draft.columns.forEach((col, index) => {
                const cb = U.el('input', { type: 'checkbox', checked: selected.has(col.key), 'aria-label': `选择${col.label}用于批量样式`, onchange: e => {
                        e.target.checked ? selected.add(col.key) : selected.delete(col.key);
                        paint();
                    } });
                const drag = U.iconButton('grip', `拖动${col.label}排序`, null, { className: 'icon-btn drag-handle', draggable: 'true', dataset: { drag: col.key }, onkeydown: e => {
                        if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
                            e.preventDefault();
                            const next = draft.columns[index + (e.key === 'ArrowUp' ? -1 : 1)];
                            if (next)
                                moveColumn(col.key, next.key);
                        }
                    } });
                const pick = U.el('button', { type: 'button', class: 'column-pick', 'aria-pressed': String(activeKey === col.key), dataset: { columnSelect: col.key }, onclick: () => {
                        activeKey = col.key;
                        activeSection = columnSections.get(col.key) || '';
                        paint();
                    } }, U.el('span', { class: 'column-pick-label' }, col.label || '未命名'), U.el('small', {}, col.visible ? (col.pin === 'left' ? '左侧冻结' : col.pin === 'right' ? '右侧冻结' : '显示') : '隐藏'));
                list.append(U.el('div', { class: `column-pick-row${activeKey === col.key ? ' is-active' : ''}`, dataset: { rowKey: col.key } }, cb, drag, pick));
            });
            U.draggableList(list, moveColumn);
            aside.append(list, U.el('p', { class: 'small-note' }, '勾选用于批量样式，不会隐藏列。'));
            const col = current(), definition = Config.COLUMNS.find(c => c.key === col.key), detail = U.el('div', { class: 'column-detail' });
            if (col.key !== 'actions') {
                const nav = U.el('nav', { class: 'column-section-nav', 'aria-label': '列设置分区' });
                for (const [id, label] of [['', '基本'], ['section-filter', '筛选'], ['section-mapping', '映射'], ...(col.key === 'amountCents' ? [['section-number', '数字']] : []), ['section-template', '模板'], ['section-trial', '试算']])
                    nav.append(U.button(label, () => {
                        activeSection = id; columnSections.set(col.key,id);
                        if (id) { uiState.folded.delete(col.key+':'+id); const section=detail.querySelector('#'+id);section?.querySelector('.section-content')?.removeAttribute('hidden');const fold=section?.querySelector('.section-fold');if(fold){fold.setAttribute('aria-expanded','true');fold.textContent='收起';}section?.scrollIntoView({block:'start'}); }
                        else detail.scrollTop=0;
                        renderPreview();
                    }, { tone: 'text', 'data-section-target':id, 'aria-current':String(activeSection===id) }));
                detail.append(nav);
            }
            detail.append(U.el('div', { class: 'section-heading column-detail-heading' }, U.el('div', {}, U.el('h3', { id:'editing-column-context' }, `当前编辑：${col.label}`), U.el('p', { class: 'small-note', id:'editing-column-meta' }), U.el('span',{class:'field-code'},`字段 ${col.key}`)), U.button('恢复此列', () => {
                draft.columns = draft.columns.map(c => c.key === col.key ? C.normalizeColumns().find(d => d.key === c.key) : c);
                paint();
            }, { tone: 'text', id: 'reset-current-column' })));
            const heading=detail.querySelector('.column-detail-heading'),nav=detail.querySelector('.column-section-nav');
            const band=U.el('div',{class:'column-editor-header'},heading,...(nav?[nav]:[]));detail.prepend(band);
            if (selected.size > 1)
                detail.append(U.el('div', { class: 'bulk-style-bar' }, U.el('span', {}, `已选 ${selected.size} 列，以“${col.label}”为样式来源。`), U.button('应用到所选列', () => {
                    for (const item of draft.columns)
                        if (selected.has(item.key)) {
                            item.body = C.clone(col.body);
                            item.header = C.clone(col.header);
                        }
                    message.textContent = '所选列的文字样式已同步，点击应用后保存。';
                    updateMeta();renderPreview();
                }, { tone: 'text', id: 'apply-bulk-style' })));
            const basic = U.el('section', { class: 'settings-section' }, U.el('div', { class: 'setting-grid two' }, input('显示名称', col.label, v => {
                col.label = v;
                const pick = list.querySelector(`[data-column-select="${col.key}"] .column-pick-label`);
                if (pick)
                    pick.textContent = v || '未命名';
            }, { id: 'setting-column-label', maxlength: 30, hint: `原名称：${definition.label}` }), input('列宽（px）', col.width, v => col.width = v, { type: 'number', min: col.minWidth, max: 640, step: 1, id: 'setting-column-width', hint: `允许 ${col.minWidth}–640 px` })));
            const pins = U.el('div', { class: 'detail-pins' }, U.el('span', {}, '冻结位置'));
            for (const side of ['left', 'right']) {
                const title = side === 'left' ? '冻结在左侧' : '冻结在右侧';
                const btn = U.iconButton(side === 'left' ? 'pinLeft' : 'pinRight', title, () => {
                    col.pin = col.pin === side ? '' : side;
                    paint();
                }, { className: `icon-btn pin-button${col.pin === side ? ' is-active' : ''}`, 'aria-pressed': String(col.pin === side), dataset: { detailPin: side } });
                pins.append(btn);
            }
            basic.append(U.el('div', { class: 'setting-inline' }, check('显示此列', col.visible, v => col.visible = v, { id: 'setting-column-visible', disabled: col.key === 'id' }), check('允许排序', col.sortable, v => {
                col.sortable = v;
                draft.sorts = X.normalizeSorts(draft.sorts, draft.columns);
                renderTabs();
            }, { id: 'setting-column-sortable', disabled: col.key === 'actions' }), pins));
            detail.append(basic);
            detail.append(styleGroup('表头文字', col, 'header'), styleGroup('单元格文字', col, 'body'));
            const display = U.el('section', { class: 'settings-section' }, U.el('h3', {}, '内容显示'));
            display.append(U.el('div', { class: 'setting-grid two' }, select('长文本', col.wrap, [['ellipsis', '单行省略'], ['two', '最多两行'], ['wrap', '完整换行']], v => col.wrap = v, 'setting-wrap'), input('空值显示', col.emptyText, v => col.emptyText = v, { maxlength: 16, id: 'setting-empty' }), input('表头说明', col.description, v => col.description = v, { maxlength: 120, id: 'setting-description' })));
            if (col.key !== 'actions')
                display.append(check('显示复制内容按钮', col.copyable, v => col.copyable = v, { id: 'setting-copyable' }));
            if (col.key === 'name')
                display.append(check('项目名称下方显示客户', col.showCustomer, v => col.showCustomer = v, { id: 'setting-show-customer' }));
            if (col.key === 'amountCents')
                display.append(U.el('div', { class: 'setting-grid two' }, select('显示小数位', col.decimals, [[0, '0 位'], [1, '1 位'], [2, '2 位']], v => col.decimals = Number(v), 'setting-decimals'), check('显示千分位', col.thousands, v => col.thousands = v, { id: 'setting-thousands' })), U.el('p', { class: 'small-note' }, '只调整显示，原始金额仍保留两位小数。'));
            if (['date', 'createdDate'].includes(col.key))
                display.append(select('日期格式', col.dateFormat, [['iso', '2026-09-20'], ['slash', '2026/09/20'], ['cn', '2026年9月20日']], v => col.dateFormat = v, 'setting-date-format'));
            if (col.key === 'actions')
                display.append(U.button('设置操作按钮', () => {
                    activeTab = 'actions';
                    paint();
                }, { tone: 'text' }));
            detail.append(display, root.QuoteRuleSettings.column({ col, draft, rows, change, paint, uiState }));
            content.replaceChildren(aside, detail);
        }
        function renderSorts() {
            content.className = 'settings-content settings-page';
            const available = draft.columns.filter(c => c.sortable), list = U.el('div', { class: 'sort-rules' });
            const move = (from, to) => {
                draft.sorts = C.moveItem(draft.sorts, draft.sorts.findIndex(s => s.key === from), draft.sorts.findIndex(s => s.key === to));
                paint();
            };
            draft.sorts.forEach((rule, index) => {
                const row = U.el('div', { class: 'sort-rule', dataset: { rowKey: rule.key } });
                const options = available.filter(c => c.key === rule.key || !draft.sorts.some(s => s.key === c.key)).map(c => [c.key, c.label]);
                row.append(U.iconButton('grip', '拖动排序优先级', null, { className: 'icon-btn drag-handle', draggable: 'true', dataset: { drag: rule.key } }), U.el('span', { class: 'rule-index' }, String(index + 1)), select('排序字段', rule.key, options, v => {
                    rule.key = v;
                    paint();
                }), select('顺序', rule.order, [['asc', '升序'], ['desc', '降序']], v => rule.order = v), U.el('div', { class: 'move-actions' }, U.iconButton('up', '上移排序规则', () => {
                    move(rule.key, draft.sorts[index - 1]?.key);
                }, { disabled: index === 0 }), U.iconButton('down', '下移排序规则', () => {
                    move(rule.key, draft.sorts[index + 1]?.key);
                }, { disabled: index === draft.sorts.length - 1 }), U.iconButton('trash', '删除排序规则', () => {
                    draft.sorts.splice(index, 1);
                    paint();
                })));
                list.append(row);
            });
            U.draggableList(list, move);
            content.replaceChildren(U.el('div', { class: 'section-heading' }, U.el('div', {}, U.el('h3', {}, '按优先级排序'), U.el('p', { class: 'small-note' }, '从上到下依次比较。空值放最后，排序后再分页。')), U.button('添加排序', () => {
                const next = available.find(c => !draft.sorts.some(s => s.key === c.key));
                if (next) {
                    draft.sorts.push({ key: next.key, order: 'asc' });
                    paint();
                }
            }, { icon: 'plus', id: 'add-sort-rule', disabled: draft.sorts.length >= available.length })), draft.sorts.length ? list : U.el('div', { class: 'settings-empty' }, U.icon('sort'), U.el('p', {}, '未设置排序'), U.el('small', {}, '也可以点击表头切换升序、降序和取消排序。')));
        }
        function renderActions() {
            content.className = 'settings-content settings-page';
            const config = draft.actions;
            const controls = U.el('section', { class: 'settings-section' }, U.el('div', { class: 'setting-grid four' }, select('行内最多显示', config.maxInline, [[0, '全部放入更多'], [1, '1 个按钮'], [2, '2 个按钮'], [3, '3 个按钮'], [4, '4 个按钮']], v => config.maxInline = Number(v), 'setting-max-inline'), select('默认显示形式', config.mode, [['text', '文字'], ['both', '图标 + 文字'], ['icon', '仅图标']], v => config.mode = v, 'setting-action-mode'), select('按钮对齐', config.align, [['left', '靠左'], ['center', '居中'], ['right', '靠右']], v => config.align = v, 'setting-action-align'), select('按钮间距', config.gap, [[4, '4 px'], [8, '8 px'], [12, '12 px'], [16, '16 px'], [20, '20 px']], v => config.gap = Number(v), 'setting-action-gap')), check('更多菜单按普通、导出、危险操作分组', config.groups, v => config.groups = v, { id: 'setting-action-groups' }), U.el('p', { class: 'small-note' }, '列宽不足时，末尾按钮自动放入“更多”。隐藏按钮不改变用户权限。'));
            const list = U.el('div', { class: 'action-rules' });
            const move = (from, to) => {
                config.items = C.moveItem(config.items, config.items.findIndex(a => a.id === from), config.items.findIndex(a => a.id === to));
                paint();
            };
            config.items.forEach((a, index) => {
                const row = U.el('section', { class: 'action-rule', dataset: { rowKey: a.id, actionRule: a.id } });
                const caption = U.el('input', { id:`action-${a.id}-label`, type: 'text', value: a.label, maxlength: 12, disabled: !!a.danger, 'aria-label': `${a.id}按钮名称`, oninput: e => {
                        a.label = e.target.value;
                        change();
                    } });
                const main = U.el('div', { class: 'action-rule-main' }, U.iconButton('grip', `拖动${a.label}排序`, null, { className: 'icon-btn drag-handle', draggable: 'true', dataset: { drag: a.id } }), U.field('按钮名称', caption), select('显示位置', a.placement, [['inline', '行内显示'], ['more', '放入更多'], ['hidden', '不显示']], v => a.placement = v, `action-${a.id}-placement`), select('显示形式', a.mode || '', [['', '跟随默认'], ['text', '文字'], ['both', '图标 + 文字'], ['icon', '仅图标']], v => a.mode = v, `action-${a.id}-mode`), select('菜单分组', a.group, a.danger ? [['danger', '危险操作']] : [['common', '普通操作'], ['export', '导出操作']], v => a.group = v), U.el('div', { class: 'move-actions' }, U.iconButton('up', `上移${a.label}`, () => move(a.id, config.items[index - 1]?.id), { disabled: index === 0 }), U.iconButton('down', `下移${a.label}`, () => move(a.id, config.items[index + 1]?.id), { disabled: index === config.items.length - 1 })));
                row.append(main, check('此按钮前加分隔线', a.divider, v => a.divider = v));
                if (a.danger)
                    row.append(U.el('small', { class: 'danger-note' }, '删除保留原名称、危险色和确认提示。'));
                if (a.id === 'export') {
                    const children = U.el('div', { class: 'action-children' });
                    children.append(U.el('strong', {}, '二级菜单'));
                    a.children.forEach((child, i) => children.append(U.el('div', { class: 'action-child', dataset: { rowKey: child.id } }, check(child.label, child.visible, v => child.visible = v, { id: `action-child-${child.id}` }), U.el('div', { class: 'move-actions' }, U.iconButton('up', `上移${child.label}`, () => {
                        a.children = C.moveItem(a.children, i, i - 1);
                        paint();
                    }, { disabled: i === 0 }), U.iconButton('down', `下移${child.label}`, () => {
                        a.children = C.moveItem(a.children, i, i + 1);
                        paint();
                    }, { disabled: i === a.children.length - 1 })))));
                    row.append(children);
                }
                list.append(row);
            });
            U.draggableList(list, move);
            content.replaceChildren(controls, U.el('h3', { class: 'list-section-title' }, '按钮及顺序'), list);
        }
        function renderAppearance() {
            content.className = 'settings-content settings-page';
            const a = draft.appearance;
            content.replaceChildren(U.el('section', { class: 'settings-section' }, U.el('h3', {}, '默认文字'), U.el('div', { class: 'setting-grid three' }, select('字体', a.family, Object.entries(X.FONTS).map(([k, v]) => [k, v.label]), v => a.family = v, 'appearance-family'), select('内容字号', a.size, [12, 13, 14, 15, 16, 17, 18, 19, 20].map(v => [v, `${v} px`]), v => a.size = Number(v), 'appearance-size'), select('表头字号', a.headerSize, [12, 13, 14, 15, 16, 17, 18, 19, 20].map(v => [v, `${v} px`]), v => a.headerSize = Number(v), 'appearance-header-size'), colorField('内容颜色', a, 'color', '#334155', 'appearance-color'), colorField('表头颜色', a, 'headerColor', '#334155', 'appearance-header-color')), U.el('p', { class: 'small-note' }, '单列设置优先于这里的默认值。字体未安装时，使用本机可用的后备字体。')), U.el('section', { class: 'settings-section' }, U.el('h3', {}, '布局'), U.el('div', { class: 'setting-grid three' }, select('行高', draft.density, [['compact', '紧凑'], ['normal', '默认'], ['loose', '宽松']], v => draft.density = v, 'appearance-density'), select('表格边框', a.borders, [['horizontal', '仅横线'], ['all', '完整边框'], ['none', '不显示边框']], v => a.borders = v, 'appearance-borders'), select('每页条数', draft.pageSize, Config.PAGE_SIZES.map(v => [v, `${v} 条`]), v => draft.pageSize = Number(v), 'appearance-page-size')), U.el('div', { class: 'setting-inline' }, check('斑马纹', a.striped, v => a.striped = v, { id: 'appearance-striped' }), check('显示序号', a.rowNumbers, v => a.rowNumbers = v, { id: 'appearance-row-numbers' }), check('悬停高亮', a.hover, v => a.hover = v, { id: 'appearance-hover' }))), U.el('section', { class: 'settings-section' }, U.el('h3', {}, '设置备份'), U.el('p', { class: 'small-note' }, '只包含列、排序、按钮和外观设置，不包含报价数据。恢复后仍需点击应用。'), U.el('div', { class: 'setting-inline' }, U.button('导出设置', exportSettings, { icon: 'download', id: 'export-settings' }), U.button('恢复设置', () => file.click(), { icon: 'upload', id: 'import-settings' }))));
        }
        function renderPreview() { content.querySelectorAll('[data-section-target]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.sectionTarget===activeSection)));previewController?.update(); }
        function paint() {
            const focused=document.activeElement, focus=focused?.id;
            const focusSelector=focused?.dataset?.columnSelect?`[data-column-select="${CSS.escape(focused.dataset.columnSelect)}"]`:focused?.dataset?.drag?`[data-drag="${CSS.escape(focused.dataset.drag)}"]`:null;
            if(paintedView) memory.set(paintedView,{ detail:content.querySelector('.column-detail')?.scrollTop||0,content:content.scrollTop,list:content.querySelector('.settings-column-items')?.scrollTop||0 });
            renderTabs();
            if (activeTab === 'columns') renderColumns();
            else if (activeTab === 'sorts') renderSorts();
            else if (activeTab === 'actions') renderActions();
            else if (activeTab === 'toolbar') {
                content.className = 'settings-content settings-page';
                content.replaceChildren(root.QuoteRuleSettings.toolbar({ draft, change, paint }));
            } else renderAppearance();
            E.enhanceControls(content);
            updateMeta();renderPreview();
            paintedView=`${activeTab}:${activeTab==='columns'?activeKey:''}`;
            const saved=memory.get(paintedView)||{detail:0,content:0,list:0};
            if(focus && !focused?.closest('.settings-preview')) box.element.querySelector(`#${CSS.escape(focus)}`)?.focus({preventScroll:true});
            else if(focusSelector)content.querySelector(focusSelector)?.focus({preventScroll:true});
            content.scrollTop=saved.content;
            const detail=content.querySelector('.column-detail');if(detail)detail.scrollTop=saved.detail;
            const list=content.querySelector('.settings-column-items');if(list)list.scrollTop=saved.list;
        }
        function exportSettings() {
            try {
                X.validateSettings(draft);
                U.download(JSON.stringify(X.settingsBackup(draft), null, 2), `表格设置_${C.today()}.json`, 'application/json;charset=utf-8');
                message.textContent = '已导出当前设置草稿。';
            }
            catch (e) {
                fail(e.message);
            }
        }
        const file = U.el('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'settings-import-file', onchange: async (e) => {
                const f = e.target.files[0];
                e.target.value = '';
                if (!f)
                    return;
                try {
                    if (f.size > 1024 * 1024)
                        throw new Error('设置文件不能超过 1 MB。');
                    let json;
                    try {
                        json = JSON.parse(await f.text());
                    }
                    catch {
                        throw new Error('设置文件不是有效的 JSON。');
                    }
                    const restored = X.readSettingsBackup(json);
                    if (!await U.confirm({ title: '恢复表格设置', message: '将用文件中的设置替换当前草稿，不修改报价数据。恢复后点击应用才生效。', confirmText: '恢复设置' }))
                        return;
                    draft = { ...C.normalizeSnapshot({ ...restored, filters: draft.filters }), columnFilters: C.clone(draft.columnFilters), advancedQuery: C.clone(draft.advancedQuery) };
                    paint();
                    message.textContent = '设置已恢复到草稿，请预览后应用。';
                }
                catch (err) {
                    fail(err.message);
                }
            } });
        box.element.append(file);
        box.footer.append(U.el('div', { class: 'settings-footer-left' }, U.button('恢复当前页', () => {
            const defaults = C.normalizeSnapshot();
            draft[activeTab === 'columns' ? 'columns' : activeTab === 'sorts' ? 'sorts' : activeTab === 'actions' ? 'actions' : activeTab === 'toolbar' ? 'toolbar' : 'appearance'] = defaults[activeTab === 'columns' ? 'columns' : activeTab === 'sorts' ? 'sorts' : activeTab === 'actions' ? 'actions' : activeTab === 'toolbar' ? 'toolbar' : 'appearance'];
            if (activeTab === 'appearance') {
                draft.density = 'normal';
                draft.pageSize = 10;
            }
            paint();
        }, { tone: 'text', id: 'reset-setting-page' }), U.button('恢复全部', () => {
            draft = { ...C.normalizeSnapshot({ filters: draft.filters }), columnFilters: C.clone(draft.columnFilters), advancedQuery: C.clone(draft.advancedQuery) };
            paint();
        }, { tone: 'text', id: 'reset-all-settings' })), U.button('取消', () => box.close(), { id: 'settings-cancel' }), U.button('应用', async () => {
            try {
                if (!dirty()) return;
                X.validateSettings(draft);
                const candidate = C.normalizeSnapshot(draft);
                const lost = Object.keys(draft.columnFilters || {}).some(k => !candidate.columnFilters[k]) || (draft.advancedQuery?.rules.length || 0) > (candidate.advancedQuery?.rules.length || 0);
                if (lost && !await U.confirm({ title: '清除不再可用的筛选？', message: '部分列关闭了筛选或修改了允许的条件。应用后会清除不再可用的列筛选和组合条件，顶部查询不变。', confirmText: '清除并应用' }))
                    return;
                await onApply(candidate);
                box.close();
            }
            catch (e) {
                fail(e.message);
            }
        }, { tone: 'primary', id: 'settings-apply' }));
        paint();
        box.open();
        renderPreview();
        return box;
    }
    root.QuoteSettings = Object.freeze({ open });
})(globalThis);
