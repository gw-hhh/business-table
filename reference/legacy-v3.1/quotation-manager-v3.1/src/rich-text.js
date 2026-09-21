/* 轻量富文本编辑器：受控结构化文档、Selection/Range 编辑、撤销历史。
 * 不使用 execCommand，不把用户 HTML 直接插入活动文档；粘贴先解析为白名单 Delta。
 * 支持文字与字段模板，不支持图片、视频、任意脚本和任意 CSS。 */
(function (root) {
    'use strict';
    const R = root.QuoteRules, U = root.QuoteUI, X = root.QuoteCustomization, Config = root.QuoteConfig;
    const FAMILIES = { system: '-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif', yahei: '"Microsoft YaHei",sans-serif', pingfang: '"PingFang SC",sans-serif', serif: 'SimSun,serif', mono: 'Consolas,monospace' };
    const SIZES = ['12px', '13px', '14px', '15px', '16px', '18px', '20px', '22px', '24px'];
    function attrs(node, inherited = {}) {
        const a = node.dataset?.richReset === 'true' ? {} : { ...inherited }, tag = node.tagName?.toLowerCase(), s = node.style || {};
        if (['strong', 'b'].includes(tag) || Number(s.fontWeight) >= 600 || s.fontWeight === 'bold')
            a.bold = true;
        if (s.fontWeight === 'normal' || s.fontWeight === '400')
            delete a.bold;
        if (s.fontStyle === 'normal')
            delete a.italic;
        if (s.textDecoration === 'none') {
            delete a.underline;
            delete a.strike;
        }
        if (['em', 'i'].includes(tag) || s.fontStyle === 'italic')
            a.italic = true;
        if (tag === 'u' || String(s.textDecoration).includes('underline'))
            a.underline = true;
        if (['s', 'del', 'strike'].includes(tag) || String(s.textDecoration).includes('line-through'))
            a.strike = true;
        for (const [k, prop] of [['color', 'color'], ['background', 'backgroundColor']]) {
            let color = s[prop] || '';
            if (/^rgb\(/.test(color)) {
                const nums = color.match(/\d+/g);
                if (nums?.length === 3)
                    color = '#' + nums.map(n => Number(n).toString(16).padStart(2, '0')).join('');
            }
            if (/^#[\da-f]{6}$/i.test(color))
                a[k] = color;
        }
        if (SIZES.includes(s.fontSize))
            a.size = s.fontSize;
        if (node.dataset?.font && Object.hasOwn(FAMILIES, node.dataset.font))
            a.font = node.dataset.font;
        if (['left', 'center', 'right'].includes(s.textAlign))
            a.align = s.textAlign;
        if (tag === 'a' && R.safeLink(node.getAttribute('href')))
            a.link = R.safeLink(node.getAttribute('href'));
        if (tag === 'li')
            a.list = node.parentElement?.tagName === 'OL' ? 'ordered' : 'bullet';
        return a;
    }
    function fromDOM(host, { template = false, maxChars = 1000 } = {}) {
        const ops = [];
        let visited = 0;
        const blocks = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE']);
        const skip = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'VIDEO', 'AUDIO', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'TEMPLATE']);
        function push(s, a) {
            if (s)
                ops.push({ insert: s, ...(Object.keys(a).length ? { attributes: a } : {}) });
        }
        function walk(n, inherited = {}, depth = 0) {
            if (++visited > 10000 || depth > 200)
                throw new Error('内容层级过深或节点过多，请使用纯文本粘贴。');
            if (n.nodeType === 3) {
                push(n.nodeValue, inherited);
                return;
            }
            if (n.nodeType !== 1 || skip.has(String(n.tagName).toUpperCase()))
                return;
            const a = attrs(n, inherited);
            if (template && n.dataset?.qfield && R.FIELDS.has(n.dataset.qfield)) {
                ops.push({ insert: { qfield: n.dataset.qfield }, attributes: a });
                return;
            }
            if (n.tagName === 'BR') {
                push('\n', a);
                return;
            }
            const block = blocks.has(n.tagName);
            if (block && ops.length && !String(ops.at(-1).insert).endsWith('\n'))
                push('\n', {});
            const start = ops.length;
            for (const child of n.childNodes)
                walk(child, a, depth + 1);
            if (block) {
                const last = ops.at(-1);
                if (ops.length === start || typeof last?.insert !== 'string' || !last.insert.endsWith('\n'))
                    push('\n', a);
                else if (a.align || a.list) {
                    const end = last.insert.length - 1;
                    if (end > 0) {
                        last.insert = last.insert.slice(0, end);
                        push('\n', { ...(last.attributes || {}), ...(a.align ? { align: a.align } : {}), ...(a.list ? { list: a.list } : {}) });
                    }
                    else
                        last.attributes = { ...(last.attributes || {}), ...(a.align ? { align: a.align } : {}), ...(a.list ? { list: a.list } : {}) };
                }
            }
        }
        for (const node of host.childNodes)
            walk(node, attrs(host));
        return R.normalizeDelta({ ops }, { template, maxChars });
    }
    function applyStyle(node, a = {}) {
        if (a.bold !== undefined)
            node.style.fontWeight = a.bold ? '700' : '400';
        if (a.italic !== undefined)
            node.style.fontStyle = a.italic ? 'italic' : 'normal';
        if (a.underline !== undefined || a.strike !== undefined)
            node.style.textDecoration = [a.underline ? 'underline' : '', a.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
        if (a.color)
            node.style.color = a.color;
        if (a.background)
            node.style.backgroundColor = a.background;
        if (a.size)
            node.style.fontSize = a.size;
        if (a.font) {
            node.style.fontFamily = FAMILIES[a.font];
            node.dataset.font = a.font;
        }
        return node;
    }
    /** 按文档白名单构造全新 DOM，字段展开不再递归执行其他模板。 */
    function render(document, { template = false, resolver = null, maxChars = 3000, editing = false } = {}) {
        const delta = R.normalizeDelta(document, { template, maxChars }), fragment = root.document.createDocumentFragment();
        let p = U.el('p'), has = false, list = null;
        function flush(a = {}) {
            if (!p.childNodes.length)
                p.append(U.el('br'));
            if (a.align)
                p.style.textAlign = a.align;
            if (a.list) {
                const tag = a.list === 'ordered' ? 'ol' : 'ul';
                if (!list || list.tagName.toLowerCase() !== tag) {
                    list = U.el(tag);
                    fragment.append(list);
                }
                const li = U.el('li', {}, ...p.childNodes);
                if (a.align)
                    li.style.textAlign = a.align;
                list.append(li);
            }
            else {
                list = null;
                fragment.append(p);
            }
            p = U.el('p');
            has = false;
        }
        for (const op of delta.ops) {
            const a = op.attributes || {};
            if (typeof op.insert === 'object') {
                const key = op.insert.qfield;
                let node;
                if (resolver) {
                    const val = resolver(key);
                    node = val instanceof Node ? val : U.el('span', {}, String(val ?? ''));
                }
                else
                    node = U.el('span', { class: 'rich-field-token', contenteditable: 'false', dataset: { qfield: key }, title: `字段：${key}` }, `〔${Config.COLUMNS.find(c => c.key === key)?.label || '备注'}〕`);
                p.append(applyStyle(node, a));
                has = true;
                continue;
            }
            const lines = op.insert.split('\n');
            lines.forEach((part, i) => {
                if (part) {
                    let n = U.el('span', {}, part);
                    applyStyle(n, a);
                    if (a.link && !template) {
                        const link = U.el('a', { href: a.link, target: '_blank', rel: 'noopener noreferrer' }, n);
                        p.append(link);
                    }
                    else
                        p.append(n);
                    has = true;
                }
                if (i < lines.length - 1)
                    flush(a);
            });
        }
        if (has)
            flush();
        return fragment;
    }
    function plainDelta(text) {
        return R.normalizeDelta({ ops: [{ insert: String(text || '') + '\n' }] });
    }
    function open({ title = '编辑富文本', document = null, text = '', template = false, maxChars = 1000, onSave, onClose } = {}) {
        let saved = R.normalizeDelta(document || plainDelta(text), { template, maxChars }), range = null, timer = null, composing = false;
        const original = JSON.stringify(saved), history = [saved];
        let position = 0;
        const editor = U.el('div', { id: 'rich-editor', class: 'rich-editor', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': template ? '列模板内容' : '备注内容', spellcheck: 'false' }), toolbar = U.el('div', { class: 'rich-editor-toolbar', role: 'toolbar', 'aria-label': '文字格式' }), error = U.el('p', { class: 'form-error', role: 'alert', hidden: true }), counter = U.el('span', { class: 'small-note', role: 'status' });
        const options = { template, maxChars };
        const lifetime = new AbortController(), selectionStatus = U.el('span', { class: 'rich-selection-status', id: 'rich-selection-status' });
        const get = () => fromDOM(editor, options);
        function currentLength() {
            return R.deltaText(fromDOM(editor, { template, maxChars: maxChars + 100000 })).length;
        }
        function update() {
            const length = currentLength();
            counter.textContent = `${length} / ${maxChars}${template ? ' · 字段随记录变化' : ''}`;
            counter.classList.toggle('text-danger', length > maxChars);
        }
        function remember() {
            const selection = getSelection();
            if (selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode))
                range = selection.getRangeAt(0).cloneRange();
            syncFormat();
        }
        // Read effective attributes on the actual selected runs, not their common ancestor.
        function selectionFormats() {
            if (!range || !editor.contains(range.commonAncestorContainer)) return [];
            const nodes = [], walker = root.document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
            if (range.collapsed) nodes.push(range.startContainer.nodeType === 3 ? range.startContainer : range.startContainer);
            else for (let n=walker.nextNode();n;n=walker.nextNode()) {
                if(!n.nodeValue || !range.intersectsNode(n)) continue;
                if(n===range.startContainer && range.startOffset>=n.length) continue;
                if(n===range.endContainer && range.endOffset===0) continue;
                nodes.push(n);
            }
            return nodes.map(n=>{
                const parents=[];let e=n.nodeType===1?n:n.parentElement;
                for(;e&&e!==editor;e=e.parentElement) parents.unshift(e);
                return parents.reduce((a,x)=>attrs(x,a),{});
            });
        }
        function formatState(key) {
            const values=selectionFormats();if(!values.length)return undefined;
            const read=a=>['bold','italic','underline','strike'].includes(key)?!!a[key]:a[key]||({font:'system',size:'14px',align:'left'})[key]||'';
            const first=read(values[0]);return values.every(a=>read(a)===first)?first:'mixed';
        }
        function syncFormat() {
            let mixed=false;
            for(const key of ['bold','italic','underline','strike']) {
                const b=toolbar.querySelector('#rich-'+key),v=formatState(key);if(!b)continue;
                b.setAttribute('aria-pressed',v==='mixed'?'mixed':String(v===true));if(v==='mixed')mixed=true;
            }
            for(const [key,id] of [['font','rich-font'],['size','rich-size'],['align','rich-align']]) {
                const select=toolbar.querySelector('#'+id);if(!select)continue;const v=formatState(key);
                select.options[0].textContent=v==='mixed'?'混合':select.getAttribute('aria-label');select.value=v==='mixed'||v===undefined?'':v;
                if(v==='mixed')mixed=true;
            }
            selectionStatus.textContent=mixed?'选区包含不同格式':range&&!range.collapsed?'已选择文字':'选中文字后设置格式';
        }
        function focusRange() {
            editor.focus();
            const sel = getSelection();
            if (!range || !editor.contains(range.commonAncestorContainer)) {
                range = root.document.createRange();
                range.selectNodeContents(editor);
                range.collapse(false);
            }
            sel.removeAllRanges();
            sel.addRange(range);
            return range;
        }
        function checkpoint() {
            clearTimeout(timer);
            const now = get();
            if (JSON.stringify(now) !== JSON.stringify(history[position])) {
                history.splice(position + 1);
                history.push(now);
                if (history.length > 60)
                    history.shift();
                position = history.length - 1;
            }
            update();
            toolbar.querySelector('#rich-undo').disabled = position === 0;
            toolbar.querySelector('#rich-redo').disabled = position === history.length - 1;
        }
        function restore(d) {
            editor.replaceChildren(render(d, { ...options, editing: true }));
            range = null;
            update(); syncFormat();
            toolbar.querySelector('#rich-undo').disabled = position === 0;
            toolbar.querySelector('#rich-redo').disabled = position === history.length - 1;
        }
        function undo(forward = false) {
            checkpoint();
            position = Math.max(0, Math.min(history.length - 1, position + (forward ? 1 : -1)));
            restore(history[position]);
            focusRange();
        }
        function onFormat(key, value) {
            checkpoint();
            let r = focusRange();
            if (key === 'align' || key === 'list') {
                let blocks = [...editor.querySelectorAll('p,div,li')].filter(n => !n.querySelector('p,div,li') && r.intersectsNode(n));
                if (!blocks.length) {
                    const p = U.el('p', {}, ...editor.childNodes);
                    editor.append(p);
                    blocks = [p];
                    r.selectNodeContents(p);
                }
                if (key === 'align')
                    blocks.forEach(p => p.style.textAlign = value);
                else {
                    const handled = new Set();
                    let list = null;
                    for (const p of blocks) {
                        if (p.tagName === 'LI') {
                            const parent = p.parentElement;
                            if (handled.has(parent))
                                continue;
                            handled.add(parent);
                            const replacement = U.el(value === 'ordered' ? 'ol' : 'ul', {}, ...parent.childNodes);
                            parent.replaceWith(replacement);
                        }
                        else {
                            if (!list) {
                                list = U.el(value === 'ordered' ? 'ol' : 'ul');
                                p.before(list);
                            }
                            const li = U.el('li', { style: { textAlign: p.style.textAlign } }, ...p.childNodes);
                            list.append(li);
                            p.remove();
                        }
                    }
                }
                range = null;
                r = focusRange();
            }
            else if (key === 'clear' && !r.collapsed) {
                const host = U.el('div');
                host.append(r.extractContents());
                const clean = fromDOM(host, { template, maxChars });
                const node = U.el('span', { dataset: { richReset: 'true' }, style: { fontWeight: '400', fontStyle: 'normal', textDecoration: 'none', color: '#334155', backgroundColor: 'transparent' } });
                for (const op of clean.ops) {
                    if (typeof op.insert === 'string') {
                        const text = op === clean.ops.at(-1) ? op.insert.replace(/\n$/, '') : op.insert;
                        const parts = text.split('\n');
                        parts.forEach((part, i) => {
                            if (i)
                                node.append(U.el('br'));
                            if (part)
                                node.append(root.document.createTextNode(part));
                        });
                    }
                    else
                        node.append(U.el('span', { class: 'rich-field-token', contenteditable: 'false', dataset: { qfield: op.insert.qfield } }, `〔${Config.COLUMNS.find(c => c.key === op.insert.qfield)?.label || '备注'}〕`));
                }
                r.insertNode(node);
                r.selectNodeContents(node);
            }
            else if (!r.collapsed) {
                if (['bold', 'italic', 'underline', 'strike'].includes(key)) value = formatState(key) !== true;
                if (key === 'link' && !R.safeLink(value)) {
                    error.textContent = '请输入 http、https 或 mailto 链接。'; error.hidden=false; return;
                }
                const fragment = r.extractContents(), span = U.el('span');
                if (key === 'link') {
                    const safe = R.safeLink(value);
                    if (!safe) {
                        error.hidden = false;
                        error.textContent = '请输入 http、https 或 mailto 链接。';
                        return;
                    }
                    fragment.querySelectorAll('a').forEach(a => a.replaceWith(...a.childNodes));
                    span.append(U.el('a', { href: safe, target: '_blank', rel: 'noopener noreferrer' }, fragment));
                }
                else {
                    span.append(fragment);
                    applyStyle(span, { [key]: value });
                    span.querySelectorAll('*').forEach(n => applyStyle(n, { [key]: value }));
                }
                r.insertNode(span);
                r.selectNodeContents(span);
            }
            else {
                error.hidden = false;
                error.textContent = '请先选中文字，再设置样式。';
                return;
            }
            const selection = getSelection();
            selection.removeAllRanges();
            selection.addRange(r);
            range = r.cloneRange();
            error.hidden = true;
            remember();
            checkpoint();
        }
        function action(label, fn, extra = {}) {
            const b = U.button(label, fn, { className: 'rich-command', ...extra });
            b.addEventListener('mousedown', e => e.preventDefault());
            return b;
        }
        function pick(label, choices, fn, id) {
            const n = U.el('select', { 'aria-label': label, id, onchange: e => fn(e.target.value) });
            n.append(U.el('option', { value: '' }, label), ...choices.map(([v, l]) => U.el('option', { value: v }, l)));
            return n;
        }
        function group(label) {const n=U.el('div',{class:'rich-tool-group',role:'group','aria-label':label});toolbar.append(n);return n;}
        const historyGroup=group('撤销与重做'),fontGroup=group('字体与字号'),formatGroup=group('文字格式'),colorGroup=group('文字颜色'),paragraphGroup=group('段落与列表'),insertGroup=group('插入与清除');
        historyGroup.append(action('撤销',()=>undo(),{id:'rich-undo',icon:'undo'}),action('重做',()=>undo(true),{id:'rich-redo',icon:'redo'}));
        fontGroup.append(pick('字体',Object.keys(FAMILIES).map(k=>[k,X.FONTS[k]?.label||k]),v=>v&&onFormat('font',v),'rich-font'),pick('字号',SIZES.map(s=>[s,s]),v=>v&&onFormat('size',v),'rich-size'));
        for(const [key,label,symbol] of [['bold','加粗','B'],['italic','斜体','I'],['underline','下划线','U'],['strike','删除线','S']]) {
            const b=action(label,()=>onFormat(key,true),{id:'rich-'+key,title:label});b.setAttribute('aria-label',label);b.setAttribute('aria-pressed','false');b.setAttribute('aria-controls','rich-editor');
            b.replaceChildren(U.el('span',{class:'rich-symbol rich-symbol-'+key,'aria-hidden':'true'},symbol));formatGroup.append(b);
        }
        for (const [key, label] of [['color', '文字颜色'], ['background', '背景颜色']]) {
            const picker = U.el('input', { type: 'color', value: key === 'color' ? '#2563eb' : '#fef3c7', 'aria-label': label, id: `rich-${key}`, onchange: e => onFormat(key, e.target.value) });
            colorGroup.append(U.el('label', { class: 'rich-color' }, label, picker));
        }
        paragraphGroup.append(pick('对齐', [['left', '左对齐'], ['center', '居中'], ['right', '右对齐']], v => v && onFormat('align', v), 'rich-align'), action('项目符号', () => onFormat('list', 'bullet')), action('编号列表', () => onFormat('list', 'ordered')));
        insertGroup.append(action('清除格式', () => onFormat('clear')));
        if (!template)
            insertGroup.append(action('链接', () => {
                remember();
                const p = U.panel({ title: '设置链接' }), url = U.el('input', { type: 'url', placeholder: 'https://', id: 'rich-link-url' });
                p.body.append(U.field('链接地址', url));
                p.footer.append(U.button('取消', () => p.close()), U.button('确定', () => {
                    const value = R.safeLink(url.value);
                    if (!value) {
                        url.setCustomValidity('请输入有效的 http、https 或 mailto 链接。');
                        url.reportValidity();
                        return;
                    }
                    p.close();
                    onFormat('link', value);
                }, { tone: 'primary' }));
                p.open();
            }));
        if (template) {
            const f = pick('插入字段', [...R.FIELDS].map(key => [key, Config.COLUMNS.find(c => c.key === key)?.label || '备注']), key => {
                if (!key)
                    return;
                checkpoint();
                const r = focusRange(), node = U.el('span', { class: 'rich-field-token', contenteditable: 'false', dataset: { qfield: key } }, `〔${Config.COLUMNS.find(c => c.key === key)?.label || '备注'}〕`);
                r.deleteContents();
                r.insertNode(node);
                r.setStartAfter(node);
                r.collapse(true);
                range = r.cloneRange();
                focusRange();
                checkpoint();
                f.value = '';
            }, 'rich-insert-field');
            insertGroup.append(f);
        }
        root.document.addEventListener('selectionchange', remember, { signal: lifetime.signal });
        editor.addEventListener('mouseup', remember);
        editor.addEventListener('keyup', remember);
        editor.addEventListener('blur', remember);
        editor.addEventListener('compositionstart', () => composing = true);
        editor.addEventListener('compositionend', () => {
            composing = false;
            checkpoint();
        });
        editor.addEventListener('input', () => {
            update();
            if (!composing) {
                clearTimeout(timer);
                timer = setTimeout(checkpoint, 350);
            }
        });
        editor.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                undo(e.shiftKey);
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                undo(true);
            }
        });
        editor.addEventListener('drop', e => {
            e.preventDefault();
            error.textContent = '请粘贴文字；这里不接受拖入文件或网页元素。';
            error.hidden = false;
        });
        editor.addEventListener('paste', e => {
            e.preventDefault();
            checkpoint();
            const html = e.clipboardData?.getData('text/html'), plain = e.clipboardData?.getData('text/plain') || '';
            let delta;
            if ((html?.length || plain.length) > 200000) {
                error.textContent = '粘贴内容过长，请分段粘贴。';
                error.hidden = false;
                return;
            }
            try {
                if (html) {
                    const inert = root.document.createElement('template');
                    inert.innerHTML = html;
                    delta = fromDOM(inert.content, { template: false, maxChars: 100000 });
                }
                else
                    delta = R.normalizeDelta({ ops: [{ insert: plain + '\n' }] }, { maxChars: 100000 });
            }
            catch (ex) {
                error.textContent = ex.message || '无法读取粘贴内容，请使用纯文本粘贴。';
                error.hidden = false;
                return;
            }
            const r = focusRange();
            r.deleteContents();
            const wrap = U.el('div');
            wrap.append(render(delta, { ...options, template: false, maxChars: 100000 }));
            const fragment = root.document.createDocumentFragment();
            while (wrap.firstChild)
                fragment.append(wrap.firstChild);
            const last = fragment.lastChild;
            r.insertNode(fragment);
            if (last)
                r.setStartAfter(last);
            r.collapse(true);
            range = r.cloneRange();
            focusRange();
            checkpoint();
        });
        const requestClose = async () => {
            if (JSON.stringify(get()) === original || await U.confirm({ title: '放弃富文本修改？', message: '关闭后不保留本次编辑。', confirmText: '放弃修改' }))
                box.close();
        };
        const box = U.panel({ title, subtitle: template ? '插入字段并设置样式，不改变原始数据。' : '修改先回填到报价表单，保存报价后才写入数据。', kind: 'drawer', onRequestClose: requestClose, onClose: () => {
                clearTimeout(timer); lifetime.abort();
                onClose?.();
            } });
        box.element.classList.add('rich-dialog');
        const expand=U.button('展开编辑',()=>{
            const on=box.element.classList.toggle('is-expanded');expand.setAttribute('aria-pressed',String(on));expand.textContent=on?'退出展开':'展开编辑';
        },{tone:'text',id:'rich-expand'});expand.setAttribute('aria-pressed','false');
        const header=box.element.querySelector('.dialog-header'),closeButton=header.lastElementChild;
        const headActions=U.el('div',{class:'rich-header-actions'},expand);if(closeButton?.tagName==='BUTTON')headActions.append(closeButton);header.append(headActions);

        box.body.append(toolbar, selectionStatus, editor, error, U.el('div', { class: 'rich-editor-footer' }, counter, U.el('span', { class: 'small-note' }, template ? '回填后，应用表格设置才生效。' : '回填后，仍需保存报价。')));
        box.footer.append(U.button('取消', () => box.close()), U.button(template ? '使用此模板' : '回填备注', async () => {
            if (currentLength() > maxChars) {
                error.textContent = `内容不能超过 ${maxChars} 个字符。`;
                error.hidden = false;
                return;
            }
            try {
                checkpoint();
                await onSave?.(get());
                box.close();
            }
            catch (e) {
                error.textContent = e.message || '内容保存失败，请检查后重试。';
                error.hidden = false;
            }
        }, { tone: 'primary', id: 'rich-save' }));
        restore(saved);
        box.open();
        setTimeout(() => editor.focus(), 0);
        return box;
    }
    function renderCell(row, col, columns) {
        if (col.template?.enabled) {
            const div = U.el('div', { class: `rich-display cell-template wrap-${col.wrap}` });
            div.append(render(col.template.document, { template: true, resolver: key => {
                    const target = columns.find(c => c.key === key) || { key, emptyText: '—' };
                    if (target.mapping?.enabled)
                        return mappedNode(row[key], target);
                    return U.el('span', {}, X.formatValue(row, { ...target, template: { enabled: false } }));
                } }));
            return div;
        }
        if (col.mapping?.enabled)
            return mappedNode(row[col.key], col);
        return null;
    }
    function mappedNode(value, col) {
        const m = R.normalizeMapping(col.mapping), entry = R.resolveMapping(value, m), label = R.mappedText(value, m, String(value ?? ''));
        const n = U.el('span', { class: `mapped-value mapped-${m.presentation}`, title: `原始值：${value ?? '空'}` }, m.presentation === 'dot' ? U.el('span', { class: 'mapping-dot' }) : null, entry?.icon ? U.icon(entry.icon) : null, label);
        if (entry) {
            n.style.color = entry.color;
            if (m.presentation === 'tag') {
                n.style.backgroundColor = entry.background;
                n.style.borderColor = entry.border || entry.background;
            }
        }
        return n;
    }
    root.QuoteRichText = Object.freeze({ render, renderCell, mappedNode, fromDOM, plainDelta, open });
})(globalThis);
