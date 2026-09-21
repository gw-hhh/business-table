/* 保留原按钮节点及事件，在原有工具栏内增量排列；更多项执行原操作。 */
(function (root) {
    'use strict';
    const R = root.QuoteRules, U = root.QuoteUI, Menu = root.QuoteMenus;
    class Toolbar {
        constructor() {
            this.config = null;
            this.serial = '';
            this.items = new Map();
            this.groups = [];
            for (const [area, selector] of [['header', '.header-actions'], ['table', '.table-tools']]) {
                const host = document.querySelector(selector);
                if (!host)
                    continue;
                const original = [...host.children];
                const more = U.iconButton('more', area === 'header' ? '更多页面工具' : '更多表格工具', () => this.openMore(area), { className: 'icon-btn toolbar-overflow', id: `toolbar-overflow-${area}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false', hidden: true });
                host.append(more);
                this.groups.push({ area, host, more, original });
                for (const t of R.TOOLS.filter(t => t.area === area)) {
                    const node = document.getElementById(t.id);
                    if (node)
                        this.items.set(t.id, { node, original: [...node.childNodes].map(n => n.cloneNode(true)), className: node.className, default: t });
                }
                const observer = new ResizeObserver(() => {
                    cancelAnimationFrame(this.frame);
                    this.frame = requestAnimationFrame(() => this.fit());
                });
                observer.observe(host);
            }
        }
        apply(raw) {
            const config = R.normalizeToolbar(raw), serial = JSON.stringify(config);
            this.config = config;
            if (serial !== this.serial) {
                for (const group of this.groups) {
                    const { host, more } = group;
                    host.querySelectorAll(':scope > .toolbar-divider').forEach(n => n.remove());
                    for (const item of config.items.filter(i => i.area === group.area)) {
                        const saved = this.items.get(item.id);
                        if (!saved)
                            continue;
                        const { node } = saved;
                        const isDefault = item.label === saved.default.label && item.mode === saved.default.mode;
                        node.replaceChildren(...(isDefault ? saved.original.map(n => n.cloneNode(true)) : [item.mode !== 'text' ? U.icon(item.icon) : null, item.mode !== 'icon' ? document.createTextNode(item.label) : null].filter(Boolean)));
                        node.classList.toggle('icon-btn', item.mode === 'icon');
                        node.classList.toggle('configured-tool', !isDefault);
                        node.title = item.label;
                        node.setAttribute('aria-label', item.label);
                        node.style.borderLeft = item.divider ? '1px solid #cbd5e1' : '';
                        node._toolbarAnchor = more;
                        host.insertBefore(node, more);
                    }
                    host.style.gap = config.gap + 'px';
                }
                this.serial = serial;
            }
            this.fit();
        }
        fit() {
            if (!this.config)
                return;
            for (const g of this.groups) {
                const items = this.config.items.filter(i => i.area === g.area), overflow = [];
                for (const item of items) {
                    const e = this.items.get(item.id)?.node;
                    if (!e)
                        continue;
                    e.hidden = item.placement !== 'inline';
                    if (item.placement === 'more')
                        overflow.push(item);
                }
                g.more.hidden = overflow.length === 0;
                const available = g.host.clientWidth;
                let used = () => [...g.host.children].filter(n => !n.hidden && n.offsetWidth).reduce((n, e) => n + e.getBoundingClientRect().width, 0) + Math.max(0, [...g.host.children].filter(n => !n.hidden && n.offsetWidth).length - 1) * this.config.gap;
                for (const item of items.slice().reverse()) {
                    if (used() <= available + 1)
                        break;
                    if (item.fixed || item.placement !== 'inline')
                        continue;
                    const node = this.items.get(item.id)?.node;
                    if (!node)
                        continue;
                    node.hidden = true;
                    overflow.unshift(item);
                    g.more.hidden = false;
                }
                g.overflow = items.filter(i => overflow.some(x => x.id === i.id));
                g.more.hidden = g.overflow.length === 0;
            }
        }
        openMore(area) {
            const g = this.groups.find(g => g.area === area);
            if (!g?.overflow.length)
                return;
            Menu.open(g.more, g.overflow.map(i => ({ label: i.label, icon: i.icon, disabled: this.items.get(i.id)?.node.disabled, onSelect: () => {
                    this.items.get(i.id)?.node.click();
                } })), area === 'header' ? '更多页面工具' : '更多表格工具');
        }
    }
    root.QuoteToolbar = Toolbar;
})(globalThis);
