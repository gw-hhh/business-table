"""增量 UI 回归。所有交互运行交付 HTML，无服务端模拟业务。"""
import json,os,shutil,traceback,sys
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import browser_test as base
CASES=[]
def case(name):
 def register(fn):CASES.append((name,fn));return fn
 return register

def setup(key=None,tab='columns'):
 p=base.page;p.locator('#settings-button').click()
 if tab!='columns':p.locator('#settings-tab-'+tab).click()
 if key:p.locator('[data-column-select="'+key+'"]').click()
 return p

def apply():
 base.page.locator('#settings-apply').click();expect(base.page.locator('dialog.settings-drawer')).to_have_count(0)

def layout():return base.page.evaluate("JSON.parse(localStorage.getItem('quotation-demo:preferences:v1')).data.layout")

@case('工具栏设置新增分类且保留四个旧分类')
def toolbar_exists():
 p=base.load();setup(tab='toolbar')
 for tab in ['columns','sorts','actions','appearance','toolbar']:expect(p.locator('#settings-tab-'+tab)).to_have_count(1)
 expect(p.locator('[data-tool-config="export-button"]')).to_have_count(1)

@case('列值映射设置和原始状态不变')
def mapping_exists():
 p=base.load();setup('status');p.locator('#mapping-enabled').check()
 expect(p.locator('#add-mapping')).to_be_visible()
 assert base.records()[0]['status']=='draft'

@case('数字格式明确提供两种百分比基数')
def numeric_exists():
 p=base.load();setup('amountCents');p.locator('#number-enabled').check()
 p.locator('#number-mode').select_option('percent')
 expect(p.locator('#number-percent-base')).to_be_visible()

@case('富文本备注编辑入口不删除原备注输入')
def rich_exists():
 p=base.load();p.locator('#create-button').click();expect(p.locator('#quote-remark')).to_have_count(1)
 p.locator('#edit-rich-remark').click();expect(p.locator('#rich-editor')).to_be_visible()


def edit_first():
 p=base.page;p.locator('#table-body tr').first.locator('[data-table-action="edit"]').click();return p

def select_rich(text=None):
 base.page.locator('#rich-editor').evaluate("""(n)=>{n.focus();const r=document.createRange();r.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(r);n.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true}));}""")

@case('工具栏收进更多后原导出流程仍可用；设置入口始终保留')
def toolbar_overflow():
 p=base.load();setup(tab='toolbar');p.locator('#tool-placement-export-button').select_option('more');apply()
 expect(p.locator('#export-button')).to_be_hidden();p.locator('#toolbar-overflow-header').click();p.get_by_role('menuitem',name='导出',exact=True).click();expect(p.locator('#export-confirm')).to_be_visible()
 expect(p.locator('#settings-button')).to_be_visible()

@case('映射文字应用、筛选与导出使用同一编码，重载仍保留')
def mapping_apply():
 p=base.load();original=base.records();setup('status');p.locator('#mapping-enabled').check();p.locator('#mapping-label-0').fill('待处理');p.locator('#filter-source').select_option('mapping');apply()
 expect(p.locator('#table-body [data-column="status"]').first).to_contain_text('待处理');assert base.records()==original
 p.locator('th[data-column="status"]').hover();p.locator('[data-column-filter="status"]').click();p.get_by_label('待处理',exact=True).check();p.locator('#column-filter-apply').click();base.rows(3)
 expect(p.locator('#filter-chips')).to_contain_text('待处理');p.get_by_label('清除状态列筛选',exact=True).click();base.rows(6)
 base.fresh_document();expect(base.page.locator('#table-body [data-column="status"]').first).to_contain_text('待处理')

@case('映射重复值不能应用，取消不覆盖原设置')
def mapping_invalid():
 p=base.load();before=base.stored();setup('status');p.locator('#mapping-enabled').check();p.locator('#mapping-raw-1').fill('draft');p.locator('#settings-apply').click();expect(p.locator('.settings-error')).to_contain_text('重复');p.locator('#settings-cancel').click();assert base.stored()==before

@case('高级数字格式显示缩放、精度和分组，原值保持不变')
def number_apply():
 p=base.load();original=base.records();setup('amountCents');p.locator('#number-enabled').check();p.locator('#number-scale').select_option('10000');p.locator('#number-suffix').fill('万元');p.locator('#number-min').fill('2');p.locator('#number-max').fill('2');apply()
 expect(p.locator('#table-body [data-column="amountCents"]').first).to_contain_text('6.39万元');assert base.records()==original
 setup('amountCents');p.locator('#number-enabled').uncheck();apply();expect(p.locator('#table-body [data-column="amountCents"]').first).to_contain_text('63,860.00')

@case('数字列筛选按显示单位比较且错误区间不会应用')
def column_numbers():
 p=base.load();setup('amountCents');p.locator('#number-enabled').check();p.locator('#number-scale').select_option('10000');apply()
 p.locator('th[data-column="amountCents"]').hover();p.locator('[data-column-filter="amountCents"]').click();p.locator('#column-filter-operator').select_option('between');p.locator('#column-filter-value').fill('20');p.locator('#column-filter-to').fill('10');p.locator('#column-filter-apply').click();expect(p.locator('dialog .form-error')).to_contain_text('下限');p.locator('#column-filter-value').fill('10');p.locator('#column-filter-to').fill('20');p.locator('#column-filter-apply').click();base.rows(1)
 expect(p.locator('#table-body')).to_contain_text('Q20260912-0002')

@case('关闭生效中列筛选需要确认并清除，不删除顶部查询')
def disable_filter():
 p=base.load();p.locator('th[data-column="status"]').hover();p.locator('[data-column-filter="status"]').click();p.get_by_label('草稿',exact=True).check();p.locator('#column-filter-apply').click();base.rows(3)
 setup('status');p.locator('#filter-enabled').uncheck();p.locator('#settings-apply').click();expect(p.locator('dialog[open]')).to_have_count(2);p.locator('dialog').last.get_by_role('button',name='清除并应用',exact=True).click();base.rows(6);expect(p.locator('[data-column-filter="status"]')).to_have_count(0);expect(p.locator('#filter-status')).to_have_count(1)

@case('富文本编辑、颜色、撤销重做、保存和重新打开')
def rich_save():
 p=base.load();edit_first();p.locator('#edit-rich-remark').click();p.locator('#rich-editor').fill('富文本核对备注');select_rich();p.locator('#rich-bold').click();expect(p.locator('#rich-editor span').last).to_have_css('font-weight','700');p.locator('#rich-undo').click();assert not p.locator('#rich-editor [style*="font-weight: 700"]').count();p.locator('#rich-redo').click();assert p.locator('#rich-editor [style*="font-weight: 700"]').count();p.locator('#rich-save').click();expect(p.locator('#quote-remark')).to_have_value('富文本核对备注');p.locator('#quote-save').click();r=base.records()[0];assert r['remark']=='富文本核对备注' and any(o.get('attributes',{}).get('bold') for o in r['remarkRich']['ops'])
 edit_first();p.locator('#edit-rich-remark').click();expect(p.locator('#rich-editor')).to_contain_text('富文本核对备注')

@case('富文本粘贴清洗危险元素，保存纯文本与样式一致')
def rich_paste():
 p=base.load();edit_first();p.locator('#edit-rich-remark').click();p.locator('#rich-editor').fill('');p.locator('#rich-editor').evaluate("""n=>{const d=new DataTransfer();d.setData('text/html','<p><strong>保留文字</strong><img src=x onerror="window.bad=1"><script>window.bad=1<\\/script><a href="javascript:alert(1)">危险链接</a></p>');n.dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}));}""")
 assert p.evaluate('window.bad') is None;expect(p.locator('#rich-editor img,#rich-editor script,#rich-editor a')).to_have_count(0);expect(p.locator('#rich-editor')).to_contain_text('保留文字');p.locator('#rich-save').click();p.locator('#quote-save').click();assert '保留文字' in base.records()[0]['remark']

@case('富文本超长不静默截断，关闭可放弃草稿')
def rich_limit():
 p=base.load();edit_first();p.locator('#edit-rich-remark').click();p.locator('#rich-editor').fill('字'*1001);p.locator('#rich-save').click();expect(p.locator('dialog.rich-dialog .form-error')).to_contain_text('1000');expect(p.locator('#rich-editor')).to_have_text('字'*1001);p.locator('dialog.rich-dialog').get_by_role('button',name='取消',exact=True).click();expect(p.locator('#quote-remark')).to_have_value('')

@case('列模板插入字段并预览，应用不改原项目和客户')
def template_apply():
 p=base.load();before=base.records();setup('name');p.locator('#edit-column-template').click();p.locator('#rich-editor').fill('客户：');p.locator('#rich-editor').press('End');p.locator('#rich-insert-field').select_option('customer');p.locator('#rich-save').click();expect(p.locator('#template-enabled')).to_be_checked();apply();expect(p.locator('#table-body [data-column="name"]').first).to_contain_text('客户：澄川水务');assert before==base.records()

@case('组合筛选两条规则可独立修改且保存使用原始字段')
def advanced_query():
 p=base.load();p.locator('#data-tools-button').click();p.get_by_role('menuitem',name='组合筛选',exact=True).click();p.locator('#advanced-add-condition').click();p.locator('.advanced-rule').nth(0).get_by_label('筛选字段',exact=True).select_option('status');p.locator('.advanced-rule').nth(0).get_by_label('草稿',exact=True).check();p.locator('#advanced-add-condition').click();p.locator('.advanced-rule').nth(1).get_by_label('筛选字段',exact=True).select_option('customer');p.locator('.advanced-rule').nth(1).locator('input[type="text"]').fill('澄川');p.locator('#advanced-query-apply').click();base.rows(2);expect(p.locator('#filter-chips')).to_contain_text('组合条件 2 项')

@case('Excel实际下载包含映射显示值和原值两列')
def export_both():
 import zipfile
 from xml.etree import ElementTree as ET
 p=base.load();setup('status');p.locator('#mapping-enabled').check();p.locator('#mapping-label-0').fill('待处理');apply();p.locator('#export-button').click();p.locator('#export-value-mode').select_option('both')
 with p.expect_download() as d:p.locator('#export-confirm').click()
 path=base.ARTIFACTS/'rules-mapping-export.xlsx';d.value.save_as(path);z=zipfile.ZipFile(path);assert not z.testzip();xml=z.read('xl/worksheets/sheet1.xml').decode();assert '待处理' in xml and '>draft<' in xml and '原值' in xml



def tools(label):
 p=base.page;p.locator('#data-tools-button').click();p.get_by_role('menuitem',name=label,exact=True).click();return p

@case('分组汇总只读展示完整结果，组标题不参与数据操作')
def group_report():
 p=base.load();before=base.records();tools('分组汇总');expect(p.locator('dialog')).to_contain_text('376,510.00');expect(p.locator('[data-group-count]')).to_have_count(4);p.locator('[data-group-count]').first.click();expect(p.locator('.group-detail-table').first).to_be_visible();assert base.records()==before

@case('记录对比只看差异且不修改记录')
def comparison():
 p=base.load();before=base.records();tools('记录对比');p.locator('[data-compare-pick]').nth(0).check();p.locator('[data-compare-pick]').nth(1).check();expect(p.locator('.comparison-table')).to_contain_text('237,450.00');p.locator('#compare-differences').check();expect(p.locator('.comparison-table')).not_to_contain_text('负责人');assert base.records()==before

@case('条件标记三条大额记录，不改变原有状态')
def marks():
 p=base.load();before=base.records();tools('条件标记');p.locator('#mark-add').click();p.locator('[data-mark-key]').select_option('amountCents');p.locator('.mark-rule [aria-label="筛选条件"]').select_option('gt');p.locator('.mark-rule input[id$="-value"]').fill('200000');p.locator('[data-mark-label]').fill('需复核');p.locator('#marks-apply').click();expect(p.locator('#table-body .row-mark')).to_have_count(3);assert base.records()==before

@case('设置历史可恢复上一次列名且保留新旧设置入口')
def settings_history():
 p=base.load();setup('owner');p.locator('#setting-column-label').fill('跟进人');apply();tools('设置历史');expect(p.locator('#history-list')).to_contain_text('应用表格设置');p.locator('[data-restore-history]').first.click();p.locator('dialog').last.get_by_role('button',name='恢复这版',exact=True).click();expect(p.locator('#table-head')).to_contain_text('负责人');expect(p.locator('#columns-button')).to_be_visible()

@case('区域选择金额统计独立于整行批量选择')
def ranges():
 p=base.load();tools('开启区域选择');a=p.locator('#table-body tr').nth(0).locator('[data-column="amountCents"]');b=p.locator('#table-body tr').nth(1).locator('[data-column="amountCents"]');ra=a.bounding_box();rb=b.bounding_box();p.mouse.move(ra['x']+ra['width']/2,ra['y']+ra['height']/2);p.mouse.down();p.mouse.move(rb['x']+rb['width']/2,rb['y']+rb['height']/2,steps=8);p.mouse.up();expect(p.locator('#range-summary')).to_contain_text('301,310.00');expect(p.locator('#table-body .range-selected')).to_have_count(2);expect(p.locator('[data-select-row]')).to_have_count(0)



@case('富文本已染色文字可以再次改色，不被旧嵌套样式覆盖')
def rich_recolor():
 p=base.load();edit_first();p.locator('#edit-rich-remark').click();p.locator('#rich-editor').fill('修改颜色');select_rich();p.locator('#rich-color').fill('#aa0000');p.locator('#rich-color').dispatch_event('change');select_rich();p.locator('#rich-color').fill('#0011aa');p.locator('#rich-color').dispatch_event('change');p.locator('#rich-save').click();p.locator('#quote-save').click();ops=base.records()[0]['remarkRich']['ops'];assert all(o.get('attributes',{}).get('color')=='#0011aa' for o in ops if isinstance(o['insert'],str) and o['insert'].strip())

@case('富文本裸文本可以设置对齐并保存列表')
def rich_alignment():
 p=base.load();edit_first();p.locator('#edit-rich-remark').click();p.locator('#rich-editor').fill('第一行\n第二行');select_rich();p.locator('#rich-align').select_option('center');p.locator('dialog.rich-dialog').get_by_role('button',name='编号列表',exact=True).click();p.locator('#rich-save').click();p.locator('#quote-save').click();ops=base.records()[0]['remarkRich']['ops'];assert any(o.get('attributes',{}).get('list')=='ordered' for o in ops);assert any(o.get('attributes',{}).get('align')=='center' for o in ops)


@case('复杂粘贴被拒绝且保留原文，不抛出页面错误')
def rich_deep_paste():
 p=base.load();edit_first();p.locator('#edit-rich-remark').click();p.locator('#rich-editor').fill('保留原文');select_rich()
 p.locator('#rich-editor').evaluate("""n=>{const d=new DataTransfer();d.setData('text/html','<span>'.repeat(400)+'深层文字'+'</span>'.repeat(400));n.dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}));}""")
 expect(p.locator('dialog.rich-dialog .form-error')).to_contain_text('层级')
 expect(p.locator('#rich-editor')).to_have_text('保留原文')

if __name__=='__main__':
 results=[]
 with sync_playwright() as pw:
  base.browser=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
  version=base.browser.version
  for i,(name,fn) in enumerate([c for c in CASES if not os.getenv("TEST_FILTER") or os.getenv("TEST_FILTER") in c[0]],1):
   try:
    fn();assert not base.errors,base.errors;results.append({'name':name,'passed':True});print(f'PASS {i:02d} {name}',flush=True)
   except Exception as ex:
    results.append({'name':name,'passed':False,'error':str(ex),'traceback':traceback.format_exc()});print(f'FAIL {i:02d} {name}\n{ex}',flush=True)
    if base.page:
     try:base.page.screenshot(path=str(base.ARTIFACTS/f'enhancement-failure-{i:02d}.png'),full_page=True)
     except Exception:pass
  if base.context:base.context.close()
  base.browser.close()
 report={'browser':version,'total':len(results),'passed':sum(r['passed'] for r in results),'results':results}
 (base.ARTIFACTS/'enhancements-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print(f"RESULT {report['passed']}/{report['total']} passed",flush=True)
 sys.exit(0 if all(r['passed'] for r in results) else 1)
