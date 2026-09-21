/* 两级操作菜单。浮层挂载在表格外，键盘焦点和生命周期集中管理。 */
(function (root) {
    'use strict';
    const U = root.QuoteUI;
    let levels = [], controller = null, origin = null, sequence = 0;
    const buttons = panel => [...panel.querySelectorAll(':scope > button[role="menuitem"]:not(:disabled)')];
    function truncate(depth) {
        while (levels.length > depth) {
            const item = levels.pop();
            item.anchor?.setAttribute('aria-expanded', 'false');
            item.panel.remove();
        }
    }
    function close(restore = true) {
        const anchor = origin;
        truncate(0);
        controller?.abort();
        controller = null;
        origin = null;
        if (restore && anchor?.isConnected)
            (anchor.hidden && anchor._toolbarAnchor ? anchor._toolbarAnchor : anchor).focus({ preventScroll: true });
    }
    function position(level) {
        if (!level.anchor.isConnected) {
            close(false);
            return;
        }
        const r = (level.anchor.hidden && level.anchor._toolbarAnchor ? level.anchor._toolbarAnchor : level.anchor).getBoundingClientRect(), p = level.panel, b = p.getBoundingClientRect();
        let x = level.depth ? r.right + 5 : r.right - b.width;
        if (x + b.width > innerWidth - 8)
            x = level.depth ? r.left - b.width - 5 : innerWidth - b.width - 8;
        p.style.left = `${Math.max(8, x)}px`;
        p.style.top = `${Math.max(8, Math.min(level.depth ? r.top : r.bottom + 6, innerHeight - b.height - 8))}px`;
    }
    function openLevel(anchor, items, depth, label) {
        truncate(depth);
        const panel = U.el('div', { id: `q-menu-${++sequence}`, class: 'q-menu', role: 'menu', 'aria-label': label, style: { maxHeight: `${innerHeight - 20}px` }, dataset: { menuDepth: String(depth) } });
        for (const item of items) {
            if (item.separator) {
                panel.append(U.el('div', { class: 'q-menu-separator', role: 'separator' }));
                continue;
            }
            const children = item.children?.filter(v => !v.hidden);
            const button = U.el('button', { type: 'button', role: 'menuitem', tabindex: '-1', class: `q-menu-item${item.danger ? ' danger' : ''}`, disabled: !!item.disabled,
                'aria-label': item.label, dataset: item.id ? { menuAction: item.id } : {}, title: item.title || item.label,
                onclick: () => {
                    if (children?.length) {
                        openLevel(button, children, depth + 1, item.label);
                        return;
                    }
                    close(true);
                    item.onSelect?.();
                } }, item.icon ? U.icon(item.icon) : null, U.el('span', {}, item.label), children?.length ? U.icon('right', 'submenu-arrow') : null);
            if (children?.length) {
                button.setAttribute('aria-haspopup', 'menu');
                button.setAttribute('aria-expanded', 'false');
                button._openChild = () => openLevel(button, children, depth + 1, item.label);
            }
            panel.append(button);
        }
        const host = anchor.closest('dialog[open]') || document.body;
        host.append(panel);
        const level = { panel, anchor, depth };
        levels.push(level);
        anchor.setAttribute('aria-expanded', 'true');
        anchor.setAttribute('aria-controls', panel.id);
        position(level);
        buttons(panel)[0]?.focus({ preventScroll: true });
    }
    function open(anchor, items, label = '操作菜单') {
        if (origin === anchor) {
            close(true);
            return;
        }
        close(false);
        origin = anchor;
        controller = new AbortController();
        const signal = controller.signal;
        openLevel(anchor, items, 0, label);
        document.addEventListener('pointerdown', e => {
            if (!levels.some(l => l.panel.contains(e.target)) && !origin?.contains(e.target))
                close(false);
        }, { capture: true, signal });
        document.addEventListener('keydown', e => {
            const index = levels.findIndex(l => l.panel.contains(e.target));
            if (index < 0)
                return;
            const level = levels[index], list = buttons(level.panel), active = list.indexOf(document.activeElement);
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                truncate(index + 1);
                const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (active + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
                list[next]?.focus();
            }
            else if (e.key === 'ArrowRight') {
                e.preventDefault();
                e.stopImmediatePropagation();
                document.activeElement?._openChild?.();
            }
            else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (index > 0) {
                    const a = level.anchor;
                    truncate(index);
                    a.focus();
                }
                else
                    close(true);
            }
            else if (e.key === 'Tab')
                close(true);
        }, { capture: true, signal });
        window.addEventListener('resize', () => levels.forEach(position), { signal });
        // 浏览器可能在点击前滚动到锚点，scroll 事件却在菜单打开后才派发。
        // 仅在锚点的滚动祖先确实改变位置时关闭，避免末行菜单一闪而过。
        const ancestors = new Set([document.scrollingElement]);
        for (let node = anchor.parentElement; node; node = node.parentElement)
            ancestors.add(node);
        const positions = [...ancestors].filter(Boolean).map(node => ({ node, top: node.scrollTop, left: node.scrollLeft }));
        window.addEventListener('scroll', e => {
            if (levels.some(l => l.panel.contains(e.target)))
                return;
            if (positions.some(({ node, top, left }) => node.scrollTop !== top || node.scrollLeft !== left))
                close(false);
        }, { capture: true, signal });
    }
    root.QuoteMenus = Object.freeze({ open, close, closeFor: element => {
            if (origin && element.contains(origin))
                close(false);
        } });
})(globalThis);
