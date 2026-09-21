"""新增表格设置交互检查。沿用原有测试装载器，所有业务逻辑运行真实代码。"""
import json, os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import browser_test as base
CASES=[]
def case(name):
    def register(fn): CASES.append((name,fn)); return fn
    return register
@case('完整设置入口和四个设置页')
def initial_settings():
    page=base.load()
    expect(page.locator('#settings-button')).to_have_count(1)
    page.locator('#settings-button').click()
    expect(page.locator('dialog.settings-drawer')).to_be_visible()
    expect(page.locator('[role="tab"]')).to_have_count(5)
    for tab in ['columns','sorts','actions','appearance','toolbar']:expect(page.locator('#settings-tab-'+tab)).to_have_count(1)
@case('预览没有空节点字面量，实际操作焦点键唯一')
def clean_dom():
    page=base.load()
    keys=page.locator('#quote-table [data-focus]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.focus)')
    assert len(keys)==len(set(keys)), '同一表格内的焦点标识重复'
    page.locator('#settings-button').click()
    assert 'null' not in page.locator('.settings-preview').inner_text()

# Additional behavioral cases for the approved customization scope.
import csv, io, re, zipfile
from xml.etree import ElementTree as ET
NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def layout():
    return base.page.evaluate("JSON.parse(localStorage.getItem('quotation-demo:preferences:v1')).data.layout")
def settings(tab='columns',key=None):
    p=base.page;p.locator('#settings-button').click()
    if tab!='columns':p.locator(f'#settings-tab-{tab}').click()
    if key:p.locator(f'[data-column-select="{key}"]').click()
    return p

def apply():
    base.page.locator('#settings-apply').click()
    expect(base.page.locator('dialog.settings-drawer')).to_have_count(0)

def column(key):return next(c for c in layout()['columns'] if c['key']==key)
def download_after(click,name):
    with base.page.expect_download(timeout=8000) as event:click()
    path=base.ARTIFACTS/name;event.value.save_as(path);assert not event.value.failure();return path

def xlsx(path):
    z=zipfile.ZipFile(path);assert z.testzip() is None
    for name in z.namelist():
        if name.endswith('.xml') or name.endswith('.rels'):ET.fromstring(z.read(name))
    return z

def sheet_value(z,cell,sheet=1):
    n=ET.fromstring(z.read(f'xl/worksheets/sheet{sheet}.xml')).find(f"s:sheetData/s:row/s:c[@r='{cell}']",NS)
    if n is None:return None
    return n.findtext('s:is/s:t',namespaces=NS) if n.get('t')=='inlineStr' else n.findtext('s:v',namespaces=NS)

@case('列名与字体修改仅在预览生效；取消不写入')
def cancel_column():
    p=base.load();before=base.stored();settings(key='amountCents')
    p.locator('#setting-column-label').fill('报价金额')
    p.locator('#setting-body-size').select_option('18')
    expect(p.locator('.settings-preview')).to_contain_text('报价金额')
    expect(p.locator('#table-head')).not_to_contain_text('报价金额')
    p.locator('#settings-cancel').click();assert base.stored()==before

@case('独立表头和内容字体、字号、颜色、字重、对齐持久化')
def column_styles():
    p=base.load();settings(key='amountCents')
    p.locator('#setting-column-label').fill('报价金额')
    for part,size,align,color in [('header','16','center','#112233'),('body','18','left','#aa2233')]:
        p.locator(f'#setting-{part}-size').select_option(size)
        p.locator(f'[data-for="setting-{part}-align"][data-value="{align}"]').click()
        p.locator(f'#setting-{part}-color').fill(color)
        p.locator(f'#setting-{part}-family').select_option('mono')
        p.locator(f'#setting-{part}-weight').select_option('600')
    apply();td=p.locator('#table-body td[data-column="amountCents"]').first
    expect(td).to_have_css('font-size','18px');expect(td).to_have_css('color','rgb(170, 34, 51)');expect(td).to_have_css('text-align','left')
    th=p.locator('#table-head th[data-column="amountCents"]');expect(th).to_have_css('text-align','center');expect(th).to_have_css('font-size','16px')
    assert column('amountCents')['body']['family']=='mono'
    base.fresh_document();expect(base.page.locator('#table-head')).to_contain_text('报价金额');assert column('amountCents')['body']['size']==18

@case('列名为空、重名与颜色格式不合法时保留草稿')
def invalid_columns():
    p=base.load();settings();before=base.stored()
    for name,message in [('', '列名需要'),('报价编号','列名重复')]:
        p.locator('#setting-column-label').fill(name);p.locator('#settings-apply').click();expect(p.locator('.settings-error')).to_contain_text(message)
    p.locator('#setting-column-label').fill('项目');p.locator('#setting-body-color').fill('#abc');p.locator('#settings-apply').click();expect(p.locator('.settings-error')).to_contain_text('颜色')
    assert base.stored()==before

@case('关闭未应用设置先确认，取消确认后保留输入')
def settings_dirty_escape():
    p=base.load();settings();p.locator('#setting-column-label').fill('临时别名');p.keyboard.press('Escape')
    expect(p.locator('dialog[open]')).to_have_count(2)
    p.locator('dialog').last.get_by_role('button',name='取消',exact=True).click();expect(p.locator('#setting-column-label')).to_have_value('临时别名')
    p.keyboard.press('Escape');p.locator('dialog').last.get_by_role('button',name='放弃修改',exact=True).click()
    expect(p.locator('dialog')).to_have_count(0);expect(p.locator('#table-head')).not_to_contain_text('临时别名')

@case('金额和日期格式只改变显示，不修改原始数据')
def display_formats():
    p=base.load();data=base.records();settings(key='amountCents');p.locator('#setting-decimals').select_option('0');p.locator('#setting-thousands').uncheck()
    p.locator('[data-column-select="date"]').click();p.locator('#setting-date-format').select_option('slash');apply()
    expect(p.locator('#table-body [data-column="amountCents"] .cell-main').first).to_have_text('63860')
    expect(p.locator('#table-body [data-column="date"] .cell-main').first).to_have_text('2026/11/02');assert base.records()==data

@case('项目客户副标题可隐藏；长文本换行生效')
def wrapping_subtitle():
    p=base.load();settings();p.locator('#setting-show-customer').uncheck();p.locator('#setting-wrap').select_option('two');apply()
    expect(p.locator('#table-body .cell-customer')).to_have_count(0)
    expect(p.locator('#table-body [data-column="name"] .cell-main').first).to_have_css('-webkit-line-clamp','2')

@case('复制内容入口与手动复制回退均可到达')
def copy_values():
    p=base.load();settings(key='owner');p.locator('#setting-copyable').check();apply()
    p.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('blocked'))}});document.execCommand=()=>false")
    p.locator('#table-body [data-column="owner"]').first.hover();p.locator('#table-body [data-column="owner"] [aria-label="复制负责人"]').first.click()
    expect(p.locator('dialog textarea')).to_have_value('林予安')

@case('批量应用只复制所选列的文字样式')
def batch_styles():
    p=base.load();settings(key='name');p.locator('#setting-body-size').select_option('18')
    p.get_by_label('选择负责人用于批量样式',exact=True).check();p.locator('#apply-bulk-style').click();apply()
    assert column('name')['body']['size']==18 and column('owner')['body']['size']==18 and column('date')['body']['size']==0

@case('恢复单列与恢复设置分组不修改其他配置')
def partial_reset():
    p=base.load();settings(key='owner');p.locator('#setting-column-label').fill('跟进人');p.locator('#settings-tab-appearance').click();p.locator('#appearance-striped').check();apply()
    settings(key='owner');p.locator('#reset-current-column').click();apply();assert column('owner')['label']=='负责人' and layout()['appearance']['striped']

@case('快捷面板更多设置沿用未确认的冻结草稿')
def quick_to_full():
    p=base.load();p.locator('#columns-button').click();p.locator('[data-row-key="owner"]').hover();p.locator('[data-row-key="owner"] [data-pin="left"]').click();p.locator('#columns-more-settings').click()
    p.locator('[data-column-select="owner"]').click();expect(p.locator('[data-detail-pin="left"]')).to_have_attribute('aria-pressed','true')
    p.locator('#settings-cancel').click();assert p.locator('#table-head [data-column="owner"]').evaluate('(n)=>n.style.left')==''

@case('表头右键可重命名和冻结，编号字段保持稳定')
def header_menu():
    p=base.load();p.locator('#table-head [data-column="owner"]').click(button='right');p.get_by_role('menuitem',name='重命名列',exact=True).click()
    p.locator('#rename-column-input').fill('跟进人');p.locator('dialog').get_by_role('button',name='保存',exact=True).click();assert column('owner')['label']=='跟进人'
    p.locator('#table-head [data-column="owner"]').click(button='right');p.get_by_role('menuitem',name='冻结在左侧',exact=True).click();assert column('owner')['pin']=='left'

@case('多字段排序按优先级作用于全部查询结果')
def multisort():
    p=base.load();p.locator('#sort-settings-button').click();p.locator('#add-sort-rule').click()
    p.locator('.sort-rule').nth(0).locator('select').nth(0).select_option('createdDate');p.locator('.sort-rule').nth(0).locator('select').nth(1).select_option('desc')
    p.locator('#add-sort-rule').click();p.locator('.sort-rule').nth(1).locator('select').nth(0).select_option('amountCents');p.locator('.sort-rule').nth(1).locator('select').nth(1).select_option('desc');apply()
    assert layout()['sorts']==[{'key':'createdDate','order':'desc'},{'key':'amountCents','order':'desc'}]
    ids=p.locator('#table-body tr[data-row-id]').evaluate_all('(ns)=>ns.map(n=>n.dataset.rowId)');assert ids[:3]==['Q20260914-0181','Q20260914-0121','Q20260914-0001']
    base.fresh_document();assert base.page.locator('#table-body tr').first.get_attribute('data-row-id')=='Q20260914-0181'

@case('排序规则可上移删除，关闭列排序会移除已有规则')
def sorting_toggle():
    p=base.load();p.locator('[data-table-action="sort"][data-key="amountCents"]').click();settings(key='amountCents');p.locator('#setting-column-sortable').uncheck();apply()
    assert layout()['sorts']==[];expect(p.locator('th[data-column="amountCents"] .sort-button')).to_have_count(0)
    p.locator('#sort-settings-button').click();p.locator('#add-sort-rule').click();p.locator('#add-sort-rule').click();p.locator('.sort-rule').nth(1).get_by_label('上移排序规则',exact=True).click()
    p.locator('.sort-rule').nth(0).get_by_label('删除排序规则',exact=True).click();apply();assert len(layout()['sorts'])==1

@case('旧版列宽、冻结与单字段排序自动迁移')
def legacy_preferences():
    old={'schemaVersion':1,'layout':{'columns':[{'key':'owner','visible':True,'pin':'left','width':137}],'sort':{'key':'amountCents','order':'desc'},'density':'compact','pageSize':25}}
    p=base.load({'quotation-demo:preferences:v1':json.dumps({'schemaVersion':1,'data':old})});expect(p.locator('#table-body tr').first).to_have_attribute('data-row-id','Q20260914-0181')
    settings();expect(p.locator('#settings-apply')).to_be_disabled();p.locator('#setting-column-label').fill('迁移后项目名称');apply();assert column('owner')['width']==137 and column('owner')['pin']=='left' and layout()['schemaVersion']==3

@case('默认行内查看修改，更多含复制、导出子菜单和删除')
def default_actions():
    p=base.load();row=p.locator('#table-body tr').first
    assert row.locator('.action-button').all_text_contents()==['查看','修改']
    row.locator('[data-row-more]').click();assert p.locator('[role="menuitem"]').all_text_contents()==['复制为草稿','复制编号','导出本条','删除']
    expect(p.locator('[data-menu-action="delete"]')).to_have_css('color','rgb(220, 53, 69)')

@case('操作按钮可更名、隐藏和改为图标加文字')
def action_options():
    p=base.load();settings('actions');p.get_by_label('detail按钮名称').fill('详情');p.locator('#action-detail-mode').select_option('both');p.locator('#action-edit-placement').select_option('hidden');apply()
    row=p.locator('#table-body tr').first;expect(row.locator('.action-button')).to_have_count(1);expect(row.locator('.action-button')).to_contain_text('详情');expect(row.locator('.action-button svg')).to_have_count(1)
    row.locator('[data-row-more]').click();expect(p.locator('[data-menu-action="edit"]')).to_have_count(0)

@case('行内数量、按钮顺序与菜单隐藏持久化')
def action_order():
    p=base.load();settings('actions');p.locator('[data-action-rule="edit"]').get_by_label('上移修改',exact=True).click();p.locator('#action-copy-placement').select_option('inline');p.locator('#action-copyId-placement').select_option('hidden');p.locator('#setting-max-inline').select_option('3')
    p.locator('#settings-tab-columns').click();p.locator('[data-column-select="actions"]').click();p.locator('#setting-column-width').fill('420');apply()
    assert p.locator('#table-body tr').first.locator('.action-button').all_text_contents()==['修改','查看','复制为草稿']
    base.fresh_document();assert layout()['actions']['items'][0]['id']=='edit'

@case('行内全部收起与窄列自动收起，不发生按钮裁切')
def action_overflow():
    p=base.load();settings('actions');p.locator('#setting-max-inline').select_option('4');p.locator('#action-copy-placement').select_option('inline');p.locator('#setting-action-mode').select_option('both')
    p.locator('#settings-tab-columns').click();p.locator('[data-column-select="actions"]').click();p.locator('#setting-column-width').fill('112');apply()
    assert p.locator('#table-body tr').first.locator('.action-button').count()<3
    assert p.locator('#table-body tr').first.locator('.custom-actions').evaluate('(n)=>n.scrollWidth<=n.clientWidth+1')
    settings('actions');p.locator('#setting-max-inline').select_option('0');apply();expect(p.locator('#table-body .action-button')).to_have_count(0)
    p.locator('[data-row-more]').first.click();expect(p.locator('[data-menu-action="detail"]')).to_be_visible()

@case('导出子菜单显隐与顺序可设置，危险名称不可改')
def action_children():
    p=base.load();settings('actions');expect(p.get_by_label('delete按钮名称')).to_be_disabled();p.locator('#action-child-xlsx').uncheck();apply()
    p.locator('[data-row-more]').first.click();p.locator('[data-menu-action="export"]').click();expect(p.locator('[data-menu-depth="1"] [role="menuitem"]')).to_have_count(1);expect(p.locator('[data-menu-action="export-csv"]')).to_be_visible()

@case('二级菜单键盘进入返回，Escape 回到原始按钮')
def keyboard_menu():
    p=base.load();more=p.locator('[data-row-more]').first;more.click();p.locator('[data-menu-action="export"]').focus();p.keyboard.press('ArrowRight')
    expect(p.locator('[data-menu-action="export-xlsx"]')).to_be_focused();p.keyboard.press('ArrowDown');expect(p.locator('[data-menu-action="export-csv"]')).to_be_focused()
    p.keyboard.press('Escape');expect(p.locator('[data-menu-action="export"]')).to_be_focused();p.keyboard.press('Escape');expect(more).to_be_focused();expect(p.locator('.q-menu')).to_have_count(0)

@case('行菜单挂在表格外，末行菜单不超出视口')
def menu_position():
    p=base.load(height=660);p.locator('[data-row-more]').last.click();menu=p.locator('[data-menu-depth="0"]');r=menu.bounding_box();assert 0<=r['y'] and r['y']+r['height']<=660
    assert not menu.evaluate('(n)=>!!n.closest(".table-viewport")')

@case('外观开关和序号与冻结偏移协调')
def appearance():
    p=base.load();settings('appearance');p.locator('#appearance-striped').check();p.locator('#appearance-row-numbers').check();p.locator('#appearance-borders').select_option('all');p.locator('#appearance-hover').uncheck();p.locator('#appearance-size').select_option('16');apply()
    p.locator('#batch-button').click();expect(p.locator('#quote-table')).to_have_class(re.compile('.*is-striped.*no-hover.*borders-all.*'))
    expect(p.locator('#table-body .number-cell').first).to_have_text('1')
    assert p.locator('#table-head [data-column="id"]').evaluate('(n)=>n.style.left')=='92px'
    expect(p.locator('#table-body [data-column="owner"]').first).to_have_css('font-size','16px')

@case('新配置随命名视图保存，切换和重开可完整恢复')
def new_view_snapshot():
    p=base.load();settings(key='amountCents');p.locator('#setting-column-label').fill('报价金额');p.locator('#setting-body-size').select_option('18');p.locator('#settings-tab-actions').click();p.locator('#action-copyId-placement').select_option('hidden');p.locator('#settings-tab-appearance').click();p.locator('#appearance-striped').check();apply()
    p.locator('#view-button').click();p.locator('.popover').get_by_role('button',name='另存为视图',exact=True).click();p.locator('#view-name-input').fill('个性表格');p.locator('#view-save').click()
    p.locator('#view-button').click();p.get_by_label('将个性表格设为默认',exact=True).click();p.keyboard.press('Escape')
    settings();p.locator('#reset-all-settings').click();apply();expect(p.locator('#view-modified')).to_be_visible()
    base.fresh_document();p=base.page;expect(p.locator('#table-head')).to_contain_text('报价金额');expect(p.locator('#quote-table')).to_have_class(re.compile('.*is-striped.*'));expect(p.locator('#table-body [data-column="amountCents"]').first).to_have_css('font-size','18px');p.locator('[data-row-more]').first.click();expect(p.locator('[data-menu-action="copyId"]')).to_have_count(0)

@case('设置备份不含报价，恢复先进入草稿再应用')
def settings_backup():
    p=base.load();settings(key='owner');p.locator('#setting-column-label').fill('跟进人');p.locator('#settings-tab-appearance').click()
    file=download_after(lambda:p.locator('#export-settings').click(),'custom-settings-backup.json');payload=json.loads(file.read_text());assert 'rows' not in payload and payload['app']=='quotation-table-settings';data=base.records()
    p.locator('#settings-cancel').click();settings('appearance');p.locator('#settings-import-file').set_input_files(file)
    p.locator('dialog').last.get_by_role('button',name='恢复设置',exact=True).click();expect(p.locator('#table-head')).not_to_contain_text('跟进人');apply()
    assert column('owner')['label']=='跟进人' and base.records()==data

@case('报价备份不能当成表格设置备份，非法文件不覆盖')
def settings_wrong_backup():
    p=base.load();settings('appearance');before=base.stored();p.locator('#settings-import-file').set_input_files({'name':'wrong.json','mimeType':'application/json','buffer':b'{"app":"quotation-demo","schemaVersion":1,"rows":[]}'})
    expect(p.locator('.settings-error')).to_contain_text('不是当前版本');assert before==base.stored()

@case('设置写入失败仍可本页使用，但提示未持久化')
def settings_storage_failure():
    p=base.load();p.evaluate('window.__testWriteFailure=true');settings(key='owner');p.locator('#setting-column-label').fill('跟进人');apply()
    expect(p.locator('#table-head')).to_contain_text('跟进人');expect(p.locator('#toast-host')).to_contain_text('未保存到本地')

@case('真实 Excel 下载通过 ZIP 校验，保留数值日期与文本类型')
def xlsx_download():
    p=base.load();p.locator('#export-button').click();file=download_after(lambda:p.locator('#export-confirm').click(),'browser-export.xlsx');z=xlsx(file)
    assert sheet_value(z,'A2')=='Q20260914-0001' and float(sheet_value(z,'D2'))==63860 and float(sheet_value(z,'H2'))>40000
    assert '报价列表' in z.read('xl/workbook.xml').decode()

@case('自定义字段与列名、样式、合计和说明写入 Excel')
def styled_xlsx():
    p=base.load();settings(key='amountCents');p.locator('#setting-column-label').fill('报价金额');p.locator('#setting-body-color').fill('#aa2233');p.locator('#setting-body-size').select_option('18');apply()
    p.locator('#export-button').click();p.locator('#export-use-aliases').check();p.locator('#export-current-style').check();p.locator('#export-total').check();p.locator('#export-metadata').check()
    file=download_after(lambda:p.locator('#export-confirm').click(),'browser-styled.xlsx');z=xlsx(file)
    assert sheet_value(z,'D1')=='报价金额';assert 'FFAA2233' in z.read('xl/styles.xml').decode().upper();assert 'SUM(D2:D7)' in z.read('xl/worksheets/sheet1.xml').decode();assert '导出说明' in z.read('xl/workbook.xml').decode()

@case('导出字段可调整顺序，取消全部字段禁止提交')
def export_fields():
    p=base.load();p.locator('#export-button').click();p.locator('#export-format').select_option('csv')
    p.get_by_label('上移导出字段项目名称',exact=True).click()
    for k in ['customer','amountCents','status','owner','region','createdDate','date','remark']:p.locator(f'[data-export-field="{k}"]').uncheck()
    file=download_after(lambda:p.locator('#export-confirm').click(),'browser-fields.csv');values=list(csv.reader(io.StringIO(file.read_text(encoding='utf-8-sig'))));assert values[0]==['项目名称','报价编号'] and len(values)==7
    p.locator('#export-button').click()
    for k in ['id','name','customer','amountCents','status','owner','region','createdDate','date','remark']:p.locator(f'[data-export-field="{k}"]').uncheck()
    expect(p.locator('#export-confirm')).to_be_disabled()

@case('导出方案保存与重开恢复字段和文件格式')
def export_presets():
    p=base.load();p.locator('#export-button').click();p.locator('#export-format').select_option('csv');p.locator('[data-export-field="remark"]').uncheck();p.locator('#export-use-aliases').check();p.locator('#export-preset-name').fill('财务字段');p.locator('#save-export-preset').click();expect(p.locator('.export-status')).to_contain_text('已保存')
    p.locator('dialog').get_by_role('button',name='取消',exact=True).click();base.fresh_document();p=base.page;p.locator('#export-button').click();p.locator('#export-preset').select_option('财务字段');expect(p.locator('#export-format')).to_have_value('csv');expect(p.locator('[data-export-field="remark"]')).not_to_be_checked()

@case('导出当前页与行内单条导出范围正确')
def export_scope_single():
    p=base.load();base.many(11);p.locator('#page-buttons [aria-label="下一页"]').click();p.locator('#export-button').click();p.locator('input[name="export-scope"][value="page"]').check();file=download_after(lambda:p.locator('#export-confirm').click(),'browser-page.xlsx');z=xlsx(file);assert sheet_value(z,'A2')=='T0011' and sheet_value(z,'A3') is None
    p.locator('[data-row-more]').click();p.locator('[data-menu-action="export"]').click();file=download_after(lambda:p.locator('[data-menu-action="export-csv"]').click(),'browser-single.csv');values=list(csv.reader(io.StringIO(file.read_text(encoding='utf-8-sig'))));assert len(values)==2 and values[1][0]=='T0011'

@case('空白和带示例模板为真实 XLSX，字段不跟随个人别名')
def templates():
    p=base.load();settings(key='amountCents');p.locator('#setting-column-label').fill('个人金额');apply();p.locator('#template-button').click()
    blank=download_after(lambda:p.locator('#download-blank-template').click(),'browser-template-blank.xlsx');sample=download_after(lambda:p.locator('#download-example-template').click(),'browser-template-example.xlsx')
    for f in [blank,sample]:
        z=xlsx(f);assert sheet_value(z,'A2') is None;assert sheet_value(z,'D1')!='个人金额';assert 'dataValidations' in z.read('xl/worksheets/sheet1.xml').decode()
    z=xlsx(sample);assert '示例' in z.read('xl/workbook.xml').decode();assert sheet_value(z,'A2',3)=='Q20260914-0001'

@case('320px、390px 和平板设置可操作且不横向溢出')
def mobile_settings():
    for width in [320,390,768]:
        p=base.load(width=width,height=844,touch=True);settings();
        assert p.locator('dialog.settings-drawer').evaluate('(n)=>n.scrollWidth<=n.clientWidth+1')
        for tab in ['actions','sorts','appearance','columns']:
            p.locator(f'#settings-tab-{tab}').click();expect(p.locator('#settings-apply')).to_be_visible()
            assert p.locator('.settings-content').evaluate('(n)=>n.scrollWidth<=n.clientWidth+1'), (width,tab)
        p.locator('#setting-column-label').fill('手机项目');apply();expect(p.locator('#table-head')).to_contain_text('手机项目')

@case('设置分类键盘切换，Tab 不离开对话框')
def settings_keyboard():
    p=base.load();settings();p.locator('#settings-tab-columns').focus();p.keyboard.press('ArrowRight');expect(p.locator('#settings-tab-sorts')).to_be_focused();expect(p.locator('#add-sort-rule')).to_be_visible()
    p.locator('#settings-cancel').focus();p.keyboard.press('Tab');assert p.evaluate('!!document.activeElement.closest("dialog.settings-drawer")')

@case('生成桌面、完整设置、操作菜单、导出和移动端截图')
def screenshots():
    p=base.load(width=1500,height=940);p.screenshot(path=str(base.ARTIFACTS/'custom-desktop.png'),full_page=True,animations='disabled')
    settings(key='amountCents');p.locator('#setting-column-label').fill('报价金额');p.locator('#setting-body-size').select_option('16');p.locator('#setting-body-weight').select_option('600');p.locator('#setting-body-color').fill('#2056ad');p.locator('.column-detail').evaluate('(n)=>n.scrollTop=180');p.screenshot(path=str(base.ARTIFACTS/'custom-settings.png'),full_page=True,animations='disabled')
    p.locator('#settings-tab-actions').click();p.screenshot(path=str(base.ARTIFACTS/'custom-actions-settings.png'),full_page=True,animations='disabled');p.locator('#settings-cancel').click()
    p.locator('[data-row-more]').first.click();p.locator('[data-menu-action="export"]').click();p.screenshot(path=str(base.ARTIFACTS/'custom-menu.png'),full_page=True,animations='disabled');p.keyboard.press('Escape');p.keyboard.press('Escape')
    p.locator('#export-button').click();p.screenshot(path=str(base.ARTIFACTS/'custom-export.png'),full_page=True,animations='disabled')
    p=base.load(width=390,height=844,touch=True);settings();p.screenshot(path=str(base.ARTIFACTS/'custom-mobile-settings.png'),full_page=True,animations='disabled')

@case('状态字号与字重可调整，但业务状态颜色不被普通颜色覆盖')
def status_style():
    p=base.load();settings(key='status');p.locator('#setting-body-size').select_option('18');p.locator('#setting-body-weight').select_option('600');p.locator('#setting-body-color').fill('#ff0000');apply()
    badge=p.locator('#table-body .status-pill').first;expect(badge).to_have_css('font-size','18px');expect(badge).to_have_css('font-weight','600');assert badge.evaluate('(n)=>getComputedStyle(n).color')!='rgb(255, 0, 0)'

@case('滚动表格后操作菜单关闭，不留下脱离行的浮层')
def menu_close_on_scroll():
    p=base.load(height=660);p.locator('[data-row-more]').first.click();expect(p.locator('.q-menu')).to_have_count(1)
    p.locator('#table-viewport').evaluate('(n)=>n.scrollTop=100');expect(p.locator('.q-menu')).to_have_count(0)

@case('调整导出子菜单顺序在更多菜单中生效')
def child_order():
    p=base.load();settings('actions');p.locator('[data-action-rule="export"]').get_by_label('上移CSV',exact=True).click();apply()
    p.locator('[data-row-more]').first.click();p.locator('[data-menu-action="export"]').click();assert p.locator('[data-menu-depth="1"] [role="menuitem"]').all_text_contents()==['CSV','Excel (.xlsx)']

@case('默认桌面列宽完整显示表头，菜单入口不挤掉列名')
def default_header_labels():
    p=base.load(width=1500,height=940)
    labels=p.locator('#table-head .sort-button > span:first-child').evaluate_all('(nodes)=>nodes.map(n=>({text:n.textContent,width:n.clientWidth,needed:n.scrollWidth}))')
    assert all(x['needed'] <= x['width']+1 for x in labels), labels

if __name__=='__main__':
    result=[]
    with sync_playwright() as pw:
        base.browser=pw.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
        version=base.browser.version
        for name,fn in CASES:
            if os.getenv('TEST_MATCH') and os.getenv('TEST_MATCH') not in name: continue
            try:
                fn();assert not base.errors,base.errors
                result.append({'name':name,'passed':True});print('PASS',name,flush=True)
            except Exception as e:
                result.append({'name':name,'passed':False,'error':str(e),'traceback':__import__('traceback').format_exc()});print('FAIL',name,str(e),flush=True)
        if base.context:base.context.close()
        base.browser.close()
    report={'browser':'Chromium '+version,'total':len(result),'passed':sum(r['passed'] for r in result),'results':result}
    (base.ARTIFACTS/'customization-browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    raise SystemExit(0 if report['total']==report['passed'] else 1)
