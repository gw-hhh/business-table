"""最终 HTML 真实渲染截图；与正常运行数据隔离。"""
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import browser_test as base
OUT=base.ARTIFACTS
with sync_playwright() as pw:
 base.browser=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 p=base.load();p.screenshot(path=str(OUT/'v3-desktop.png'),full_page=True)
 p.locator('#settings-button').click();p.locator('#settings-tab-toolbar').click();p.screenshot(path=str(OUT/'v3-toolbar.png'),full_page=True)
 p.locator('#settings-cancel').click();p.locator('#settings-button').click();p.locator('[data-column-select="status"]').click();p.locator('#mapping-enabled').check();p.locator('#mapping-label-0').fill('待处理');p.locator('.column-section-nav').get_by_role('button',name='映射',exact=True).click();p.wait_for_timeout(100);p.screenshot(path=str(OUT/'v3-mapping.png'),full_page=True)
 p.locator('#settings-apply').click();p.locator('th[data-column="status"]').hover();p.locator('[data-column-filter="status"]').click();p.screenshot(path=str(OUT/'v3-filter.png'),full_page=True)
 p=base.load();p.locator('#table-body tr').first.locator('[data-table-action="edit"]').click();p.locator('#edit-rich-remark').click();p.locator('#rich-editor').fill('项目补充说明\n请核对现场设备清单。\n报价有效期以单据日期为准。');p.locator('#rich-editor').evaluate("""n=>{const r=document.createRange();r.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(r);n.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Shift'}));}""");p.locator('#rich-color').fill('#244875');p.locator('#rich-color').dispatch_event('change');p.locator('#rich-editor').press('ArrowRight');p.screenshot(path=str(OUT/'v3-richtext.png'),full_page=True)
 p=base.load(width=390,height=844);p.screenshot(path=str(OUT/'v3-mobile.png'),full_page=True);assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
 if base.context:base.context.close()
 base.browser.close()
print('Screenshots created.')
