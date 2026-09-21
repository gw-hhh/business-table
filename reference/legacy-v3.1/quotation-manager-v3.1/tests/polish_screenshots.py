import json,shutil
from playwright.sync_api import sync_playwright
import browser_test as b
stats=[]
with sync_playwright() as pw:
 b.browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width,height in [(1440,900),(1366,768),(768,1024),(390,844),(320,700)]:
  p=b.load(width=width,height=height,touch=width<600)
  def shot(name):
   p.screenshot(path=str(b.ARTIFACTS/f'polish-{width}-{name}.png'),full_page=True,animations='disabled')
   stats.append({'width':width,'view':name,'document':p.evaluate('({w:innerWidth,sw:document.documentElement.scrollWidth})'),'settings':p.locator('.settings-content').evaluate('(n)=>({w:n.clientWidth,sw:n.scrollWidth,h:n.clientHeight,sh:n.scrollHeight})') if p.locator('.settings-content').count() else None,'errors':list(b.errors)})
  shot('main');p.locator('#settings-button').click();shot('columns')
  p.locator('#settings-tab-toolbar').click();shot('toolbar')
  p.locator('#settings-tab-columns').click();p.locator('[data-column-select="status"]').click();p.locator('#mapping-enabled').check();p.locator('#section-mapping').evaluate('n=>n.scrollIntoView({block:"start"})');shot('mapping')
  p.locator('#settings-cancel').click();
  if not p.locator('#create-button').is_visible():
   p.locator('.header-actions .toolbar-overflow').click();p.get_by_role('menuitem',name='新增报价',exact=True).click()
  else:p.locator('#create-button').click()
  p.locator('#edit-rich-remark').click();shot('richtext')
 b.context.close();b.browser.close()
(b.ARTIFACTS/'polish-layouts.json').write_text(json.dumps(stats,indent=2,ensure_ascii=False))
