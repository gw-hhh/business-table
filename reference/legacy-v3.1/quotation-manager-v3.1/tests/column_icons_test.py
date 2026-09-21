"""列设置图标交互回归。复用原回归脚本的离线加载与测试 Storage 适配器。"""
from pathlib import Path
import json
import os
import shutil
import sys
from playwright.sync_api import sync_playwright, expect
import browser_test as base

CASES = []
ARTIFACTS = Path(__file__).resolve().parent / 'artifacts'

def case(name):
    def register(fn):
        CASES.append((name, fn))
        return fn
    return register

def open_panel(**kwargs):
    page = base.load(**kwargs)
    page.locator('#columns-button').click()
    return page

def row(page, key):
    return page.locator(f'.popover [data-row-key="{key}"]')

def pin(page, key, side):
    return row(page, key).locator(f'[data-pin="{side}"]')

def press_pin(page, key, side):
    row(page, key).hover()
    pin(page, key, side).click()

def header(page, key):
    return page.locator(f'#table-head [data-column="{key}"]')

@case('每行恰好两个冻结图标，不再存在冻结下拉框')
def two_icons():
    page = open_panel()
    assert page.locator('.popover select').count() == 0, '列设置仍有冻结下拉框'
    assert page.locator('.settings-row').count() == 10
    for item in page.locator('.settings-row').all():
        expect(item.locator('.pin-button')).to_have_count(2)
        for side in ['left', 'right']:
            expect(item.locator(f'[data-pin="{side}"]')).to_have_attribute('type', 'button')
    expect(page.locator('#columns-apply')).to_have_text('确认')

@case('左右图标采用参考代码中的实心 SVG，而非箭头或文字按钮')
def svg_paths():
    page = open_panel()
    expected = {'left':'M160 160v704h704V160H160zm128 640V224h128v576H288z',
                'right':'M864 160v704H160V160h704zm-128 640V224H608v576h128z'}
    for side, path in expected.items():
        svg = pin(page, 'owner', side).locator('svg')
        expect(svg).to_have_attribute('viewBox', '0 0 1024 1024')
        expect(svg).to_have_attribute('fill', 'currentColor')
        expect(svg).to_have_attribute('stroke', 'none')
        expect(svg.locator('path')).to_have_attribute('d', path)

@case('点击左侧冻结，再点击同一图标取消')
def toggle_left():
    page = open_panel()
    press_pin(page, 'owner', 'left')
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'true')
    expect(pin(page, 'owner', 'left')).to_have_attribute('title', '取消左侧冻结')
    expect(pin(page, 'owner', 'right')).to_have_attribute('aria-pressed', 'false')
    press_pin(page, 'owner', 'left')
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'false')
    expect(pin(page, 'owner', 'left')).to_have_attribute('title', '冻结在左侧')

@case('点击右侧冻结，再点击同一图标取消')
def toggle_right():
    page = open_panel()
    press_pin(page, 'owner', 'right')
    expect(pin(page, 'owner', 'right')).to_have_attribute('aria-pressed', 'true')
    expect(pin(page, 'owner', 'right')).to_have_attribute('title', '取消右侧冻结')
    press_pin(page, 'owner', 'right')
    expect(pin(page, 'owner', 'right')).to_have_attribute('aria-pressed', 'false')

@case('切换左右方向互斥，只高亮当前方向')
def exclusive():
    page = open_panel()
    for side in ['left', 'right', 'left']:
        press_pin(page, 'owner', side)
        other = 'right' if side == 'left' else 'left'
        expect(pin(page, 'owner', side)).to_have_attribute('aria-pressed', 'true')
        expect(pin(page, 'owner', other)).to_have_attribute('aria-pressed', 'false')
        expect(row(page, 'owner').locator('.pin-button.is-active')).to_have_count(1)

@case('保留上版默认冻结方向：编号在左，操作在右')
def defaults():
    page = open_panel()
    expect(pin(page, 'id', 'left')).to_have_attribute('aria-pressed', 'true')
    expect(pin(page, 'actions', 'right')).to_have_attribute('aria-pressed', 'true')
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'false')
    expect(pin(page, 'owner', 'right')).to_have_attribute('aria-pressed', 'false')

@case('未冻结行悬停显示图标；已冻结行离开鼠标后保持显示')
def hover_states():
    page = open_panel()
    page.mouse.move(10, 10)
    page.locator('#columns-button').focus()
    expect(row(page, 'owner').locator('.pin-actions')).to_have_css('opacity', '0')
    row(page, 'owner').hover()
    expect(row(page, 'owner').locator('.pin-actions')).to_have_css('opacity', '1')
    press_pin(page, 'owner', 'left')
    page.mouse.move(10, 10)
    page.locator('#columns-button').focus()
    expect(row(page, 'owner').locator('.pin-actions')).to_have_css('opacity', '1')
    press_pin(page, 'owner', 'left')
    page.mouse.move(10, 10)
    page.locator('#columns-button').focus()
    expect(row(page, 'owner').locator('.pin-actions')).to_have_css('opacity', '0')

@case('键盘 Tab 可定位冻结按钮，Enter 和空格切换后焦点保留')
def keyboard():
    page = open_panel()
    pin(page, 'owner', 'left').focus()
    expect(row(page, 'owner').locator('.pin-actions')).to_have_css('opacity', '1')
    pin(page, 'owner', 'left').press('Enter')
    expect(pin(page, 'owner', 'left')).to_be_focused()
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'true')
    page.keyboard.press('Tab')
    expect(pin(page, 'owner', 'right')).to_be_focused()
    page.keyboard.press('Space')
    expect(pin(page, 'owner', 'right')).to_be_focused()
    expect(pin(page, 'owner', 'right')).to_have_attribute('aria-pressed', 'true')
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'false')

@case('确认前不改变表格，确认后实际冻结并保存')
def confirm_applies():
    page = open_panel()
    press_pin(page, 'owner', 'left')
    assert 'pinned' not in (header(page, 'owner').get_attribute('class') or '')
    page.locator('#columns-apply').click()
    assert 'pinned' in header(page, 'owner').get_attribute('class')
    assert header(page, 'owner').evaluate('(n)=>n.style.left') == '194px'
    base.fresh_document()
    page = base.page
    assert 'pinned' in header(page, 'owner').get_attribute('class')
    page.locator('#columns-button').click()
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'true')

@case('取消、Escape、点击外部都丢弃未确认的冻结修改')
def dismiss_discards():
    for method in ['cancel', 'escape', 'outside']:
        page = open_panel()
        press_pin(page, 'owner', 'right')
        if method == 'cancel':
            page.locator('.popover').get_by_role('button', name='取消', exact=True).click()
        elif method == 'escape':
            page.keyboard.press('Escape')
        else:
            page.locator('h1').click()
        expect(page.locator('.popover')).to_have_count(0)
        assert 'pinned' not in header(page, 'owner').get_attribute('class')
        page.locator('#columns-button').click()
        expect(pin(page, 'owner', 'right')).to_have_attribute('aria-pressed', 'false')

@case('恢复默认只修改草稿：取消不生效，确认才恢复')
def reset_draft():
    page = open_panel()
    press_pin(page, 'owner', 'right')
    page.locator('#columns-apply').click()
    page.locator('#columns-button').click()
    page.locator('.popover').get_by_role('button', name='恢复默认', exact=True).click()
    expect(pin(page, 'owner', 'right')).to_have_attribute('aria-pressed', 'false')
    page.locator('.popover').get_by_role('button', name='取消', exact=True).click()
    assert 'pinned' in header(page, 'owner').get_attribute('class')
    page.locator('#columns-button').click()
    expect(pin(page, 'owner', 'right')).to_have_attribute('aria-pressed', 'true')
    page.locator('.popover').get_by_role('button', name='恢复默认', exact=True).click()
    page.locator('#columns-apply').click()
    assert 'pinned' not in header(page, 'owner').get_attribute('class')

@case('列表滚动到底部再切换冻结，不跳回顶部且保留焦点')
def scrolling():
    page = open_panel()
    listing = page.locator('.column-list')
    listing.evaluate('(n)=>n.scrollTop=n.scrollHeight')
    # Playwright 会在点击前滚动目标；在真实 pointerdown 时记录操作起点。
    pin(page, 'actions', 'left').evaluate("""button => {
        button.addEventListener('pointerdown', () => {
            window.__scrollBeforePin = document.querySelector('.column-list').scrollTop;
        }, {once:true});
    }""")
    press_pin(page, 'actions', 'left')
    before = page.evaluate('window.__scrollBeforePin')
    after = listing.evaluate('(n)=>n.scrollTop')
    assert before > 0
    assert abs(after - before) < 2, (before, after)
    expect(pin(page, 'actions', 'left')).to_be_focused()
    expect(pin(page, 'actions', 'left')).to_have_attribute('aria-pressed', 'true')

@case('冻结按钮不会误触发列勾选；隐藏后重新显示保留草稿冻结方向')
def visibility():
    page = open_panel()
    press_pin(page, 'owner', 'left')
    expect(row(page, 'owner').locator('input[type="checkbox"]')).to_be_checked()
    row(page, 'owner').locator('input[type="checkbox"]').uncheck()
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'true')
    row(page, 'owner').locator('input[type="checkbox"]').check()
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'true')
    page.locator('#columns-apply').click()
    assert 'pinned' in header(page, 'owner').get_attribute('class')

@case('拖动和键盘上下移动列后，冻结方向仍属于原列')
def sorting():
    page = open_panel()
    press_pin(page, 'owner', 'left')
    page.locator('.popover').evaluate('(node)=>Promise.all(node.getAnimations().map(animation=>animation.finished))')
    page.locator('[data-drag="owner"]').drag_to(row(page, 'amountCents'))
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'true')
    handle = page.locator('[data-drag="owner"]')
    handle.focus()
    before = page.locator('.column-list [data-row-key]').evaluate_all('(a)=>a.map(n=>n.dataset.rowKey)')
    handle.press('ArrowUp')
    after = page.locator('.column-list [data-row-key]').evaluate_all('(a)=>a.map(n=>n.dataset.rowKey)')
    assert after.index('owner') == before.index('owner') - 1
    expect(page.locator('[data-drag="owner"]')).to_be_focused()
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'true')

@case('触屏环境图标常显，一次点按切换；保留上下移动入口')
def touch():
    page = open_panel(width=390, height=844, touch=True)
    assert page.evaluate("matchMedia('(hover: none)').matches")
    expect(row(page, 'owner').locator('.pin-actions')).to_have_css('opacity', '1')
    pin(page, 'owner', 'left').tap()
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'true')
    pin(page, 'owner', 'left').tap()
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'false')
    page.get_by_role('button', name='上移负责人', exact=True).tap()
    page.locator('#columns-apply').tap()
    keys = page.locator('#table-head [data-column]').evaluate_all('(a)=>a.map(n=>n.dataset.column)')
    assert keys.index('owner') < keys.index('status')
    page.locator('#columns-button').tap()
    page.screenshot(path=str(ARTIFACTS / 'column-icons-touch.png'), full_page=True)

@case('窄屏与短屏面板不溢出，底部确认按钮可见')
def viewports():
    for width, height in [(320, 568), (390, 844), (1024, 360), (1440, 900)]:
        page = open_panel(width=width, height=height)
        panel = page.locator('.popover').bounding_box()
        assert panel['x'] >= 0 and panel['x'] + panel['width'] <= width
        assert panel['y'] >= 0 and panel['y'] + panel['height'] <= height
        expect(page.locator('#columns-apply')).to_be_in_viewport()
        assert page.locator('.column-panel').evaluate('(n)=>n.scrollWidth <= n.clientWidth')

@case('列冻结状态可以随视图保存并恢复')
def view_snapshot():
    page = open_panel()
    press_pin(page, 'owner', 'left')
    page.locator('#columns-apply').click()
    page.locator('#view-button').click()
    page.locator('.popover').get_by_role('button', name='另存为视图', exact=True).click()
    page.locator('#view-name-input').fill('图标冻结视图')
    page.locator('#view-save').click()
    page.locator('#columns-button').click()
    press_pin(page, 'owner', 'right')
    page.locator('#columns-apply').click()
    page.locator('#view-button').click()
    page.locator('.view-name-btn').filter(has_text='图标冻结视图').click()
    page.locator('#columns-button').click()
    expect(pin(page, 'owner', 'left')).to_have_attribute('aria-pressed', 'true')
    expect(pin(page, 'owner', 'right')).to_have_attribute('aria-pressed', 'false')

@case('生成更新后列设置面板与完整页面截图')
def screenshots():
    page = open_panel(width=1440, height=900)
    press_pin(page, 'amountCents', 'left')
    page.locator('#columns-apply').click()
    page.locator('#columns-button').click()
    row(page, 'amountCents').hover()
    page.locator('.column-list').evaluate('(node)=>node.scrollTop=0')
    page.wait_for_timeout(160)
    page.screenshot(path=str(ARTIFACTS / 'column-icons-desktop.png'), full_page=True)
    page.locator('.popover').screenshot(path=str(ARTIFACTS / 'column-icons-panel.png'))
    page.keyboard.press('Escape')
    page.locator('#columns-button').click()
    page.locator('.column-list').evaluate('(n)=>n.scrollTop=n.scrollHeight')
    row(page, 'actions').hover()
    page.wait_for_timeout(160)
    page.locator('.popover').screenshot(path=str(ARTIFACTS / 'column-icons-panel-bottom.png'))

if __name__ == '__main__':
    results = []
    with sync_playwright() as playwright:
        executable = os.getenv('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
        base.browser = playwright.chromium.launch(executable_path=executable, headless=True,
            args=['--no-sandbox'] if getattr(os, 'geteuid', lambda: 1)() == 0 else [])
        version = base.browser.version
        for name, fn in CASES[:1] if '--first' in sys.argv else CASES:
            try:
                fn()
                assert not base.errors, base.errors
                results.append({'name':name, 'passed':True})
                print('PASS', name, flush=True)
            except Exception as exc:
                results.append({'name':name, 'passed':False, 'error':str(exc)})
                print('FAIL', name, '\n', str(exc), flush=True)
                if base.page:
                    base.page.screenshot(path=str(ARTIFACTS / f'icons-failure-{len(results):02}.png'), full_page=True)
        if base.context:
            base.context.close()
        base.browser.close()
    report = {'browser':'Chromium ' + version, 'loading':'set_content',
              'storage':'测试 Storage 适配器，非真实跨会话存储验证',
              'total':len(results), 'passed':sum(r['passed'] for r in results), 'results':results}
    suffix = '-red' if '--first' in sys.argv else ''
    (ARTIFACTS / f'column-icons-report{suffix}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"RESULT {report['passed']}/{report['total']} passed", flush=True)
    raise SystemExit(0 if report['passed'] == report['total'] else 1)
