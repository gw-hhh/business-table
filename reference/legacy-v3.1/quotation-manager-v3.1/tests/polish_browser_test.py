"""3.1 UI regression: real rendered HTML, test-only storage adapter inherited from base."""
import json, os, shutil, traceback
from playwright.sync_api import sync_playwright, expect
import browser_test as base
CASES=[]
def case(name):
 def add(fn): CASES.append((name, fn)); return fn
 return add

def setup(key=None, tab='columns', **kwargs):
 p=base.load(**kwargs);p.locator('#settings-button').click()
 if tab!='columns':p.locator('#settings-tab-'+tab).click()
 if key:p.locator('[data-column-select="'+key+'"]').click()
 return p

@case('390px 工具栏名称/位置/形式各有足够宽度且不溢出')
def mobile_toolbar():
 p=setup(tab='toolbar',width=390,height=844,touch=True)
 for row in p.locator('.toolbar-config-row').all():
  for selector in ['input[type="text"]','select']:
   for n in row.locator(selector).all():
    box=n.bounding_box();assert box['width']>=90,box
 assert p.locator('.settings-content').evaluate('n=>n.scrollWidth<=n.clientWidth+1')

@case('工具栏桌面配置紧凑且有共享列名')
def toolbar_density():
 p=setup(tab='toolbar')
 expect(p.locator('.toolbar-config-heading')).to_have_count(2)
 assert p.locator('.toolbar-config-row').first.bounding_box()['height']<=64

@case('无修改时应用禁用；修改有摘要，取消不覆盖配置')
def dirty_summary():
 p=setup('status');before=base.stored()
 expect(p.locator('#settings-apply')).to_be_disabled()
 p.locator('#setting-column-label').fill('业务状态')
 expect(p.locator('#settings-apply')).to_be_enabled()
 expect(p.locator('#settings-change-summary')).to_contain_text('显示名称')
 p.locator('#settings-cancel').click();assert base.stored()==before

@case('预览跟随工具栏/列，并保留整表和收起切换')
def context_preview():
 p=setup(tab='toolbar');expect(p.locator('.toolbar-live-preview')).to_have_count(2)
 p.locator('#preview-mode-table').click();expect(p.locator('.settings-preview .quote-table')).to_be_visible()
 p.locator('#preview-toggle').click();expect(p.locator('#settings-preview-content')).to_be_hidden()
 p.locator('#preview-toggle').click();expect(p.locator('#settings-preview-content')).to_be_visible()

@case('列设置显示当前编辑对象，批量样式含义明确')
def editing_context():
 p=setup('status');expect(p.locator('#editing-column-context')).to_contain_text('状态')
 expect(p.locator('.batch-style-caption')).to_contain_text('批量样式')

@case('映射显示即时样例且样式可以展开')
def mapping_preview():
 p=setup('status');p.locator('#mapping-enabled').check()
 expect(p.locator('.mapping-inline-preview').first).to_contain_text('草稿')
 p.locator('#mapping-label-0').fill('等待确认');expect(p.locator('.mapping-inline-preview').first).to_contain_text('等待确认')
 expect(p.locator('.mapping-style-details').first).to_be_visible()

@case('富文本工具按语义分组并明确回填作用')
def rich_groups():
 p=base.load();p.locator('#create-button').click();p.locator('#edit-rich-remark').click()
 assert p.locator('.rich-tool-group').count()>=5
 expect(p.locator('#rich-save')).to_have_text('回填备注')
 expect(p.locator('#rich-expand')).to_be_visible()

def select_text(p, start=0, end=None):
 p.locator('#rich-editor').evaluate("(n,args)=>{const r=document.createRange();if(args[1]===null)r.selectNodeContents(n);else{r.setStart(n.firstChild.firstChild||n.firstChild,args[0]);r.setEnd(n.firstChild.firstChild||n.firstChild,args[1]);}getSelection().removeAllRanges();getSelection().addRange(r);n.dispatchEvent(new Event('mouseup'));}",[start,end])

@case('正文副标题对比度达到4.5且双行默认行高不超过64px')
def main_metrics():
 p=base.load();assert p.locator('#table-body tr').first.bounding_box()['height']<=64
 ratio=p.locator('#table-body .cell-customer').first.evaluate("n=>{const c=getComputedStyle(n).color.match(/[0-9]+/g).slice(0,3).map(Number);const v=c.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return 1.05/(v[0]*.2126+v[1]*.7152+v[2]*.0722+.05);}");assert ratio>=4.5,ratio

@case('列切换和分类切换分别恢复滚动位置')
def scroll_memory():
 p=setup('amountCents');p.locator('.column-detail').evaluate('n=>n.scrollTop=450');before=p.locator('.column-detail').evaluate('n=>n.scrollTop')
 p.locator('[data-column-select="status"]').click();p.locator('.column-detail').evaluate('n=>n.scrollTop=200')
 p.locator('[data-column-select="amountCents"]').click();assert abs(p.locator('.column-detail').evaluate('n=>n.scrollTop')-before)<3
 p.locator('#settings-tab-toolbar').click();p.locator('.settings-content').evaluate('n=>n.scrollTop=170');a=p.locator('.settings-content').evaluate('n=>n.scrollTop');p.locator('#settings-tab-actions').click();p.locator('#settings-tab-toolbar').click();assert abs(p.locator('.settings-content').evaluate('n=>n.scrollTop')-a)<3

@case('分段对齐键盘切换更新原值，字体支持搜索')
def controls():
 p=setup('amountCents');btn=p.locator('[data-for="setting-body-align"][data-value="center"]');btn.click();expect(p.locator('#setting-body-align')).to_have_value('center');p.keyboard.press('ArrowRight');expect(p.locator('#setting-body-align')).to_have_value('right')
 p.locator('#setting-body-family').locator('..').get_by_role('button').click();p.get_by_role('searchbox',name='搜索字体').fill('等宽');p.locator('dialog').last.get_by_role('option').click();expect(p.locator('#setting-body-family')).to_have_value('mono');expect(p.locator('#setting-body-family')).to_be_focused()

@case('颜色预设支持回填色值且不覆盖数据')
def palettes():
 p=setup('name');before=base.records();p.locator('#setting-body-color').locator('..').locator('..').get_by_label('常用颜色').click();p.get_by_role('button',name='使用深蓝色',exact=True).click();expect(p.locator('#setting-body-color')).to_have_value('#2468e8');assert base.records()==before

@case('数字固定/最多分段选项兼容原最少最多小数位')
def precision():
 p=setup('amountCents');p.locator('#number-enabled').check();p.locator('#number-precision-max').click();expect(p.locator('#number-min')).to_have_value('0');p.locator('#number-max').fill('4');p.locator('#number-precision-fixed').click();expect(p.locator('#number-min')).to_have_value('4')

@case('预览操作菜单只作演示，不写业务数据')
def safe_action_preview():
 p=setup(tab='actions');before=base.records();p.locator('.action-preview-cell [data-row-more]').click();p.get_by_role('menuitem',name='删除',exact=True).click();assert base.records()==before;expect(p.locator('.preview-action-note')).to_be_visible();expect(p.locator('dialog')).to_have_count(1)

@case('映射错误定位到对应原值输入并保留草稿')
def inline_validation():
 p=setup('status');p.locator('#mapping-enabled').check();p.locator('#mapping-raw-1').fill('draft');p.locator('#settings-apply').click();expect(p.locator('#mapping-raw-1')).to_have_attribute('aria-invalid','true');expect(p.locator('#mapping-raw-1')).to_be_focused();expect(p.locator('.inline-setting-error')).to_be_visible()

@case('表头鼠标悬停不移动文字位置')
def stable_headers():
 p=base.load();label=p.locator('#table-head th[data-column="status"] .sort-button>span').first;a=label.bounding_box();p.locator('#table-head th[data-column="status"]').hover();b=label.bounding_box();assert abs(a['x']-b['x'])<1 and abs(a['width']-b['width'])<1

@case('整表预览复用正式密度、字体、内容渲染')
def preview_parity():
 p=setup();p.locator('#preview-mode-table').click();main=p.locator('#table-body tr').first;prev=p.locator('.live-table-preview tbody tr').first;assert abs(main.bounding_box()['height']-prev.bounding_box()['height'])<2

@case('编辑对象标题在长设置滚动后仍可见')
def sticky_context():
 p=setup('status');p.locator('.column-detail').evaluate('n=>n.scrollTop=900');ctx=p.locator('#editing-column-context').bounding_box();host=p.locator('.column-detail').bounding_box();assert ctx['y']>=host['y'] and ctx['y']<host['y']+110,(ctx,host)

@case('选区混合格式显示混合，点击加粗统一设置，不修改其他文字')
def rich_mixed():
 p=base.load();p.locator('#create-button').click();p.locator('#edit-rich-remark').click();p.locator('#rich-editor').evaluate("n=>{n.innerHTML='<p><strong>加粗</strong><span>普通</span></p>';n.dispatchEvent(new Event('input'));}");select_text(p)
 expect(p.locator('#rich-bold')).to_have_attribute('aria-pressed','mixed');expect(p.locator('#rich-selection-status')).to_contain_text('不同格式');p.locator('#rich-bold').click();expect(p.locator('#rich-bold')).to_have_attribute('aria-pressed','true');p.locator('#rich-bold').click();expect(p.locator('#rich-bold')).to_have_attribute('aria-pressed','false')
 expect(p.locator('#rich-editor')).to_have_text('加粗普通');p.locator('#rich-undo').click();expect(p.locator('#rich-editor')).to_have_text('加粗普通')

@case('富文本可同时保留下划线和删除线')
def rich_decoration():
 p=base.load();p.locator('#create-button').click();p.locator('#edit-rich-remark').click();p.locator('#rich-editor').fill('同时格式');select_text(p);p.locator('#rich-underline').click();p.locator('#rich-strike').click()
 data=p.locator('#rich-editor').evaluate('n=>QuoteRichText.fromDOM(n)');run=next(x for x in data['ops'] if '同时格式' in str(x['insert']));assert run.get('attributes',{}).get('underline') and run.get('attributes',{}).get('strike'),data

@case('富文本普通尺寸与展开模式可切换，回填不直接写记录')
def rich_size_and_save():
 p=base.load();before=base.records();p.locator('#create-button').click();p.locator('#edit-rich-remark').click();normal=p.locator('.rich-dialog').bounding_box();assert normal['height']<=700,normal
 p.locator('#rich-editor').fill('本次回填');p.locator('#rich-expand').click();large=p.locator('.rich-dialog').bounding_box();assert large['height']>normal['height'];p.locator('#rich-expand').click();p.locator('#rich-save').click();assert base.records()==before;expect(p.locator('#quote-remark')).to_have_value('本次回填')

@case('320px全选列和各工具配置仍可访问')
def small_controls():
 p=setup(width=320,height=700,touch=True);expect(p.get_by_label('全选样式列',exact=True)).to_be_visible();p.locator('#settings-tab-toolbar').click();
 for el in p.locator('.toolbar-config-row select').all():assert el.bounding_box()['width']>=90
 assert p.locator('.settings-content').evaluate('n=>n.scrollWidth<=n.clientWidth+1')

@case('快捷列面板的未应用修改进入完整设置可直接应用')
def pending_quick():
 p=base.load();p.locator('#columns-button').click();p.locator('[data-row-key="owner"]').hover();p.locator('[data-row-key="owner"] [data-pin="left"]').click();p.locator('#columns-more-settings').click();expect(p.locator('#settings-apply')).to_be_enabled();expect(p.locator('#settings-change-summary')).to_contain_text('冻结');p.locator('#settings-apply').click();assert p.locator('#table-head th[data-column="owner"]').evaluate('n=>n.style.left')!=''

@case('全局颜色错误定位到外观输入，保留修改')
def appearance_error():
 p=setup(tab='appearance');p.locator('#appearance-color').fill('#abc');p.locator('#settings-apply').click();expect(p.locator('#appearance-color')).to_have_attribute('aria-invalid','true');expect(p.locator('#appearance-color')).to_be_focused()

@case('工具栏空名称不能保存且定位对应工具')
def toolbar_error():
 p=setup(tab='toolbar');p.locator('#tool-label-export-button').fill('');p.locator('#settings-apply').click();expect(p.locator('#tool-label-export-button')).to_have_attribute('aria-invalid','true');expect(p.locator('dialog.settings-drawer')).to_be_visible()

@case('未改源列时复制样式到不同目标列也启用应用')
def bulk_existing_style():
 p=setup('owner');p.locator('#setting-body-size').select_option('18');p.locator('#settings-apply').click();p.locator('#settings-button').click();p.get_by_label('选择负责人用于批量样式',exact=True).check();expect(p.locator('#settings-apply')).to_be_disabled();p.locator('#apply-bulk-style').click();expect(p.locator('#settings-apply')).to_be_enabled();p.locator('#settings-apply').click();expect(p.locator('#table-body td[data-column="owner"]').first).to_have_css('font-size','14px')

@case('规则试算样例与底部当前对象预览一致')
def trial_sync():
 p=setup('amountCents');p.locator('#number-enabled').check();p.locator('#number-mode').select_option('percent');p.locator('#rule-trial-value').fill('0.25');expect(p.locator('.rule-trial-result')).to_contain_text('25.00%');expect(p.locator('.number-preview-cases')).to_contain_text('25.00%')

@case('长列名大字号仍可编辑，已存字重列宽不会被精修重置')
def large_fonts():
 p=setup('name');p.locator('#setting-column-label').fill('这是一个较长的项目名称列标题用于排版测试');p.locator('#setting-body-size').select_option('20');p.locator('#setting-body-weight').select_option('700');p.locator('#setting-wrap').select_option('wrap');p.locator('#setting-column-width').fill('350');p.locator('#settings-apply').click()
 values=base.stored();p=base.load(entries=values,width=1366,height=768);td=p.locator('#table-body td[data-column="name"]').first;expect(td).to_have_css('font-size','20px');expect(td).to_have_css('font-weight','700');assert td.bounding_box()['width']>=350;p.locator('#settings-button').click();p.locator('#settings-tab-toolbar').click();p.locator('#settings-cancel').click();assert base.stored()==values

@case('720px有效视口各设置分类无整页横向溢出')
def reflow_tablet():
 p=setup(width=720,height=820)
 for tab in ['columns','sorts','actions','appearance','toolbar']:
  p.locator('#settings-tab-'+tab).click();assert p.locator('.settings-content').evaluate('n=>n.scrollWidth<=n.clientWidth+1'),tab
  assert p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),tab

@case('预览折叠和模式在重新打开后保留，报价设置不被写入')
def preview_memory():
 p=setup();before=base.stored();p.locator('#preview-mode-table').click();p.locator('#preview-toggle').click();p.locator('#settings-cancel').click();after=base.stored();assert all(after.get(k)==v for k,v in before.items());p.locator('#settings-button').click();expect(p.locator('#settings-preview-content')).to_be_hidden();expect(p.locator('#preview-mode-table')).to_have_attribute('aria-pressed','true')

@case('减少动态效果开启后不强制播放动画')
def reduced_motion():
 p=base.load();p.emulate_media(reduced_motion='reduce');p.locator('#settings-button').click();expect(p.locator('.settings-drawer')).to_have_css('animation-name','none')

@case('点击分区导航后内容紧接固定标题，不留下双倍定位空隙')
def section_navigation_gap():
 p=setup('status');p.locator('#mapping-enabled').check();p.locator('.column-section-nav').get_by_role('button',name='映射',exact=True).click();header=p.locator('.column-editor-header').bounding_box();target=p.locator('#section-mapping').bounding_box();gap=target['y']-(header['y']+header['height']);assert 0<=gap<=30,gap

if __name__=='__main__':
 results=[]
 with sync_playwright() as pw:
  base.browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
  for i,(name,fn) in enumerate(CASES):
   if os.environ.get("CASE_FROM") and i<int(os.environ["CASE_FROM"]):continue
   if os.environ.get("TEST_MATCH") and os.environ["TEST_MATCH"] not in name:continue
   try:
    fn();assert not base.errors,base.errors;results.append({'name':name,'passed':True});print('PASS',name,flush=True)
   except Exception as e:
    results.append({'name':name,'passed':False,'error':str(e),'traceback':traceback.format_exc()});print('FAIL',name,str(e)[:360],flush=True)
  version=base.browser.version
  if base.context:base.context.close()
  base.browser.close()
 report={'browser':version,'total':len(results),'passed':sum(x['passed'] for x in results),'results':results}
 (base.ARTIFACTS/'polish-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print('RESULT',report['passed'],'/',report['total']);raise SystemExit(any(not r['passed'] for r in results))
