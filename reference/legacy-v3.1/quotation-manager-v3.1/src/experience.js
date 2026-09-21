/* 3.1 展示层辅助：摘要、定位和小型控件。绝不迁移/覆写业务数据。 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.QuoteExperience = api;
})(globalThis, function (root) {
    'use strict';
    const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
    function changes(before, after) {
        const out = [], add = (label, tab, key, field, section) => out.push({ label, tab, key, field, section });
        if (!same(before.columns.map(c=>c.key), after.columns.map(c=>c.key))) add('列顺序','columns');
        const fields = [['label','显示名称','setting-column-label'],['width','列宽','setting-column-width'],['visible','显示状态','setting-column-visible'],['pin','冻结位置'],['sortable','排序开关','setting-column-sortable'],['header','表头文字'],['body','单元格文字'],['wrap','换行方式','setting-wrap'],['emptyText','空值文字','setting-empty'],['description','表头说明','setting-description'],['copyable','复制入口','setting-copyable'],['showCustomer','客户副标题','setting-show-customer'],['decimals','小数位','setting-decimals'],['thousands','千分位','setting-thousands'],['dateFormat','日期格式','setting-date-format'],['filter','列筛选',null,'section-filter'],['mapping','值映射',null,'section-mapping'],['number','数字格式',null,'section-number'],['template','显示模板',null,'section-template']];
        for (const c of after.columns) {
            const old = before.columns.find(x=>x.key===c.key) || {};
            for (const [prop,label,field,section] of fields) if(!same(old[prop],c[prop])) add(`${c.label || old.label} · ${label}`,'columns',c.key,field,section);
        }
        for (const [prop,label,tab] of [['sorts','排序规则','sorts'],['actions','操作按钮','actions'],['toolbar','工具栏布局','toolbar'],['appearance','表格外观','appearance'],['density','行高','appearance'],['pageSize','每页条数','appearance'],['marks','条件标记','columns']])
            if (!same(before[prop],after[prop])) add(label,tab);
        return out;
    }
    function numberSummary(c) {
        const n=c.number;
        if(!n?.enabled) return c.key==='amountCents' ? `原有格式 · ${c.decimals} 位小数${c.thousands?' · 千分位':''}` : '跟随字段';
        return `${({decimal:'普通数字',currency:'金额',percent:'百分比'})[n.mode]} · ${n.minDigits===n.maxDigits?'固定 '+n.maxDigits:'最多 '+n.maxDigits} 位小数${n.mode==='percent'?' · '+(n.percentBase==='ratio'?'比例值':'百分数'):Number(n.scale)!==1?' · ÷'+Number(n.scale).toLocaleString('zh-CN'):''}`;
    }
    function summary(c,id) {
        if(id==='section-filter') return c.filter?.enabled ? `${({text:'文本',number:'数字区间',date:'日期',single:'单选',multi:'多选'})[c.filter.type]||'列筛选'} · ${c.filter.operators?.length||0} 种条件` : '已关闭 · 不影响顶部查询';
        if(id==='section-mapping') return c.mapping?.enabled ? `${c.mapping.items.length} 条映射 · ${({tag:'标签',dot:'圆点与文字',text:'普通文字'})[c.mapping.presentation]}` : '未启用 · 显示原字段';
        if(id==='section-number') return numberSummary(c);
        if(id==='section-template') return c.template?.enabled ? '已启用 · 仅改变显示' : '未启用 · 使用字段默认排版';
        if(id==='section-trial') return '输入原始值，核对显示与导出';
        return '';
    }
    const uiKey='quotation-demo:experience:v1';
    function preferences() { try { const s=JSON.parse(root.localStorage.getItem(uiKey)||'{}'); return { previewMode:s.previewMode==='table'?'table':'object', collapsed:!!s.collapsed }; } catch {return {previewMode:'object',collapsed:false};} }
    function savePreferences(value) { try {root.localStorage.setItem(uiKey,JSON.stringify(value));} catch { /* 视图体验记忆失败不影响报价/设置保存。 */ } }
    function segmented(select, label, icons = false) {
        const U=root.QuoteUI, wrap=U.el('div',{class:'segmented-field'}), group=U.el('div',{class:'segmented',role:'group','aria-label':label});
        const alignPaths={left:'M3 5h18M3 10h12M3 15h18M3 20h12',center:'M3 5h18M6 10h12M3 15h18M6 20h12',right:'M3 5h18M9 10h12M3 15h18M9 20h12'};
        select.classList.add('control-model'); select.tabIndex=-1;select.setAttribute('aria-hidden','true');
        function sync(){ [...group.children].forEach(b=>{const on=b.dataset.value===select.value;b.setAttribute('aria-pressed',String(on));b.tabIndex=on?0:-1;}); }
        for(const option of select.options){
            const b=U.button(option.textContent,()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();},{title:option.textContent});
            b.dataset.value=option.value;b.dataset.for=select.id;b.setAttribute('aria-label',option.textContent);
            if(icons && alignPaths[option.value]){
                const svg=root.document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','icon');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('aria-hidden','true');
                const path=root.document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',alignPaths[option.value]);svg.append(path);b.replaceChildren(svg);
            } else if(icons && option.value==='') b.textContent='默认';
            b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const bs=[...group.children],i=bs.indexOf(b),next=e.key==='Home'?0:e.key==='End'?bs.length-1:(i+(e.key==='ArrowRight'?1:bs.length-1))%bs.length;bs[next].click();bs[next].focus();});
            group.append(b);
        }
        select.addEventListener('change',sync);wrap.append(select,group);sync();return wrap;
    }
    // 原生字体 select 保留；搜索是额外选择途径，关闭搜索后焦点回到原控件。
    function fontSearch(select) {
        const U=root.QuoteUI, wrap=U.el('div',{class:'font-select-control'},select);
        const find=U.iconButton('search','查找字体',()=>{
            const box=U.panel({title:'选择字体',subtitle:'搜索名称，未安装的字体使用系统后备字体。'});box.element.classList.add('font-search-dialog');
            const q=U.el('input',{type:'search',placeholder:'输入字体名称','aria-label':'搜索字体',autofocus:true}),list=U.el('div',{class:'font-search-options',role:'listbox','aria-label':'字体'});
            function paint(){list.replaceChildren();for(const o of select.options){if(!o.textContent.toLowerCase().includes(q.value.trim().toLowerCase()))continue;const b=U.button(o.textContent,()=>{select.value=o.value;select.dispatchEvent(new Event('change',{bubbles:true}));box.close();select.focus({preventScroll:true});},{tone:'text'});b.setAttribute('role','option');b.setAttribute('aria-selected',String(o.value===select.value));list.append(b);}if(!list.children.length)list.append(U.el('p',{class:'small-note'},'没有匹配的字体'));}
            q.addEventListener('input',paint);q.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('button')?.focus();}});
            list.addEventListener('keydown',e=>{const b=[...list.querySelectorAll('button')],i=b.indexOf(root.document.activeElement);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();b[(i+(e.key==='ArrowDown'?1:b.length-1))%b.length]?.focus();}});
            box.body.append(q,list);box.footer.append(U.button('取消',()=>box.close()));paint();box.open();
        });wrap.append(find);return wrap;
    }
    function palette(onChoose) {
        const U=root.QuoteUI,details=U.el('details',{class:'color-presets'}),grid=U.el('div',{class:'color-preset-grid'});
        for(const [name,color] of [['深灰','#334155'],['深蓝','#2468e8'],['绿色','#167457'],['橙色','#9a5713'],['红色','#be3544'],['浅蓝','#edf4ff'],['浅灰','#f1f5f9'],['白色','#ffffff']]){
            const b=U.button('',()=>{onChoose(color);details.open=false;details.querySelector('summary').focus({preventScroll:true});},{title:name+' '+color});b.style.backgroundColor=color;b.setAttribute('aria-label','使用'+name+(name.endsWith('色')?'':'色'));grid.append(b);
        }
        details.append(U.el('summary',{'aria-label':'常用颜色',title:'常用颜色'},'色板'),grid);
        details.addEventListener('keydown',e=>{if(e.key==='Escape'&&details.open){e.stopPropagation();e.preventDefault();details.open=false;details.querySelector('summary').focus();}});
        return details;
    }
    function enhanceControls(host) {
        for(const s of host.querySelectorAll('select')) {
            if(s.closest('.segmented-field,.font-select-control'))continue;
            if(['setting-header-align','setting-body-align','setting-action-align'].includes(s.id)){
                const label=s.closest('.field')?.querySelector('label')?.textContent||'对齐方式';const holder=root.document.createElement('span');s.replaceWith(holder);holder.replaceWith(segmented(s,label,true));
            } else if(/family$/.test(s.id)) { const holder=root.document.createElement('span');s.replaceWith(holder);holder.replaceWith(fontSearch(s)); }
        }
    }
    function reveal(node) {
        if(!node)return;
        for(let n=node.parentElement;n;n=n.parentElement) if(n.tagName==='DETAILS') n.open=true;
        node.scrollIntoView({block:'nearest'});node.focus?.({preventScroll:true});
    }
    return Object.freeze({changes,numberSummary,summary,preferences,savePreferences,segmented,fontSearch,palette,enhanceControls,reveal});
});
