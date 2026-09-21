/* 当前对象与整表预览。整表复用 QuoteTable；所有预览操作只使用空回调。 */
(function(root){
'use strict';
const U=root.QuoteUI,C=root.QuoteCore,X=root.QuoteCustomization,R=root.QuoteRules,Rich=root.QuoteRichText,E=root.QuoteExperience;
class Preview {
 constructor(host,get){
  this.host=host;this.get=get;this.prefs=E.preferences();this.sampleId='';this.narrow=false;this.alive=true;
  this.label=U.el('strong',{},'预览');this.hint=U.el('span',{class:'preview-caption'},'仅预览，不执行业务操作');
  this.object=U.button('当前对象',()=>this.setMode('object'),{id:'preview-mode-object'});
  this.table=U.button('整表',()=>this.setMode('table'),{id:'preview-mode-table'});
  this.toggle=U.button('',()=>{this.prefs.collapsed=!this.prefs.collapsed;E.savePreferences(this.prefs);this.update();},{id:'preview-toggle',tone:'text'});
  this.controls=U.el('div',{class:'preview-controls'},U.el('div',{class:'segmented preview-switch',role:'group','aria-label':'预览范围'},this.object,this.table),this.toggle);
  this.body=U.el('div',{id:'settings-preview-content',class:'preview-content'});
  this.host.replaceChildren(U.el('div',{class:'preview-heading'},this.label,this.hint,this.controls),this.body);
  this.toggle.setAttribute('aria-controls','settings-preview-content');
  this.lastWidth=0;this.observer=new ResizeObserver(()=>{const w=host.clientWidth;if(w!==this.lastWidth){this.lastWidth=w;cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.update());}});this.observer.observe(host);
 }
 setMode(mode){this.prefs.previewMode=mode;E.savePreferences(this.prefs);this.update();}
 sample(rows){return rows.find(r=>r.id===this.sampleId)||rows[0]||root.QuoteConfig.SEED_ROWS[0];}
 update(){
  if(!this.alive)return;
  const {draft,rows,tab,key,section,mappingIndex=0,trialValue}=this.get(),s=C.normalizeSnapshot(draft),col=s.columns.find(c=>c.key===key)||s.columns[0],sample=this.sample(rows);
  this.object.setAttribute('aria-pressed',String(this.prefs.previewMode==='object'));this.table.setAttribute('aria-pressed',String(this.prefs.previewMode==='table'));
  this.toggle.textContent=this.prefs.collapsed?'展开预览':'收起预览';this.toggle.setAttribute('aria-expanded',String(!this.prefs.collapsed));this.body.hidden=this.prefs.collapsed;
  this.host.classList.toggle('is-collapsed',this.prefs.collapsed);
  this.label.textContent=this.prefs.previewMode==='table'?'整表预览':tab==='toolbar'?'工具栏预览':tab==='actions'?'操作按钮预览':tab==='columns'?`${col.label} · 预览`:'表格预览';
  if(this.prefs.collapsed)return;
  root.QuoteMenus.closeFor(this.body);
  const scrollLeft=this.body.querySelector('.preview-scroll')?.scrollLeft||0,focusedSample=root.document.activeElement?.classList.contains('preview-sample');
  this.body.replaceChildren();
  if(this.prefs.previewMode==='table'||['sorts','appearance'].includes(tab))this.renderTable(s,sample);
  else if(tab==='toolbar')this.renderToolbar(s);
  else if(tab==='actions')this.renderActions(s,sample);
  else if(section==='section-mapping'&&col.mapping.enabled)this.renderMapping(col,mappingIndex);
  else if(section==='section-number'||section==='section-trial')this.renderNumber(col,sample,trialValue);
  else this.renderTable({...s,columns:s.columns.filter(c=>c.key===key).map(c=>({...c,visible:true}))},sample,true);
  const scroll=this.body.querySelector('.preview-scroll');if(scroll)scroll.scrollLeft=scrollLeft;
  if(tab==='columns'&&!['section-mapping','section-number','section-trial'].includes(section)){
   const picker=U.el('select',{'aria-label':'预览样例',class:'preview-sample',onchange:e=>{this.sampleId=e.target.value;this.update();}});
   for(const row of (rows.length?rows:root.QuoteConfig.SEED_ROWS).slice(0,50))picker.append(U.el('option',{value:row.id},row.id+' · '+row.name));picker.value=sample.id;
   this.body.prepend(U.el('label',{class:'preview-sample-row'},'样例',picker));if(focusedSample)picker.focus({preventScroll:true});
  }
  const low=s.columns.filter(c=>c.visible).filter(c=>['header','body'].some(part=>!['status','id','actions'].includes(c.key)&&X.contrastRatio(X.effectiveStyle(c,s.appearance,part).color,part==='header'?'#f8fafc':'#ffffff')<4.5));
  if(low.length)this.body.append(U.el('p',{class:'contrast-warning'},`文字对比度不足：${low.slice(0,3).map(c=>c.label).join('、')}。可加深颜色；你的设置不会被自动替换。`));
 }
 renderTable(s,sample,single=false){
  const table=U.el('table',{'aria-label':single?'当前列显示预览':'整表显示预览',inert:''}),cols=U.el('colgroup'),head=U.el('tr'),body=U.el('tbody'),viewport=U.el('div',{class:'preview-scroll table-preview-viewport',tabindex:'0','aria-label':'左右滚动查看预览'});
  table.append(cols,U.el('thead',{},head),body);viewport.append(table);this.body.append(viewport);
  const renderer=new root.QuoteTable({table,viewport,cols,head,body,preview:true,onAction:()=>{}});
  renderer.render({...s,items:[sample],selected:new Set(),batchMode:false,page:1,hasAnyRows:true});
  table.classList.add('live-table-preview');
 }
 renderToolbar(s){
  const sizes=U.el('div',{class:'preview-size-options'},U.el('span',{},'检查溢出'),U.button(this.narrow?'窄幅 320px':'随窗口宽度',()=>{this.narrow=!this.narrow;this.update();},{tone:'text',id:'preview-toolbar-width'}));
  this.body.append(sizes);
  const demos=U.el('div',{class:'toolbar-preview-list'});this.body.append(demos);
  for(const [area,title] of [['header','页面工具栏'],['table','表格工具栏']]){
   const host=U.el('div',{class:'toolbar-live-preview',style:{gap:`${s.toolbar.gap}px`,maxWidth:this.narrow?'320px':'100%'}}),items=s.toolbar.items.filter(i=>i.area===area&&i.placement!=='hidden'),nodes=new Map();
   const more=U.iconButton('more','预览更多工具',()=>root.QuoteMenus.open(more,overflow.map(i=>({label:i.label,icon:i.icon,onSelect:()=>this.note('这是工具预览，没有执行操作。')})),title),{'aria-haspopup':'menu','aria-expanded':'false'});let overflow=[];
   for(const i of items){const b=U.button('',()=>this.note(`预览“${i.label}”，没有执行操作。`),{className:i.mode==='icon'?'icon-btn':'',tone:i.id==='create-button'?'primary':'',title:i.label});b.setAttribute('aria-label','预览'+i.label);b.replaceChildren(...(i.mode!=='text'?[U.icon(i.icon)]:[]));if(i.mode!=='icon')b.append(root.document.createTextNode(i.label));if(i.divider)b.style.borderLeft='1px solid #cbd5e1';b.hidden=i.placement==='more';nodes.set(i.id,b);host.append(b);}
   host.append(more);demos.append(U.el('div',{class:'toolbar-preview-line'},U.el('span',{class:'small-note'},title),host));
   const fit=()=>{if(!host.isConnected)return;overflow=items.filter(i=>i.placement==='more');more.hidden=!overflow.length;const used=()=>[...host.children].filter(n=>!n.hidden).reduce((n,e)=>n+e.getBoundingClientRect().width,0)+Math.max(0,[...host.children].filter(n=>!n.hidden).length-1)*s.toolbar.gap;
    for(const item of items.slice().reverse()){if(used()<=host.clientWidth+1)break;if(item.fixed||item.placement!=='inline')continue;nodes.get(item.id).hidden=true;overflow.unshift(item);more.hidden=false;}overflow=items.filter(i=>overflow.some(x=>x.id===i.id));more.hidden=!overflow.length;};
   requestAnimationFrame(fit);
  }
 }
 renderActions(s,sample){
  const width=s.columns.find(c=>c.key==='actions')?.width||230,outer=U.el('div',{class:'action-preview-area'}),cell=U.el('div',{class:'action-preview-cell',style:{width:width+'px',maxWidth:'100%',...X.styleCSS(X.effectiveStyle(s.columns.find(c=>c.key==='actions'),s.appearance))}});
  const view=root.QuoteActions.render(sample,s.actions,()=>this.note('这是按钮预览，没有修改或导出报价。'),{preview:true,interactivePreview:true});
  cell.append(view.element);outer.append(U.el('span',{class:'small-note'},`操作列宽 ${width}px · 可展开“更多”`),cell);this.body.append(outer);requestAnimationFrame(view.fit);
 }
 renderMapping(col,index){
  const m=col.mapping,entries=m.items.map((x,i)=>({label:'原始值 '+x.raw,value:m.type==='number'?Number(x.raw):m.type==='boolean'?x.raw===true||x.raw==='true':x.raw,i}));
  const selected=entries.splice(index,1)[0];if(selected)entries.unshift(selected);
  let unknown=m.type==='number'?-987654321:m.type==='boolean'?undefined:'未配置的值';
  const cases=[...entries.slice(0,4),{label:'空值',value:null},{label:'未匹配',value:unknown}];
  const list=U.el('div',{class:'mapping-preview-cases preview-scroll'});for(const c of cases)list.append(U.el('div',{class:'mapping-preview-case'},U.el('span',{class:'small-note'},c.label),Rich.mappedNode(c.value,col)));
  this.body.append(list);
 }
 renderNumber(col,sample,trialValue){
  let raw=col.key==='amountCents'?sample.amountCents/100:sample[col.key],txt=X.formatValue(sample,col);
  if(trialValue!==undefined){raw=trialValue;if(col.mapping.enabled){if(col.mapping.type==='number')raw=Number(raw);else if(col.mapping.type==='boolean')raw=raw==='true';}else if(col.key==='amountCents')raw=Number(raw);txt=col.number.enabled?R.formatNumber(raw,col.number):String(raw);}
  const excel=col.number?.enabled?R.excelNumber(raw,col.number):null;
  const host=U.el('div',{class:'number-preview-cases'});
  host.append(U.el('div',{},U.el('span',{class:'small-note'},col.key==='amountCents'?'原值（元）':'原始值'),U.el('strong',{},String(raw??'空'))),U.el('span',{class:'preview-arrow'},'→'),U.el('div',{},U.el('span',{class:'small-note'},'显示结果'),col.mapping?.enabled?Rich.mappedNode(trialValue!==undefined?raw:sample[col.key],col):U.el('strong',{},txt)),U.el('div',{},U.el('span',{class:'small-note'},'Excel 数值 / 格式'),U.el('span',{class:'preview-code'},excel?`${excel.value} / ${excel.format}`:'按原字段类型导出')));
  this.body.append(host);
 }
 note(text){let note=this.body.querySelector('.preview-action-note');if(!note){note=U.el('p',{class:'small-note preview-action-note',role:'status'});this.body.append(note);}note.textContent=text;}
 destroy(){this.alive=false;cancelAnimationFrame(this.frame);this.observer.disconnect();root.QuoteMenus.closeFor(this.host);}
}
root.QuoteSettingsPreview=Preview;
})(globalThis);
