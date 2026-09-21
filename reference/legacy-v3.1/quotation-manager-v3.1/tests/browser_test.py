"""浏览器交互回归：直接渲染离线单文件，无需启动服务。

此运行环境禁止 Chromium 的 file/HTTP 导航，所以用 set_content 装载相同 HTML。
带持久化的场景使用仅存在于测试中的 Storage 适配器；未模拟真实 HTTP/file 导航成功。
"""
from pathlib import Path
import csv
import io
import json
import os
import re
import shutil
import traceback
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests' / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
HTML = (ROOT / 'quotation-manager.html').read_text(encoding='utf-8')
CASES = []

def case(name):
    def register(function):
        CASES.append((name, function))
        return function
    return register

page = None
context = None
errors = []

def load(entries=None, mode='memory', width=1440, height=900, touch=False):
    global page, context, errors
    if context:
        context.close()
    context = browser.new_context(viewport={'width': width, 'height': height}, locale='zh-CN', timezone_id='Asia/Shanghai', accept_downloads=True, has_touch=touch)
    page = context.new_page()
    page.set_default_timeout(2500)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    if mode != 'native-unavailable':
        page.evaluate('''({entries, mode}) => {
          window.__testStorage = new Map(Object.entries(entries || {}));
          window.__testWriteFailure = mode === 'write-blocked';
          Object.defineProperty(window, 'localStorage', {configurable:true, value:{
            getItem(key) { return window.__testStorage.get(String(key)) ?? null; },
            setItem(key, value) { if(window.__testWriteFailure) throw new DOMException('storage full', 'QuotaExceededError'); window.__testStorage.set(String(key),String(value)); },
            removeItem(key) { window.__testStorage.delete(String(key)); },
            clear() { window.__testStorage.clear(); },
            key(index) { return [...window.__testStorage.keys()][index] ?? null; },
            get length() { return window.__testStorage.size; }
          }});
        }''', {'entries': entries, 'mode': mode})
    page.set_content(HTML, wait_until='load')
    expect(page.locator('#table-head th')).not_to_have_count(0)
    assert not errors, errors
    return page


def stored():
    return page.evaluate('Object.fromEntries(window.__testStorage.entries())')


def records():
    return page.evaluate("JSON.parse(localStorage.getItem('quotation-demo:data:v1')).rows")


def rows(count):
    expect(page.locator('#table-body tr[data-row-id]')).to_have_count(count)


def fresh_document():
    values = stored()
    load(values)


def close_dialog():
    page.locator('dialog[open]').last.get_by_role('button', name='关闭窗口', exact=True).click()


def create(name='新增回归项目', amount='100.29', customer='测试客户'):
    page.locator('#create-button').click()
    page.locator('#quote-name').fill(name)
    page.locator('#quote-customer').fill(customer)
    page.locator('#quote-region').select_option('华东')
    page.locator('#quote-amount').fill(amount)
    page.locator('#quote-save').click()
    expect(page.locator('dialog[open]')).to_have_count(0)


def many(count=31):
    page.evaluate('''count => {
        const payload=JSON.parse(localStorage.getItem('quotation-demo:data:v1'));
        const base=payload.rows[0];
        payload.rows=Array.from({length:count},(_,i)=>({...base,id:'T'+String(i+1).padStart(4,'0'),name:'分页报价 '+String(i+1),amountCents:(i+1)*100}));
        payload.revision++;
        localStorage.setItem('quotation-demo:data:v1',JSON.stringify(payload));
    }''', count)
    page.locator('#refresh-button').click()
    rows(min(count,10))


@case('初始记录、客户选项、汇总与离线资源')
def initial():
    load()
    rows(6)
    expect(page.locator('#amount-total')).to_have_text('¥ 1,026,450.00')
    expect(page.locator('#filter-customer option')).to_have_count(5)
    assert '临溪能源' in page.locator('#filter-customer').inner_text()
    assert not page.locator('script[src],link[rel="stylesheet"]').count()
    expect(page.locator('#storage-warning')).to_be_hidden()
    expect(page.locator('#page-buttons [aria-label="下一页"]')).to_be_disabled()


@case('关键词需要提交才生效，回车查询且忽略首尾空格')
def keyword():
    load()
    page.locator('#filter-keyword').fill(' q20260914-0001 ')
    rows(6)
    expect(page.locator('#query-pending')).to_be_visible()
    page.locator('#filter-keyword').press('Enter')
    rows(1)
    expect(page.locator('#query-pending')).to_be_hidden()
    assert page.locator('#filter-keyword').input_value() == 'q20260914-0001'


@case('高级筛选真实生效，日期首尾包含')
def advanced():
    load()
    page.locator('#advanced-button').click()
    page.locator('#filter-region').select_option('华东')
    page.locator('#filter-owner').select_option('林予安')
    page.locator('#filter-createdFrom').fill('2026-09-14')
    page.locator('#filter-createdTo').fill('2026-09-14')
    page.locator('#search-button').click()
    rows(3)
    expect(page.locator('#filter-chips .filter-chip')).to_have_count(4)
    page.locator('#reset-button').click()
    rows(6)
    assert page.locator('#filter-createdFrom').input_value() == ''
    assert page.locator('#filter-region').input_value() == ''


@case('错误日期范围显示错误，不替换已有结果')
def bad_dates():
    load()
    page.locator('#advanced-button').click()
    page.locator('#filter-createdFrom').fill('2026-09-20')
    page.locator('#filter-createdTo').fill('2026-09-01')
    page.locator('#search-button').click()
    expect(page.locator('#search-error')).to_contain_text('开始日期不能晚于结束日期')
    rows(6)


@case('三态排序在重新查询后仍然生效')
def sorting():
    load()
    sort = page.locator('[data-table-action="sort"][data-key="amountCents"]')
    sort.click()
    expect(page.locator('th[data-column="amountCents"]')).to_have_attribute('aria-sort','ascending')
    assert page.locator('tbody .money').all_text_contents()[0] == '63,860.00'
    sort.click()
    assert page.locator('tbody .money').all_text_contents()[0] == '237,450.00'
    page.locator('#filter-status').select_option('draft')
    page.locator('#search-button').click()
    assert page.locator('tbody .money').all_text_contents() == ['237,450.00','189,050.00','63,860.00']
    sort.click()
    expect(page.locator('th[data-column="amountCents"]')).to_have_attribute('aria-sort','none')


@case('新建记录、金额精确、刷新与新文档保留')
def creation():
    load()
    create()
    rows(7)
    new = records()[0]
    assert new['name'] == '新增回归项目' and new['amountCents'] == 10029
    assert new['id'].startswith('Q') and new['version'] == 1
    page.locator('#refresh-button').click()
    rows(7)
    fresh_document()
    rows(7)
    assert records()[0]['amountCents'] == 10029


@case('表单拒绝空项目和三位小数，不写入记录')
def validation():
    load()
    page.locator('#create-button').click()
    page.locator('#quote-save').click()
    expect(page.locator('#quote-error')).to_be_visible()
    assert len(records()) == 6
    page.locator('#quote-name').fill('金额校验')
    page.locator('#quote-customer').fill('测试客户')
    page.locator('#quote-region').select_option('华北')
    page.locator('#quote-amount').fill('1.234')
    page.locator('#quote-save').click()
    expect(page.locator('#quote-error')).to_contain_text('两位小数')
    assert len(records()) == 6


@case('未保存关闭确认与取消确认不丢失内容')
def unsaved():
    load()
    page.locator('#create-button').click()
    page.locator('#quote-name').fill('还未保存')
    page.keyboard.press('Escape')
    expect(page.locator('dialog[open]')).to_have_count(2)
    page.locator('dialog.modal').get_by_role('button',name='取消',exact=True).click()
    expect(page.locator('#quote-name')).to_have_value('还未保存')
    page.keyboard.press('Escape')
    page.locator('dialog.modal').get_by_role('button',name='放弃修改',exact=True).click()
    expect(page.locator('dialog[open]')).to_have_count(0)
    rows(6)


@case('对话框焦点约束与返回新增按钮')
def focus():
    load()
    page.locator('#create-button').click()
    expect(page.locator('#quote-name')).to_be_focused()
    for _ in range(20):
        page.keyboard.press('Tab')
        assert page.evaluate('!!document.activeElement.closest("dialog[open]")')
    page.keyboard.press('Escape')
    expect(page.locator('#create-button')).to_be_focused()


@case('修改记录、版本递增、不会生成重复编号')
def editing():
    load()
    item = records()[0]
    page.locator(f'[data-table-action="edit"][data-id="{item["id"]}"]').click()
    page.locator('#quote-name').fill('已修改项目')
    page.locator('#quote-amount').fill('0.29')
    page.locator('#quote-save').click()
    rows(6)
    edited = records()[0]
    assert edited['id'] == item['id'] and edited['name'] == '已修改项目'
    assert edited['amountCents'] == 29 and edited['version'] == 2
    assert edited['createdDate'] == item['createdDate']


@case('详情可打开，复制得到新编号与草稿')
def details_copy():
    load()
    original = records()[2]
    page.locator(f'.cell-id[data-table-action="detail"][data-id="{original["id"]}"]').click()
    expect(page.locator('dialog.drawer')).to_contain_text(original['name'])
    page.locator('dialog.drawer').get_by_role('button',name='复制报价',exact=True).click()
    expect(page.locator('#quote-status')).to_have_value('draft')
    page.locator('#quote-save').click()
    rows(7)
    assert records()[0]['id'] != original['id'] and records()[0]['status'] == 'draft'


@case('删除在查询、刷新及新文档后不复活')
def deletion():
    load()
    item=records()[0]
    page.locator(f'[data-row-more="{item["id"]}"]').click()
    page.locator('[data-menu-action="delete"]').click()
    page.locator('dialog').get_by_role('button',name='确认删除',exact=True).click()
    rows(5)
    page.locator('#search-button').click()
    rows(5)
    page.locator('#refresh-button').click()
    rows(5)
    fresh_document()
    assert item['id'] not in [row['id'] for row in records()]
    rows(5)


@case('真实分页、页码跳转与每页条数')
def pagination():
    load()
    many(31)
    page.locator('#page-buttons [aria-label="下一页"]').click()
    expect(page.locator('#page-info')).to_contain_text('第 11–20 条')
    assert page.locator('tbody tr[data-row-id]').first.get_attribute('data-row-id') == 'T0011'
    page.locator('#page-jump').fill('4')
    page.locator('#page-jump-form').get_by_role('button',name='跳转').click()
    rows(1)
    expect(page.locator('#page-info')).to_contain_text('第 31–31 条')
    page.locator('#page-size').select_option('25')
    rows(25)
    expect(page.locator('#page-info')).to_contain_text('第 1–25 条')


@case('全选仅当前页，跨页保留，半选计算准确')
def selection():
    load()
    many(31)
    page.locator('#batch-button').click()
    page.locator('[data-select-page]').check()
    expect(page.locator('#selected-count')).to_have_text('10')
    page.locator('#page-buttons [aria-label="下一页"]').click()
    expect(page.locator('[data-select-page]')).not_to_be_checked()
    page.locator('[data-select-row]').first.check()
    expect(page.locator('#selected-count')).to_have_text('11')
    assert page.locator('[data-select-page]').evaluate('(node)=>node.indeterminate')
    page.locator('[data-select-page]').check()
    expect(page.locator('#selected-count')).to_have_text('20')
    page.locator('[data-select-page]').uncheck()
    expect(page.locator('#selected-count')).to_have_text('10')
    page.locator('#page-buttons [aria-label="上一页"]').click()
    expect(page.locator('[data-select-page]')).to_be_checked()


@case('选择全部结果、批量删除、空态统计无残留')
def batch_delete():
    load()
    many(11)
    page.locator('#batch-button').click()
    page.locator('[data-select-row]').first.check()
    page.locator('#select-filtered-button').click()
    expect(page.locator('#selected-count')).to_have_text('11')
    page.locator('#batch-delete').click()
    page.locator('dialog').get_by_role('button',name='确认删除',exact=True).click()
    rows(0)
    expect(page.locator('#selection-bar')).to_be_hidden()
    expect(page.locator('#table-title')).to_be_visible()
    expect(page.locator('#table-body')).to_contain_text('暂无报价')
    expect(page.locator('#amount-total')).to_have_text('¥ 0.00')
    expect(page.locator('[data-select-page]')).to_be_disabled()
    assert records() == []


@case('查询空结果清空选择，退出批量模式同样清空')
def empty_selection():
    load()
    page.locator('#batch-button').click()
    page.locator('[data-select-row]').first.check()
    page.locator('#filter-keyword').fill('不存在的项目')
    page.locator('#search-button').click()
    rows(0)
    expect(page.locator('#selection-bar')).to_be_hidden()
    expect(page.locator('#table-body')).to_contain_text('没有找到符合条件的报价')
    page.locator('#reset-button').click()
    rows(6)
    page.locator('[data-select-row]').first.check()
    page.locator('#batch-button').click()
    expect(page.locator('[data-select-row]')).to_have_count(0)
    expect(page.locator('#selection-bar')).to_be_hidden()


@case('删除最后一页的唯一记录，页码自动回退')
def last_page_delete():
    load()
    many(11)
    page.locator('#page-buttons [aria-label="下一页"]').click()
    rows(1)
    page.locator('[data-row-more]').click()
    page.locator('[data-menu-action="delete"]').click()
    page.locator('dialog').get_by_role('button',name='确认删除',exact=True).click()
    rows(10)
    expect(page.locator('#page-info')).to_contain_text('第 1–10 条')


@case('列设置取消与点击外部均不应用，编号不可隐藏')
def columns_cancel():
    load()
    page.locator('#columns-button').click()
    expect(page.locator('[aria-label="显示报价编号"]')).to_be_disabled()
    page.locator('[aria-label="显示负责人"]').uncheck()
    page.locator('.popover').get_by_role('button',name='取消',exact=True).click()
    expect(page.locator('thead [data-column="owner"]')).to_have_count(1)
    page.locator('#columns-button').click()
    page.locator('[aria-label="显示负责人"]').uncheck()
    page.locator('h1').click()
    expect(page.locator('thead [data-column="owner"]')).to_have_count(1)


@case('列显示持久化、可全部隐藏可选列、可恢复默认')
def columns_apply():
    load()
    page.locator('#columns-button').click()
    # 半选时 checked 为 false；先点选全部再取消，确保实际触发 change。
    page.locator('[aria-label="显示全部可选列"]').check()
    page.locator('[aria-label="显示全部可选列"]').uncheck()
    page.locator('#columns-apply').click()
    expect(page.locator('#table-head th')).to_have_count(1)
    fresh_document()
    expect(page.locator('#table-head th')).to_have_count(1)
    page.locator('#columns-button').click()
    page.locator('.popover').get_by_role('button',name='恢复默认',exact=True).click()
    page.locator('#columns-apply').click()
    expect(page.locator('#table-head th')).to_have_count(7)


@case('列顺序通过拖动手柄的上下方向键移动')
def column_order():
    load()
    page.locator('#columns-button').click()
    page.locator('[data-drag="owner"]').focus()
    page.locator('[data-drag="owner"]').press('ArrowUp')
    page.locator('#columns-apply').click()
    keys = page.locator('#table-head [data-column]').evaluate_all('(nodes)=>nodes.map(node=>node.dataset.column)')
    assert keys.index('owner') < keys.index('status')


@case('拖动列排序真正生效')
def column_drag():
    load()
    page.locator('#columns-button').click()
    # 等弹层入场动画结束，避免 drag_to 在动画中滚动容器后错过源元素。
    page.locator('.popover').evaluate('(node)=>Promise.all(node.getAnimations().map(animation=>animation.finished))')
    page.locator('[data-drag="owner"]').drag_to(page.locator('[data-row-key="amountCents"]'))
    page.locator('#columns-apply').click()
    keys=page.locator('#table-head [data-column]').evaluate_all('(nodes)=>nodes.map(node=>node.dataset.column)')
    assert keys.index('owner') < keys.index('amountCents'), keys


@case('多个左右冻结列含选择列，水平滚动不重叠')
def pinning():
    load(width=1000)
    page.locator('#columns-button').click()
    page.locator('[data-row-key="owner"]').hover()
    page.locator('[data-row-key="owner"] [data-pin="left"]').click()
    page.locator('[data-row-key="amountCents"]').hover()
    page.locator('[data-row-key="amountCents"] [data-pin="right"]').click()
    page.locator('[data-row-key="date"]').hover()
    page.locator('[data-row-key="date"] [data-pin="right"]').click()
    page.locator('#columns-apply').click()
    page.locator('#batch-button').click()
    page.locator('#table-viewport').evaluate('(node)=>node.scrollLeft=300')
    metrics=page.evaluate('''() => {
      const pick=key=>document.querySelector('tbody [data-column="'+key+'"]');
      const id=pick('id'),owner=pick('owner'),amount=pick('amountCents'),date=pick('date'),actions=pick('actions');
      return {idLeft:id.style.left,ownerLeft:owner.style.left,amountRight:amount.style.right,dateRight:date.style.right,
      id:id.getBoundingClientRect().right,owner:owner.getBoundingClientRect().left,
      amount:amount.getBoundingClientRect().right,date:date.getBoundingClientRect().left,
      dateEnd:date.getBoundingClientRect().right,actions:actions.getBoundingClientRect().left};
    }''')
    assert metrics['idLeft']=='44px' and metrics['ownerLeft']=='238px',metrics
    assert abs(metrics['id']-metrics['owner'])<2,metrics
    assert abs(metrics['amount']-metrics['date'])<2,metrics
    assert abs(metrics['dateEnd']-metrics['actions'])<2,metrics


@case('拖动列宽、键盘调整和双击恢复')
def resizing():
    load()
    handle=page.locator('[data-resize="id"]')
    old=page.locator('th[data-column="id"]').bounding_box()['width']
    box=handle.bounding_box()
    x=box['x']+box['width']/2
    y=box['y']+box['height']/2
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+48,y,steps=5);page.mouse.up()
    assert abs(page.locator('th[data-column="id"]').bounding_box()['width']-old-48)<2
    handle.focus();handle.press('ArrowRight')
    assert abs(page.locator('th[data-column="id"]').bounding_box()['width']-old-58)<2
    handle.dblclick()
    assert abs(page.locator('th[data-column="id"]').bounding_box()['width']-old)<2


@case('密度高亮与持久化、菜单互斥和 Escape 关闭')
def density():
    load()
    original=page.locator('tbody tr').first.bounding_box()['height']
    page.locator('#density-button').click()
    page.locator('.popover').get_by_role('button',name='紧凑',exact=True).click()
    assert page.locator('tbody tr').first.bounding_box()['height'] < original
    fresh_document()
    expect(page.locator('#quote-table')).to_have_class(re.compile(r'.*\bdensity-compact\b.*'))
    page.locator('#density-button').click()
    expect(page.locator('.popover .is-current')).to_have_text('紧凑')
    page.locator('#columns-button').click()
    expect(page.locator('.popover')).to_have_count(1)
    page.keyboard.press('Escape')
    expect(page.locator('.popover')).to_have_count(0)
    expect(page.locator('#columns-button')).to_be_focused()


@case('我的未结视图真正按当前负责人过滤')
def mine():
    load()
    page.locator('#view-button').click()
    page.locator('.view-name-btn').filter(has_text='我负责的未结报价').click()
    rows(2)
    expect(page.locator('#filter-owner')).to_have_value('林予安')
    expect(page.locator('#filter-status')).to_have_value('open')
    assert all(text=='林予安' for text in page.locator('tbody [data-column="owner"]').all_text_contents())


@case('保存完整视图并设为默认，新文档恢复筛选和行高')
def view_snapshot():
    load()
    page.locator('#filter-customer').select_option('澄川水务')
    page.locator('#search-button').click()
    page.locator('#density-button').click()
    page.locator('.popover').get_by_role('button',name='紧凑',exact=True).click()
    page.locator('#page-size').select_option('25')
    page.locator('[data-table-action="sort"][data-key="amountCents"]').click()
    page.locator('#view-button').click()
    page.locator('.popover').get_by_role('button',name='另存为视图',exact=True).click()
    page.locator('#view-name-input').fill('澄川紧凑视图')
    page.locator('#view-save').click()
    expect(page.locator('#current-view-name')).to_have_text('澄川紧凑视图')
    expect(page.locator('#view-modified')).to_be_hidden()
    page.locator('#view-button').click()
    page.locator('[aria-label="将澄川紧凑视图设为默认"]').click()
    fresh_document()
    rows(3)
    expect(page.locator('#current-view-name')).to_have_text('澄川紧凑视图')
    expect(page.locator('#quote-table')).to_have_class(re.compile(r'.*\bdensity-compact\b.*'))
    expect(page.locator('#page-size')).to_have_value('25')
    expect(page.locator('th[data-column="amountCents"]')).to_have_attribute('aria-sort','ascending')


@case('未应用条件不能被悄悄保存为视图')
def unapplied_view():
    load()
    page.locator('#filter-keyword').fill('还未查询')
    page.locator('#view-button').click()
    page.locator('.popover').get_by_role('button',name='另存为视图',exact=True).click()
    expect(page.locator('dialog[open]')).to_have_count(0)
    expect(page.locator('#toast-host')).to_contain_text('先点击查询')
    rows(6)


@case('视图重命名、重复名称校验、删除不删除报价')
def view_rename_delete():
    load()
    page.locator('#view-button').click()
    page.locator('[aria-label="重命名澄川水务专属"]').click()
    page.locator('#view-name-input').fill('全部报价')
    page.locator('#view-save').click()
    expect(page.locator('#view-name-form .form-error')).to_contain_text('已被使用')
    page.locator('#view-name-input').fill('客户报价')
    page.locator('#view-save').click()
    page.locator('#view-button').click()
    page.locator('[aria-label="删除视图客户报价"]').click()
    page.locator('dialog').get_by_role('button',name='删除视图',exact=True).click()
    rows(6)
    page.locator('#view-button').click()
    expect(page.locator('.view-name-btn').filter(has_text='客户报价')).to_have_count(0)
    expect(page.locator('[aria-label="删除视图全部报价"]')).to_be_disabled()


@case('视图上下移动与拖动顺序生效')
def view_order():
    load()
    page.locator('#view-button').click()
    page.locator('[aria-label="下移我负责的未结报价"]').click()
    labels=page.locator('.view-name-text').all_text_contents()
    assert labels == ['全部报价','澄川水务专属','我负责的未结报价'], labels
    page.locator('[data-drag="mine"]').drag_to(page.locator('[data-row-key="customer"]'))
    labels=page.locator('.view-name-text').all_text_contents()
    assert labels == ['全部报价','我负责的未结报价','澄川水务专属'], labels


@case('更新当前视图覆盖快照，删除当前视图回退全部')
def update_view():
    load()
    page.locator('#view-button').click()
    page.locator('.view-name-btn').filter(has_text='澄川水务专属').click()
    page.locator('#filter-status').select_option('draft')
    page.locator('#search-button').click()
    expect(page.locator('#view-modified')).to_be_visible()
    page.locator('#view-button').click()
    page.locator('.popover').get_by_role('button',name='更新当前视图',exact=True).click()
    page.locator('dialog').get_by_role('button',name='更新视图',exact=True).click()
    expect(page.locator('#view-modified')).to_be_hidden()
    page.locator('#view-button').click()
    page.locator('[aria-label="删除视图澄川水务专属"]').click()
    page.locator('dialog').get_by_role('button',name='删除视图',exact=True).click()
    expect(page.locator('#current-view-name')).to_have_text('全部报价')
    rows(6)


@case('真实 CSV 下载包含 BOM 和全部查询结果')
def export_csv():
    load()
    page.locator('#export-button').click()
    page.locator('#export-format').select_option('csv')
    with page.expect_download(timeout=8000) as download_info:
        page.locator('#export-confirm').click()
    download=download_info.value
    target=ARTIFACTS/'export-test.csv'
    download.save_as(target)
    raw=target.read_bytes()
    assert raw.startswith(b'\xef\xbb\xbf')
    content=list(csv.reader(io.StringIO(raw.decode('utf-8-sig'))))
    assert len(content)==7 and content[1][0]=='Q20260914-0001'
    assert content[1][3]=='63860.00' and '客户' in content[0]


@case('导出选中记录不混入其他记录')
def export_selected():
    load()
    many(11)
    page.locator('#batch-button').click()
    page.locator('[data-select-row]').first.check()
    page.locator('#page-buttons [aria-label="下一页"]').click()
    page.locator('[data-select-row]').first.check()
    page.locator('#batch-export').click()
    page.locator('#export-format').select_option('csv')
    with page.expect_download(timeout=8000) as event:
        page.locator('#export-confirm').click()
    target=ARTIFACTS/'selected-test.csv'
    event.value.save_as(target)
    content=list(csv.reader(io.StringIO(target.read_text(encoding='utf-8-sig'))))
    assert len(content)==3 and {row[0] for row in content[1:]}=={'T0001','T0011'}


@case('项目名称和备注作为文本显示，不执行 HTML')
def xss():
    load()
    payload='<img src=x onerror="window.__xss=1">'
    create(name=payload,customer='<svg onload="window.__xss=2">')
    assert page.evaluate('window.__xss') is None
    expect(page.locator('#table-body img,#table-body svg[onload]')).to_have_count(0)
    expect(page.locator('.cell-name').first).to_have_text(payload)
    page.locator('[data-table-action="detail"]').first.click()
    assert page.evaluate('window.__xss') is None
    expect(page.locator('dialog .detail-hero h3')).to_have_text(payload)


@case('危险公式文本在实际导出中被中和')
def formula_export():
    load()
    create(name='=1+1',customer='@SUM(1)')
    page.locator('#export-button').click()
    page.locator('#export-format').select_option('csv')
    with page.expect_download(timeout=8000) as event:
        page.locator('#export-confirm').click()
    target=ARTIFACTS/'formula-test.csv'
    event.value.save_as(target)
    content=list(csv.reader(io.StringIO(target.read_text(encoding='utf-8-sig'))))
    assert content[1][1]=="'=1+1" and content[1][2]=="'@SUM(1)"


@case('JSON 备份为实际下载，恢复需确认并整批替换')
def backup_restore():
    load()
    page.locator('#more-button').click()
    with page.expect_download() as event:
        page.locator('.popover').get_by_role('button',name='备份报价数据（JSON）',exact=True).click()
    target=ARTIFACTS/'backup-test.json'
    event.value.save_as(target)
    data=json.loads(target.read_text())
    assert data['app']=='quotation-demo' and len(data['rows'])==6
    data['rows']=data['rows'][:2]
    page.locator('#restore-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(data,ensure_ascii=False).encode()})
    page.locator('dialog').get_by_role('button',name='确认替换',exact=True).click()
    rows(2)
    fresh_document()
    rows(2)


@case('非法备份与重复编号被拒绝，不更改已有数据')
def invalid_restore():
    load()
    payload={'app':'quotation-demo','schemaVersion':1,'rows':[records()[0],records()[0]]}
    page.locator('#restore-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(payload).encode()})
    expect(page.locator('#toast-host')).to_contain_text('报价编号重复')
    rows(6)
    assert len(records())==6


@case('浏览器存储禁用仍可操作，明确提示临时模式')
def unavailable():
    load(mode='native-unavailable')
    rows(6)
    expect(page.locator('#mode-badge')).to_have_text('临时模式')
    expect(page.locator('#storage-warning')).to_contain_text('存储不可用')
    create()
    rows(7)
    page.locator('#refresh-button').click()
    rows(7)


@case('首次存储写入失败不会白屏')
def first_write_failure():
    load(mode='write-blocked')
    rows(6)
    expect(page.locator('#mode-badge')).to_have_text('临时模式')
    create()
    rows(7)


@case('损坏缓存保留原内容，切换临时模式')
def corrupt():
    load({'quotation-demo:data:v1':'{broken'})
    rows(6)
    expect(page.locator('#mode-badge')).to_have_text('临时模式')
    assert stored()['quotation-demo:data:v1']=='{broken'


@case('写入失败时抽屉保留内容，仓库数据不变')
def save_failure():
    load()
    page.locator('#create-button').click()
    page.locator('#quote-name').fill('不应丢失的草稿')
    page.locator('#quote-customer').fill('测试')
    page.locator('#quote-region').select_option('华东')
    page.locator('#quote-amount').fill('12.30')
    page.evaluate('window.__testWriteFailure=true')
    page.locator('#quote-save').click()
    expect(page.locator('#quote-error')).to_contain_text('保存失败')
    expect(page.locator('#quote-name')).to_have_value('不应丢失的草稿')
    assert len(records())==6


@case('过期编辑无法覆盖其他页面更新')
def stale_edit():
    load()
    item=records()[0]
    page.locator('[data-table-action="edit"]').first.click()
    page.locator('#quote-name').fill('过期提交')
    page.evaluate('''() => {
      const data=JSON.parse(localStorage.getItem('quotation-demo:data:v1'));
      data.rows[0].name='其他页面修改';data.rows[0].version++;data.revision++;
      localStorage.setItem('quotation-demo:data:v1',JSON.stringify(data));
      window.dispatchEvent(new StorageEvent('storage',{key:'quotation-demo:data:v1'}));
    }''')
    page.locator('#quote-save').click()
    expect(page.locator('#quote-error')).to_contain_text('刷新')
    assert records()[0]['name']=='其他页面修改'
    expect(page.locator('#external-warning')).to_be_visible()


@case('移动端 390px 无页面横向溢出，表格单独滚动')
def mobile():
    load(width=390,height=844)
    assert page.evaluate('document.documentElement.scrollWidth===innerWidth')
    assert page.locator('#table-viewport').evaluate('(node)=>node.scrollWidth>node.clientWidth')
    page.locator('#columns-button').click()
    rect=page.locator('.popover').bounding_box()
    assert rect['x']>=0 and rect['x']+rect['width']<=390
    page.keyboard.press('Escape')
    page.locator('#create-button').click()
    # 等待真实入场动画结束，避免 translateX 的浮点矩形被读成 390.000011px。
    page.locator('dialog.drawer').evaluate('(node)=>Promise.all(node.getAnimations().map(a=>a.finished.catch(()=>{})))')
    rect=page.locator('dialog.drawer').bounding_box()
    assert rect['width']<=390 and rect['height']<=844, rect


@case('320px 与平板宽度布局不溢出')
def widths():
    for width in [320,768,1024]:
        load(width=width,height=900)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.locator('#advanced-button').click()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width


@case('隐藏查询后仍展示有效条件，快捷键定位查询')
def query_collapse():
    load()
    page.locator('#filter-status').select_option('draft')
    page.locator('#search-button').click()
    page.locator('#search-toggle-button').click()
    expect(page.locator('#search-form')).to_be_hidden()
    expect(page.locator('#filter-summary')).to_be_visible()
    page.locator('h1').click()
    page.keyboard.press('/')
    expect(page.locator('#search-form')).to_be_visible()
    expect(page.locator('#filter-keyword')).to_be_focused()


@case('实际页面截图：桌面、详情、列设置和移动端')
def screenshots():
    load(width=1500,height=900)
    page.screenshot(path=str(ARTIFACTS/'desktop.png'),full_page=True,animations='disabled')
    page.locator('[data-table-action="detail"]').first.click()
    page.wait_for_timeout(180)
    page.screenshot(path=str(ARTIFACTS/'detail.png'),full_page=True,animations='disabled')
    page.keyboard.press('Escape')
    page.locator('#create-button').click()
    page.wait_for_timeout(180)
    page.screenshot(path=str(ARTIFACTS/'editor.png'),full_page=True,animations='disabled')
    page.keyboard.press('Escape')
    page.locator('#columns-button').click()
    page.wait_for_timeout(120)
    page.screenshot(path=str(ARTIFACTS/'columns.png'),full_page=True,animations='disabled')
    page.keyboard.press('Escape')
    page.locator('#view-button').click()
    page.screenshot(path=str(ARTIFACTS/'views.png'),full_page=True,animations='disabled')
    page.keyboard.press('Escape')
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(ARTIFACTS/'mobile.png'),full_page=True,animations='disabled')


if __name__=='__main__':
    results=[]
    with sync_playwright() as playwright:
        executable=os.getenv('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
        browser=playwright.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox'] if getattr(os,'geteuid',lambda:1)()==0 else [])
        version=browser.version
        for index,(name,function) in enumerate(CASES,1):
            try:
                function()
                assert not errors, errors
                results.append({'name':name,'passed':True})
                print(f'PASS {index:02d} {name}',flush=True)
            except Exception as error:
                results.append({'name':name,'passed':False,'error':str(error),'traceback':traceback.format_exc()})
                print(f'FAIL {index:02d} {name}\n{error}',flush=True)
                if page:
                    try:page.screenshot(path=str(ARTIFACTS/f'failure-{index:02d}.png'),full_page=True,animations='disabled')
                    except Exception:pass
        if context:context.close()
        browser.close()
    report={'browser':'Chromium '+version,'loading':'set_content；HTTP/file 导航在当前环境被策略阻止',
            'storage':'持久化场景使用测试 Storage 适配器；同时覆盖原生存储不可用情形',
            'total':len(results),'passed':sum(item['passed'] for item in results),'results':results}
    (ARTIFACTS/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f"RESULT {report['passed']}/{report['total']} passed",flush=True)
    raise SystemExit(0 if report['passed']==report['total'] else 1)
