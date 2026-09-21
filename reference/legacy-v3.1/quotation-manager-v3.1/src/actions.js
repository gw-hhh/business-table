/* 已注册行操作的显示层。配置只控制位置，不代表服务端操作权限。 */
(function (root) {
    'use strict';
    const U = root.QuoteUI, X = root.QuoteCustomization, Menu = root.QuoteMenus;
    function menuItems(items, config, row, onAction) {
        const list = config.groups ? [...items].sort((a, b) => ['common', 'export', 'danger'].indexOf(a.group) - ['common', 'export', 'danger'].indexOf(b.group)) : items;
        let previous = '', output = [];
        list.forEach((a, i) => {
            if (i && (a.divider || a.danger || (config.groups && a.group !== previous)))
                output.push({ separator: true });
            previous = a.group;
            output.push({ id: a.id, label: a.label, icon: a.icon, danger: a.danger,
                children: a.id === 'export' ? a.children.filter(c => c.visible).map(c => ({ id: `export-${c.id}`, label: c.label, icon: 'download', onSelect: () => onAction('export', row.id, { format: c.id }) })) : undefined,
                onSelect: () => onAction(a.id, row.id) });
        });
        return output;
    }
    function render(row, raw, onAction, { preview = false, interactivePreview = false } = {}) {
        const config = X.normalizeActions(raw), items = config.items.filter(a => a.placement !== 'hidden');
        let inline = items.filter(a => a.placement === 'inline').slice(0, config.maxInline);
        let overflow = items.filter(a => !inline.includes(a));
        const container = U.el('div', { class: 'row-actions custom-actions', style: { gap: `${config.gap}px`, justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[config.align] } });
        const make = a => {
            const mode = a.mode || config.mode;
            const button = U.el('button', { type: 'button', class: `text-link action-button${a.danger ? ' text-danger' : ''}${mode === 'icon' ? ' action-icon' : ''}`, title: a.label,
                'aria-label': `${a.label} ${row.id}`, dataset: { tableAction: a.id, id: row.id, focus: `action-${a.id}-${row.id}` },
                onclick: e => {
                    e.stopPropagation();
                    if (preview && !interactivePreview)
                        return;
                    if (a.id === 'export')
                        Menu.open(button, menuItems([a], config, row, onAction)[0].children, '导出本条');
                    else
                        onAction(a.id, row.id);
                } }, mode !== 'text' ? U.icon(a.icon) : null, mode !== 'icon' ? U.el('span', {}, a.label) : null, a.id === 'export' && mode !== 'icon' ? U.icon('down') : null);
            if (a.id === 'export') {
                button.setAttribute('aria-haspopup', 'menu');
                button.setAttribute('aria-expanded', 'false');
            }
            return button;
        };
        let nodes = inline.map(make);
        const more = U.el('button', { type: 'button', class: 'text-link more-trigger', title: '更多操作', 'aria-label': `更多操作 ${row.id}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
            dataset: { focus: `more-${row.id}`, rowMore: row.id }, onclick: e => {
                e.stopPropagation();
                if (!preview || interactivePreview)
                    Menu.open(more, menuItems(overflow, config, row, onAction), '报价操作');
            } }, '更多', U.icon('down'));
        const paint = () => {
            more.hidden = !overflow.length;
            container.replaceChildren(...nodes, more);
        };
        paint();
        function fit() {
            // 使用真实 DOM 宽度，而不是字符数估算，支持字体/字号变化。
            if (!container.isConnected || container.clientWidth === 0)
                return;
            while (nodes.length && container.scrollWidth > container.clientWidth + 1) {
                nodes.pop();
                overflow.unshift(inline.pop());
                paint();
            }
        }
        return { element: container, fit };
    }
    root.QuoteActions = Object.freeze({ render, menuItems });
})(globalThis);
