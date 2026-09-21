"""Real file and HTTP navigation, native browser storage, same-context reopen."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json, os, shutil
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/artifacts';report=[]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
thread=Thread(target=server.serve_forever,daemon=True);thread.start()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    for kind,url in [('file', (ROOT/'quotation-manager.html').as_uri()),('http',f'http://127.0.0.1:{server.server_port}/index.html')]:
        context=browser.new_context(viewport={'width':1440,'height':900});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        result={'mode':kind,'native_storage':True,'cross_browser_restart':False}
        try:
            page.goto(url,wait_until='load',timeout=10000);page.set_default_timeout(3000)
            expect(page.locator('#table-body tr[data-row-id]')).to_have_count(6)
            page.locator('#settings-button').click();page.locator('#setting-column-label').fill('本地项目');page.locator('#settings-apply').click()
            page.locator('#create-button').click();page.locator('#quote-name').fill('真实导航验证');page.locator('#quote-customer').fill('测试客户');page.locator('#quote-amount').fill('10.29');page.locator('#quote-save').click()
            expect(page.locator('#table-body tr[data-row-id]')).to_have_count(7)
            second=context.new_page();second.on('pageerror',lambda e:errors.append(str(e)));second.goto(url,wait_until='load',timeout=10000)
            expect(second.locator('#table-body tr[data-row-id]')).to_have_count(7);expect(second.locator('#table-head')).to_contain_text('本地项目')
            second.reload(wait_until='load');expect(second.locator('#table-body tr[data-row-id]')).to_have_count(7)
            assert not errors,errors
            result.update(passed=True,detail='完整加载、原生 localStorage 写入、新页面共享数据和列名、刷新保留')
        except Exception as exc:result.update(passed=False,error=str(exc),page_errors=errors)
        report.append(result);print(kind,json.dumps(result,ensure_ascii=False),flush=True);context.close()
    browser.close()
server.shutdown();server.server_close()
(OUT/'navigation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if all(r['passed'] for r in report) else 1)
