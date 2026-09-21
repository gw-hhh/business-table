/* DOM 与通用交互组件。业务字符串只通过 textContent/value 输出。 */
(function (root) {
    'use strict';
    let sequence = 0;
    function el(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs)) {
            if (value === undefined || value === null)
                continue;
            if (key === 'class')
                node.className = value;
            else if (key === 'dataset')
                Object.assign(node.dataset, value);
            else if (key === 'style')
                Object.assign(node.style, value);
            else if (key.startsWith('on') && typeof value === 'function')
                node.addEventListener(key.slice(2).toLowerCase(), value);
            else if (['checked', 'disabled', 'hidden', 'indeterminate', 'autofocus', 'selected', 'readOnly'].includes(key))
                node[key] = Boolean(value);
            else if (key === 'value')
                node.value = value;
            else
                node.setAttribute(key, String(value));
        }
        for (const child of children.flat(Infinity)) {
            if (child !== null && child !== undefined && child !== false)
                node.append(child instanceof Node ? child : document.createTextNode(String(child)));
        }
        return node;
    }
    const paths = Object.freeze({
        settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
        undo: 'M9 4 4 9l5 5M4 9h9a7 7 0 0 1 7 7v4', redo: 'm15 4 5 5-5 5m5-5h-9a7 7 0 0 0-7 7v4',
        plus: 'M12 5v14M5 12h14', search: 'm21 21-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
        down: 'm6 9 6 6 6-6', up: 'm6 15 6-6 6 6', left: 'm15 6-6 6 6 6', right: 'm9 6 6 6-6 6',
        close: 'm6 6 12 12M6 18 18 6', check: 'm5 12 4 4L19 6',
        download: 'M12 3v12m-5-5 5 5 5-5M5 15v5h14v-5', upload: 'M12 16V4m-5 5 5-5 5 5M5 16v4h14v-4',
        refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11-2l3 3M4 16l3 3a7 7 0 0 0 11-2',
        bookmark: 'M6 3h12v18l-6-4-6 4V3Z', columns: 'M3 4h18v16H3V4Zm6 0v16m6-16v16',
        rows: 'M4 5h16M4 12h16M4 19h16', more: 'M5 12h.01M12 12h.01M19 12h.01',
        edit: 'm15 5 4 4M4 20l4-1 12-12-4-4L4 15v5Z', trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
        info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
        warn: 'm12 3 10 18H2L12 3Zm0 6v5m0 3h.01',
        file: 'M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h6',
        batch: 'M4 4h5v5H4V4Zm0 11h5v5H4v-5Zm9-9h7m-7 12h7',
        copy: 'M8 8h13v13H8V8Zm8-4V2H2v14h2', star: 'm12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.3-.9L12 3Z',
        grip: 'M9 4h.01M15 4h.01M9 12h.01M15 12h.01M9 20h.01M15 20h.01',
        pinLeft: 'M160 160v704h704V160H160zm128 640V224h128v576H288z',
        pinRight: 'M864 160v704H160V160h704zm-128 640V224H608v576h128z',
        sort: 'm8 4-3 3m3-3 3 3M8 4v16m8 0-3-3m3 3 3-3m-3 3V4',
        filter: 'M3 4h18l-7 8v7l-4 2v-9L3 4Z', arrowUp: 'm6 10 6-6 6 6m-6-6v16', arrowDown: 'm6 14 6 6 6-6m-6 6V4',
        folder: 'M3 6h6l2 3h10v12H3V6Z', save: 'M4 3h13l4 4v14H3V3Zm3 0v6h10V3M7 21v-8h10v8'
    });
    function icon(name, className = '') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        // 左右冻结沿用参考稿的实心图标，其余图标仍使用原描边样式。
        const filled = name === 'pinLeft' || name === 'pinRight';
        svg.setAttribute('viewBox', filled ? '0 0 1024 1024' : '0 0 24 24');
        svg.setAttribute('class', `icon ${className}`);
        svg.setAttribute('fill', filled ? 'currentColor' : 'none');
        svg.setAttribute('stroke', filled ? 'none' : 'currentColor');
        svg.setAttribute('stroke-width', name === 'more' || name === 'grip' ? '3' : '1.7');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', paths[name] || paths.file);
        svg.append(path);
        return svg;
    }
    function button(label, handler, { tone = '', icon: iconName, className = '', ...attrs } = {}) {
        return el('button', { type: 'button', class: `btn ${tone ? 'btn-' + tone : ''} ${className}`.trim(), onclick: handler, ...attrs }, iconName ? icon(iconName) : null, label);
    }
    function iconButton(name, label, handler, attrs = {}) {
        return button('', handler, { icon: name, className: 'icon-btn', 'aria-label': label, title: label, ...attrs });
    }
    function field(label, control, { required = false, hint = '', wide = false } = {}) {
        control.id ||= `field-${++sequence}`;
        return el('div', { class: `field ${wide ? 'field-wide' : ''}` }, el('label', { for: control.id }, required ? el('span', { class: 'required', 'aria-hidden': 'true' }, '*') : null, label), control, hint ? el('small', { class: 'field-hint' }, hint) : null);
    }
    function options(select, values, blankLabel) {
        const previous = select.value;
        const nodes = blankLabel !== undefined ? [el('option', { value: '' }, blankLabel)] : [];
        for (const item of values) {
            const value = typeof item === 'string' ? item : item.value;
            const label = typeof item === 'string' ? item : item.label;
            nodes.push(el('option', { value }, label));
        }
        select.replaceChildren(...nodes);
        select.value = [...select.options].some(option => option.value === previous) ? previous : select.options[0]?.value || '';
        return select;
    }
    class Notices {
        constructor(host) {
            this.host = host;
        }
        show(message, tone = 'success') {
            const item = el('div', { class: `toast toast-${tone}`, role: tone === 'error' ? 'alert' : 'status' }, icon(tone === 'success' ? 'check' : tone === 'error' ? 'warn' : 'info'), el('span', {}, message));
            const close = iconButton('close', '关闭提示', () => item.remove());
            item.append(close);
            while (this.host.children.length >= 3)
                this.host.firstChild.remove();
            this.host.append(item);
            const timer = setTimeout(() => item.remove(), tone === 'error' ? 8000 : 4500);
            item.addEventListener('mouseenter', () => clearTimeout(timer), { once: true });
        }
    }
    /** 原生顶层 dialog 负责背景 inert；补充 Tab 循环，避免焦点落到浏览器界面。 */
    function panel({ title, subtitle = '', kind = 'modal', onRequestClose, onClose } = {}) {
        const before = document.activeElement;
        const titleId = `dialog-title-${++sequence}`;
        const body = el('div', { class: 'dialog-body' });
        const footer = el('div', { class: 'dialog-footer' });
        const dialog = el('dialog', { class: `dialog ${kind}`, 'aria-labelledby': titleId });
        let opened = false;
        let closed = false;
        let api;
        const requestClose = () => onRequestClose ? onRequestClose(api) : api.close();
        const header = el('div', { class: 'dialog-header' }, el('div', {}, el('h2', { id: titleId }, title), subtitle ? el('p', { class: 'dialog-subtitle' }, subtitle) : null), iconButton('close', '关闭窗口', requestClose));
        dialog.append(el('div', { class: 'dialog-layout' }, header, body, footer));
        dialog.addEventListener('cancel', event => {
            event.preventDefault();
            requestClose();
        });
        dialog.addEventListener('keydown', event => {
            if (event.key !== 'Tab')
                return;
            const focusable = [...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex],[contenteditable="true"]')]
                .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
            if (!focusable.length) {
                event.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
            else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
        dialog.addEventListener('click', event => {
            if (event.target !== dialog)
                return;
            const rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
                requestClose();
        });
        api = {
            element: dialog, body, footer,
            open() {
                if (opened || closed)
                    return;
                opened = true;
                document.body.append(dialog);
                dialog.showModal();
                queueMicrotask(() => {
                    const target = dialog.querySelector('[autofocus]') || body.querySelector('input:not([readonly]),select,textarea') || footer.querySelector('button') || header.querySelector('button');
                    target?.focus();
                });
            },
            close() {
                if (closed)
                    return;
                closed = true;
                if (dialog.open)
                    dialog.close();
                dialog.remove();
                if (before?.isConnected && !before.closest('[inert]'))
                    before.focus({ preventScroll: true });
                onClose?.();
            },
            requestClose
        };
        return api;
    }
    function confirm({ title = '确认操作', message, confirmText = '确定', danger = false } = {}) {
        return new Promise(resolve => {
            let resolved = false;
            const finish = value => {
                if (resolved)
                    return;
                resolved = true;
                resolve(value);
                box.close();
            };
            const box = panel({ title, onRequestClose: () => finish(false) });
            box.body.append(el('div', { class: `confirm-message ${danger ? 'danger-message' : ''}` }, icon(danger ? 'warn' : 'info'), el('p', {}, message)));
            box.footer.append(button('取消', () => finish(false), { autofocus: true }), button(confirmText, () => finish(true), { tone: danger ? 'danger' : 'primary' }));
            box.open();
        });
    }
    class Popover {
        constructor() {
            this.element = null;
            this.anchor = null;
            this.name = '';
            document.addEventListener('pointerdown', event => {
                if (this.element && !this.element.contains(event.target) && !this.anchor?.contains(event.target))
                    this.close();
            });
            document.addEventListener('keydown', event => {
                if (!this.element)
                    return;
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    this.close(true);
                }
                if (['ArrowDown', 'ArrowUp'].includes(event.key) && !['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) {
                    const items = [...this.element.querySelectorAll('.menu-option:not(:disabled)')];
                    if (!items.length)
                        return;
                    event.preventDefault();
                    const index = items.indexOf(document.activeElement);
                    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
                }
            });
            window.addEventListener('resize', () => this.position());
            window.addEventListener('scroll', event => {
                if (this.element && !this.element.contains(event.target))
                    this.position();
            }, true);
        }
        open(name, anchor, content, width = 360) {
            if (this.name === name) {
                this.close(true);
                return false;
            }
            this.close();
            this.anchor = anchor;
            this.name = name;
            this.width = width;
            this.element = el('section', { class: 'popover', role: 'dialog', 'aria-label': anchor.getAttribute('aria-label') || '设置' }, content);
            document.body.append(this.element);
            anchor.setAttribute('aria-expanded', 'true');
            anchor.classList.add('is-active');
            this.position();
            this.element.querySelector('button:not(:disabled),input:not(:disabled),select')?.focus({ preventScroll: true });
            return true;
        }
        replace(content) {
            if (!this.element)
                return;
            const key = document.activeElement?.dataset.focus;
            this.element.replaceChildren(content);
            this.position();
            if (key)
                this.element.querySelector(`[data-focus="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
        }
        position() {
            if (!this.element || !this.anchor?.isConnected)
                return;
            const rect = (this.anchor.hidden && this.anchor._toolbarAnchor ? this.anchor._toolbarAnchor : this.anchor).getBoundingClientRect();
            const width = Math.min(this.width, window.innerWidth - 24);
            this.element.style.width = `${width}px`;
            this.element.style.maxHeight = `${Math.max(100, window.innerHeight - 24)}px`;
            const height = this.element.getBoundingClientRect().height;
            this.element.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`;
            this.element.style.top = `${Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - height - 12))}px`;
        }
        close(restoreFocus = false) {
            this.element?.remove();
            this.element = null;
            this.name = '';
            if (this.anchor) {
                this.anchor.setAttribute('aria-expanded', 'false');
                this.anchor.classList.remove('is-active');
                if (restoreFocus && this.anchor.isConnected)
                    (this.anchor.hidden && this.anchor._toolbarAnchor ? this.anchor._toolbarAnchor : this.anchor).focus({ preventScroll: true });
            }
            this.anchor = null;
        }
    }
    /** 拖动按钮只传递内部 key；同时保留上下移动按钮以支持键盘与触屏。 */
    function draggableList(container, onMove) {
        let dragging = '';
        container.addEventListener('dragstart', event => {
            const handle = event.target.closest('[data-drag]');
            if (!handle) {
                event.preventDefault();
                return;
            }
            dragging = handle.dataset.drag;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', dragging);
            handle.closest('[data-row-key]')?.classList.add('is-dragging');
        });
        container.addEventListener('dragover', event => {
            const row = event.target.closest('[data-row-key]');
            if (!dragging || !row)
                return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            container.querySelectorAll('.drag-target').forEach(node => node.classList.remove('drag-target'));
            row.classList.add('drag-target');
        });
        container.addEventListener('drop', event => {
            const row = event.target.closest('[data-row-key]');
            if (!dragging || !row)
                return;
            event.preventDefault();
            const from = dragging;
            dragging = '';
            onMove(from, row.dataset.rowKey);
        });
        container.addEventListener('dragend', () => {
            dragging = '';
            container.querySelectorAll('.is-dragging,.drag-target').forEach(node => node.classList.remove('is-dragging', 'drag-target'));
        });
    }
    function download(content, filename, type) {
        const blob = content instanceof Blob ? content : new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const anchor = el('a', { href: url, download: filename, hidden: true });
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    root.QuoteUI = Object.freeze({ el, icon, button, iconButton, field, options, Notices, panel, confirm, Popover, draggableList, download });
})(globalThis);
