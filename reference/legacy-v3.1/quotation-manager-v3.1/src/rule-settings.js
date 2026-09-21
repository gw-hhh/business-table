/* 设置抽屉的增量页面。统一使用主抽屉草稿，不建立第二份设置真相。 */
(function (root) {
    'use strict';
    const R = root.QuoteRules, U = root.QuoteUI, C = root.QuoteCore, X = root.QuoteCustomization, Rich = root.QuoteRichText, Config = root.QuoteConfig;
    function column({ col, draft, rows, change, paint, uiState = { folded: new Set(), mappingOpen: new Set() } }) {
        const host = U.el('div', { class: 'column-rule-sections' });
        function select(label, value, choices, fn, id, repaint = false) {
            const n = U.el('select', { id, onchange: e => {
                    fn(e.target.value);
                    change();
                    if (repaint)
                        paint();
                } }, choices.map(([v, l]) => U.el('option', { value: String(v) }, l)));
            n.value = String(value);
            return U.field(label, n);
        }
        function input(label, value, fn, id, type = 'text', max = 120) {
            return U.field(label, U.el('input', { id, type, value, maxlength: max, step: type === 'number' ? '1' : undefined, oninput: e => {
                    fn(type === 'number' ? e.target.valueAsNumber : e.target.value);
                    change();
                } }));
        }
        function check(label, value, fn, id, repaint = false) {
            return U.el('label', { class: 'setting-check' }, U.el('input', { id, type: 'checkbox', checked: value, onchange: e => {
                    fn(e.target.checked);
                    change();
                    if (repaint)
                        paint();
                } }), label);
        }
        function section(title, id, children) {
            const token=col.key+':'+id, body=U.el('div',{class:'section-content',hidden:uiState.folded.has(token)},children);
            const fold=U.button(uiState.folded.has(token)?'展开':'收起',()=>{body.hidden=!body.hidden;body.hidden?uiState.folded.add(token):uiState.folded.delete(token);fold.textContent=body.hidden?'展开':'收起';fold.setAttribute('aria-expanded',String(!body.hidden));},{tone:'text',className:'section-fold'});
            fold.setAttribute('aria-expanded',String(!body.hidden));body.id=id+'-content';fold.setAttribute('aria-controls',body.id);
            return U.el('section', { class: 'settings-section feature-section', id }, U.el('div',{class:'rule-section-heading'},U.el('div',{},U.el('h3',{},title),U.el('span',{class:'rule-section-summary',dataset:{ruleSummary:id}},root.QuoteExperience.summary(col,id))),fold), body);
        }
        if (col.key === 'actions')
            return host;
        const f = col.filter;
        const filterBody = U.el('div', {}, check('允许列筛选', f.enabled, v => {
            f.enabled = v;
        }, 'filter-enabled'));
        filterBody.append(U.el('div', { class: 'setting-grid two' }, select('筛选类型', f.type, [['text', '文本'], ['number', '数字区间'], ['date', '日期'], ['single', '单选'], ['multi', '多选'], ['boolean', '是 / 否']], v => {
            f.type = v;
            f.operators = R.FILTER_OPERATORS[v].map(([k]) => k);
            f.defaultRule = null;
        }, 'filter-type', true), select('选项来源', f.source, [['data', '完整数据中的值'], ['mapping', '值映射字典'], ['manual', '手动配置']], v => f.source = v, 'filter-source', true)), U.el('div', { class: 'setting-inline' }, check('选项支持搜索', f.search, v => f.search = v, 'filter-search'), check('显示匹配数量', f.counts, v => f.counts = v, 'filter-counts')));
        const ops = U.el('div', { class: 'operator-options' });
        for (const [id, label] of R.FILTER_OPERATORS[f.type])
            ops.append(check(label, f.operators.includes(id), yes => {
                f.operators = yes ? [...new Set([...f.operators, id])] : f.operators.filter(x => x !== id);
            }, `filter-op-${id}`));
        filterBody.append(U.el('p', { class: 'small-note' }, '允许使用的条件'), ops);
        if (f.source === 'manual') {
            filterBody.append(select('筛选项原始值类型', f.valueType, [['text', '文本'], ['number', '数字'], ['boolean', '布尔值']], v => f.valueType = v, 'filter-value-type'));
            const list = U.el('div', { class: 'manual-options' });
            f.options.forEach((o, i) => list.append(U.el('div', { class: 'mapping-row' }, input('原始值', o.value, v => o.value = v), input('选项名称', o.label, v => o.label = v), U.el('div', { class: 'move-actions' }, U.iconButton('up', '上移筛选项', () => {
                f.options = C.moveItem(f.options, i, i - 1);
                paint();
            }, { disabled: i === 0 }), U.iconButton('down', '下移筛选项', () => {
                f.options = C.moveItem(f.options, i, i + 1);
                paint();
            }, { disabled: i === f.options.length - 1 }), U.iconButton('trash', '删除筛选项', () => {
                f.options.splice(i, 1);
                paint();
            })))));
            filterBody.append(list, U.button('添加筛选项', () => {
                f.options.push({ value: '', label: '' });
                paint();
            }, { icon: 'plus', id: 'add-filter-option' }));
        }
        filterBody.append(U.el('p', { class: 'small-note' }, '选项来自完整本地数据，不只当前页。关闭已有列筛选会在应用时提示清除；不删除顶部查询。'));
        host.append(section('列筛选', 'section-filter', filterBody));
        const m = col.mapping;
        const mappingBody = U.el('div', {}, check('启用值映射', m.enabled, v => {
            m.enabled = v;
            if (v && !m.items.length && col.key === 'status')
                m.items = Object.entries(Config.STATUS).map(([raw, s]) => ({ raw, label: s.label, color: s.tone === 'green' ? '#047857' : s.tone === 'blue' ? '#1d4ed8' : '#475569', background: s.tone === 'green' ? '#ecfdf5' : s.tone === 'blue' ? '#eff6ff' : '#f1f5f9', border: '', icon: '' }));
        }, 'mapping-enabled', true));
        if (m.enabled) {
            mappingBody.append(U.el('div', { class: 'setting-grid three' }, select('原始值类型', m.type, [['text', '文本'], ['number', '数字'], ['boolean', '布尔值']], v => m.type = v, 'mapping-type'), select('显示形式', m.presentation, [['text', '普通文字'], ['tag', '标签'], ['dot', '圆点 + 文字']], v => m.presentation = v, 'mapping-presentation'), check('按字典顺序排序', m.sort, v => m.sort = v, 'mapping-sort')));
            const list = U.el('div', { class: 'mapping-items' });
            m.items.forEach((item, i) => {
                const openKey=col.key+':'+i;
                const details=U.el('details',{class:'mapping-style-details'});details.open=uiState.mappingOpen.has(openKey);
                details.addEventListener('toggle',()=>{details.open?uiState.mappingOpen.add(openKey):uiState.mappingOpen.delete(openKey);});
                const colors=U.el('div',{class:'mapping-colors'});
                for(const [k,label] of [['color','文字'],['background','背景'],['border','边框']]){
                    const hex=U.el('input',{type:'text',value:item[k]||'',maxlength:7,placeholder:'默认','aria-label':`第${i+1}项${label}色值`,id:`mapping-${k}-${i}`});
                    const picker=U.el('input',{type:'color',value:item[k]||'#e2e8f0','aria-label':`第${i+1}项${label}颜色`});
                    picker.addEventListener('input',()=>{item[k]=picker.value;hex.value=picker.value;change();});
                    hex.addEventListener('input',()=>{item[k]=hex.value.trim();if(/^#[a-f0-9]{6}$/i.test(hex.value))picker.value=hex.value;change();});
                    colors.append(U.field(label,U.el('div',{class:'mapping-color-control'},picker,hex,root.QuoteExperience.palette(value=>{item[k]=value;picker.value=value;hex.value=value;change();}))));
                }
                details.append(U.el('summary',{},'样式'),U.el('div',{class:'mapping-style-body'},colors,select('图标',item.icon,[['','不显示'],['check','对勾'],['info','说明'],['close','叉号']],v=>item.icon=v)));
                let raw=item.raw;if(m.type==='number')raw=Number(raw);if(m.type==='boolean')raw=raw===true||raw==='true';
                const sample=U.el('div',{class:'mapping-inline-preview',dataset:{mappingPreview:i}},Rich.mappedNode(raw,col));
                const row=U.el('div',{class:'mapping-item',dataset:{mappingRow:i}},
                    U.el('div',{class:'mapping-row'},input('原始值',item.raw,v=>item.raw=v,`mapping-raw-${i}`),U.el('span',{class:'mapping-arrow','aria-hidden':'true'},'→'),input('显示文字',item.label,v=>item.label=v,`mapping-label-${i}`,'text',60),sample,
                    U.el('div',{class:'move-actions'},U.iconButton('up','上移映射',()=>{m.items=C.moveItem(m.items,i,i-1);paint();},{disabled:i===0}),U.iconButton('down','下移映射',()=>{m.items=C.moveItem(m.items,i,i+1);paint();},{disabled:i===m.items.length-1}),U.iconButton('trash','删除映射',()=>{m.items.splice(i,1);paint();}))),details);
                list.append(row);
            });
            mappingBody.append(list, U.button('添加映射', () => {
                if (m.items.length < 200) {
                    m.items.push({ raw: '', label: '', color: '#334155', background: '#f1f5f9', border: '', icon: '' });
                    paint();
                }
            }, { icon: 'plus', id: 'add-mapping' }), U.el('div', { class: 'setting-grid two' }, input('未匹配提示', m.unknown, v => m.unknown = v, 'mapping-unknown'), input('空值提示', m.empty, v => m.empty = v, 'mapping-empty')), U.el('p', { class: 'small-note' }, '只转换显示，不修改原字段。当前状态原始值：draft / review / contract。数字 1 与文本 "1" 分开匹配。'));
        }
        host.append(section('值映射', 'section-mapping', mappingBody));
        if (col.key === 'amountCents') {
            const n = col.number;
            const numberBody = U.el('div', {}, check('启用高级数字格式', n.enabled, v => n.enabled = v, 'number-enabled', true));
            if (n.enabled) {
                numberBody.append(U.el('div', { class: 'setting-grid three' }, select('数字类型', n.mode, [['decimal', '普通数字'], ['currency', '金额'], ['percent', '百分比']], v => n.mode = v, 'number-mode', true), input('最少小数位', n.minDigits, v => n.minDigits = v, 'number-min', 'number'), input('最多小数位', n.maxDigits, v => n.maxDigits = v, 'number-max', 'number')));
                const precision=U.el('div',{class:'number-precision-line'},U.el('span',{class:'small-note'},'小数显示'));
                const buttons=U.el('div',{class:'segmented',role:'group','aria-label':'小数显示方式'});
                const fixed=U.button('固定小数',()=>{n.minDigits=n.maxDigits;paint();},{id:'number-precision-fixed'}),maximum=U.button('最多小数',()=>{n.minDigits=0;paint();},{id:'number-precision-max'});
                fixed.setAttribute('aria-pressed',String(n.minDigits===n.maxDigits));maximum.setAttribute('aria-pressed',String(n.minDigits===0&&n.minDigits!==n.maxDigits));buttons.append(fixed,maximum);
                precision.append(buttons,U.el('span',{class:'small-note'},'下方原有最少／最多位数可继续细调。'));numberBody.insertBefore(precision,numberBody.children[1]);
                if (n.mode === 'percent')
                    numberBody.append(select('原始值含义', n.percentBase, [['ratio', '1 代表 100%（比例值）'], ['hundred', '100 代表 100%（百分数）']], v => n.percentBase = v, 'number-percent-base'));
                else
                    numberBody.append(select('显示单位缩放', n.scale, [[1, '不缩放'], [1000, '除以 1,000'], [10000, '除以 10,000（万）'], [100000000, '除以 100,000,000（亿）']], v => n.scale = Number(v), 'number-scale'));
                if (n.mode === 'currency')
                    numberBody.append(select('货币符号', n.currency, [['CNY', '人民币 ¥'], ['USD', '美元 $'], ['EUR', '欧元 €'], ['JPY', '日元 ¥']], v => n.currency = v, 'number-currency'));
                numberBody.append(U.el('div', { class: 'setting-grid three' }, select('正负号', n.sign, [['auto', '自动'], ['always', '正数也显示 +'], ['accounting', '负数使用括号']], v => n.sign = v, 'number-sign'), input('前缀', n.prefix, v => n.prefix = v, 'number-prefix', 'text', 12), input('后缀 / 单位', n.suffix, v => n.suffix = v, 'number-suffix', 'text', 12)), check('千分位分隔', n.group, v => n.group = v, 'number-group'), U.el('div', { class: 'format-presets' }, U.button('金额两位', () => {
                    col.number = R.normalizeNumber({ enabled: true, mode: 'currency', minDigits: 2, maxDigits: 2 });
                    paint();
                }, { tone: 'text' }), U.button('百分比两位', () => {
                    col.number = R.normalizeNumber({ enabled: true, mode: 'percent', percentBase: 'ratio', minDigits: 2, maxDigits: 2 });
                    paint();
                }, { tone: 'text' }), U.button('万元两位', () => {
                    col.number = R.normalizeNumber({ enabled: true, scale: 10000, minDigits: 2, maxDigits: 2, suffix: '万元' });
                    paint();
                }, { tone: 'text' })), U.el('p', { class: 'small-note' }, '金额先由分换算为元，再显示格式。仅调整显示，不增加存储精度。关闭高级格式后继续使用原来的小数位和千分位设置。'));
            }
            host.append(section('数字格式', 'section-number', numberBody));
        }
        const t = col.template, templatePreview = U.el('div', { class: 'template-preview rich-display' });
        templatePreview.append(Rich.render(t.document, { template: true }));
        host.append(section('富文本显示模板', 'section-template', U.el('div', {}, check('使用列显示模板', t.enabled, v => t.enabled = v, 'template-enabled'), templatePreview, U.el('div', { class: 'setting-inline' }, U.button('编辑模板', () => Rich.open({ title: `编辑模板 · ${col.label}`, template: true, maxChars: 3000, document: t.document, onSave: d => {
                t.document = d;
                t.enabled = true;
                change();
                paint();
            } }), { icon: 'edit', id: 'edit-column-template' }), U.button('项目 + 客户双行', () => {
            t.document = { ops: [{ insert: { qfield: 'name' }, attributes: { bold: true } }, { insert: '\n' }, { insert: { qfield: 'customer' }, attributes: { color: '#64748b', size: '12px' } }, { insert: '\n' }] };
            t.enabled = true;
            change();
            paint();
        }, { tone: 'text' }), U.button('使用当前字段', () => {
            t.document = { ops: [{ insert: { qfield: col.key } }, { insert: '\n' }] };
            change();
            paint();
        }, { tone: 'text' })), U.el('p', { class: 'small-note' }, '只改变单元格显示。原字段继续用于筛选、排序、编辑和结构化导出；原复制、详情入口不移除。'))));
        const trialValue = U.el('input', { id: 'rule-trial-value', type: 'text', value: uiState.trials?.get(col.key) ?? (col.key === 'amountCents' ? '0.125' : String(rows[0]?.[col.key] ?? '1')), 'aria-label': '试算原始值' }), trial = U.el('div', { class: 'rule-trial-result', role: 'status' });
        function previewTrial() {
            let v = trialValue.value;
            if (col.mapping.enabled) {
                if (col.mapping.type === 'number')
                    v = Number(v);
                else if (col.mapping.type === 'boolean')
                    v = v === 'true';
            }
            else if (col.key === 'amountCents')
                v = Number(v);
            const display = col.mapping.enabled ? R.mappedText(v, col.mapping, String(v)) : col.number.enabled ? R.formatNumber(v, col.number) : String(v);
            const excel = col.number.enabled ? R.excelNumber(v, col.number) : null;
            trial.replaceChildren(U.el('span', {}, '显示结果'), col.mapping.enabled ? Rich.mappedNode(v, col) : U.el('strong', {}, display), excel ? U.el('small', {}, `Excel 数值：${excel.value} · 格式：${excel.format}`) : U.el('small', {}, `筛选匹配原始${col.mapping.type === 'number' ? '数字' : '值'}：${v}`));
        }
        trialValue.addEventListener('input',()=>{uiState.trials?.set(col.key,trialValue.value);previewTrial();});
        host.append(section('规则试算', 'section-trial', U.el('div', {}, U.field(col.key === 'amountCents' ? '基础数值（元，不是分）' : '原始值', trialValue), U.button('试算', previewTrial, { id: 'rule-trial-run', tone: 'text' }), trial)));
        previewTrial();
        return host;
    }
    function toolbar({ draft, change, paint }) {
        const t = draft.toolbar, host = U.el('div', { class: 'toolbar-settings' });
        const byView = U.el('label', { class: 'setting-check' }, U.el('input', { id: 'toolbar-by-view', type: 'checkbox', checked: t.byView, onchange: e => {
                t.byView = e.target.checked;
                change();
            } }), '工具栏随命名视图保存和切换');
        const gap=U.el('select',{id:'toolbar-gap','aria-label':'工具间距',onchange:e=>{t.gap=Number(e.target.value);change();}},[4,8,12].map(v=>U.el('option',{value:v},v+' px')));gap.value=String(t.gap);
        host.append(U.el('div',{class:'toolbar-settings-intro'},U.el('p',{class:'small-note'},'拖动或使用箭头调整顺序。窄屏优先收起非固定按钮，设置入口始终保留。'),U.el('div',{class:'toolbar-preference-line'},byView,U.field('工具间距',gap))));
        for (const [area, label] of [['header', '页面工具栏'], ['table', '表格工具栏']]) {
            const list = U.el('div', { class: 'toolbar-config-list' });
            const heading = U.el('div', { class: 'toolbar-config-heading', 'aria-hidden':'true' }, ['顺序','名称','显示位置','展示形式','固定','分隔','移动'].map(v=>U.el('span',{},v)));
            list.append(heading);
            const items = t.items.filter(i => i.area === area);
            const move = (from, to) => {
                const a = t.items.findIndex(i => i.id === from), b = t.items.findIndex(i => i.id === to);
                if (a >= 0 && b >= 0) {
                    t.items = C.moveItem(t.items, a, b);
                    paint();
                }
            };
            items.forEach((item, index) => {
                function pick(label, val, choices, fn, id) {
                    const n = U.el('select', { 'aria-label': label, id, onchange: e => {
                            fn(e.target.value);
                            change();
                        } }, choices.map(([v, l]) => U.el('option', { value: v }, l)));
                    n.value = val;
                    return U.field(label, n);
                }
                const name = U.el('input', { id:`tool-label-${item.id}`, type:'text', value: item.label, maxlength: 16, 'aria-label': `${item.id}名称`, oninput: e => {
                        item.label = e.target.value;
                        change();
                    } });
                list.append(U.el('div', { class: 'toolbar-config-row', dataset: { toolConfig: item.id, rowKey: item.id } }, U.iconButton('grip', `拖动${item.label}`, null, { draggable: true, dataset: { drag: item.id } }), U.field('名称', name), pick('位置', item.placement, item.locked ? [['inline', '始终显示']] : [['inline', '直接显示'], ['more', '放入更多'], ['hidden', '隐藏']], v => item.placement = v, `tool-placement-${item.id}`), pick('形式', item.mode, [['both', '图标 + 文字'], ['icon', '仅图标'], ['text', '仅文字']], v => item.mode = v, `tool-mode-${item.id}`), U.el('label', { class: 'setting-check' }, U.el('input', { type: 'checkbox', id:`tool-fixed-${item.id}`, checked: item.fixed, disabled: item.locked, 'aria-label': `固定${item.label}`, onchange: e => {
                        item.fixed = e.target.checked;
                        change();
                    } }), '固定'), U.el('label', { class: 'setting-check' }, U.el('input', { type: 'checkbox', id:`tool-divider-${item.id}`, checked: item.divider, 'aria-label': `${item.label}前分隔线`, onchange: e => {
                        item.divider = e.target.checked;
                        change();
                    } }), '分隔'), U.el('div', { class: 'move-actions' }, U.iconButton('up', `上移工具${item.label}`, () => move(item.id, items[index - 1]?.id), { disabled: index === 0 }), U.iconButton('down', `下移工具${item.label}`, () => move(item.id, items[index + 1]?.id), { disabled: index === items.length - 1 }))));
            });
            U.draggableList(list, move);
            host.append(U.el('h3', {}, label), list);
        }
        return host;
    }
    root.QuoteRuleSettings = Object.freeze({ column, toolbar });
})(globalThis);
