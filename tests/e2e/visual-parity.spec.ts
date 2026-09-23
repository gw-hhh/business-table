import type { Locator } from '@playwright/test'
import { test, expect } from './runtime'

// Product geometry comes from the legacy page and the six accepted reference
// screenshots at 1920 × 945. These checks do not depend on generated snapshots.
const desktop = { width: 1920, height: 945 }

async function expectBox(locator: Locator, expected: Partial<Record<'x' | 'y' | 'width' | 'height', number>>) {
  await expect(locator).toBeVisible()
  for (const [dimension, target] of Object.entries(expected)) {
    await expect.poll(async () => {
      const box = await locator.boundingBox()
      return box ? Math.abs(box[dimension as keyof typeof box] - target) : Number.POSITIVE_INFINITY
    }, { message: `${dimension} should match the legacy layout within one CSS pixel` }).toBeLessThanOrEqual(1)
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(desktop)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('[data-business-table]')).toContainText('Q20260914-0181')
})

test('quotation page restores the reference layout, density and footer', async ({ page }, testInfo) => {
  const card = page.locator('[data-business-table]')
  const mainTable = card.locator('.vxe-table--main-wrapper')
  const rows = mainTable.locator('.vxe-body--row')

  await expect(page.getByRole('heading', { name: '报价管理', exact: true })).toBeVisible()
  await expectBox(card, { x: 24, y: 96, width: 1872, height: 810 })
  await expectBox(mainTable.locator('.vxe-header--row').first(), { height: 44 })
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Q20260914-0181')
  await expect(rows.nth(1)).toContainText('Q20260914-0121')
  await expect(rows.nth(2)).toContainText('Q20260914-0001')
  await expectBox(rows.first(), { height: 73 })
  await expect(rows.first()).toContainText('化学品储罐监测')
  await expect(rows.first()).toContainText('澄川水务')
  await expect(rows.first()).toContainText('237,450.00')
  await expectBox(card.locator('.bt__footer'), { y: 848, height: 57 })
  await expect(card.locator('.bt__footer')).toContainText('376,510.00')
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
  await expect(page.getByRole('combobox', { name: '每页条数' })).toHaveValue('100')

  await testInfo.attach('quotation-desktop', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
})

test('row More is an unclipped menu and Escape restores focus', async ({ page }) => {
  const trigger = page.locator('[data-business-table]').getByRole('button', { name: '更多操作 Q20260914-0181', exact: true }).first()
  await trigger.click()
  const menu = page.getByRole('menu')
  await expectBox(menu, { width: 174 })
  await expect(menu.getByRole('menuitem', { name: '复制为草稿', exact: true })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '复制编号', exact: true })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '导出本条', exact: true })).toBeVisible()
  const remove = menu.getByRole('menuitem', { name: '删除', exact: true })
  await expect(remove).toBeVisible()
  await expect(remove).toBeInViewport()
  expect(await remove.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return target !== null && element.contains(target)
  }), 'the last menu item must be reachable above the table overflow boundary').toBe(true)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('page More retains the reference tools and closes on outside click', async ({ page }) => {
  const trigger = page.getByRole('button', { name: '更多页面操作', exact: true })
  await trigger.click()
  const menu = page.getByRole('menu')
  await expectBox(menu, { width: 250 })
  await expect(menu.getByText('备份报价数据（JSON）', { exact: true })).toBeVisible()
  await expect(menu.getByText('恢复报价备份', { exact: true })).toBeVisible()
  await expect(menu.getByText('恢复示例数据', { exact: true })).toBeVisible()
  await expect(menu.getByText('使用说明', { exact: true })).toBeVisible()
  await page.getByRole('heading', { name: '报价管理', exact: true }).click()
  await expect(menu).toHaveCount(0)
})

test('view popup restores the saved-view layout and applying a view changes the rows', async ({ page }) => {
  await page.getByRole('button', { name: '保存与切换视图', exact: true }).click()
  const popup = page.getByRole('dialog', { name: '我的视图', exact: true })
  await expectBox(popup, { width: 438 })
  await expect(popup.getByText('我负责的未结报价', { exact: true })).toBeVisible()
  await expect(popup.getByRole('button',{name:/^澄川水务专属/})).toBeVisible()
  await expect(popup.getByRole('button', { name: '更新当前视图', exact: true })).toBeVisible()
  await expect(popup.getByRole('button', { name: '另存为视图', exact: true })).toBeVisible()
  await popup.getByRole('button', { name: '全部报价', exact: true }).click()
  await expect(popup).toHaveCount(0)
  await expect(page.locator('[data-business-table] .vxe-table--main-wrapper .vxe-body--row')).toHaveCount(6)
  await expect(page.locator('[data-business-table]')).toContainText('泽临管道')
})

test('quick columns uses a draft and preserves the paired freeze controls', async ({ page }) => {
  const table = page.locator('[data-business-table] .vxe-table--main-wrapper')
  const ownerHeader = table.locator('.vxe-header--column').filter({ hasText: '负责人' })
  await expect(ownerHeader).toBeVisible()
  await page.getByTestId('column-settings').click()
  const panel = page.getByTestId('column-panel')
  await expectBox(panel, { width: 280 })
  await expect(panel.getByRole('checkbox', { name: '显示报价编号', exact: true })).toBeChecked()
  await expect(panel.getByRole('checkbox', { name: '显示报价编号', exact: true })).toBeEnabled()

  const left = panel.getByTitle('左冻结 项目名称 / 客户', { exact: true })
  const right = panel.getByTitle('右冻结 项目名称 / 客户', { exact: true })
  await panel.getByRole('checkbox', { name: '显示项目名称 / 客户', exact: true }).focus()
  await left.click()
  await expect(left).toHaveAttribute('aria-pressed', 'true')
  await right.click()
  await expect(right).toHaveAttribute('aria-pressed', 'true')
  await expect(left).toHaveAttribute('aria-pressed', 'false')
  await right.click()
  await expect(right).toHaveAttribute('aria-pressed', 'false')

  await panel.getByRole('checkbox', { name: '显示负责人', exact: true }).uncheck()
  await expect(ownerHeader).toBeVisible()
  await panel.getByRole('button', { name: '取消', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(ownerHeader).toBeVisible()
  await page.getByTestId('column-settings').click()
  await expect(panel.getByRole('checkbox', { name: '显示负责人', exact: true })).toBeChecked()
  await panel.getByRole('checkbox', { name: '显示负责人', exact: true }).uncheck()
  await panel.getByRole('button', { name: '确认', exact: true }).click()
  await expect(ownerHeader).toHaveCount(0)
})

test('full settings restores the drawer and applies a column draft only on confirmation', async ({ page }) => {
  const table = page.locator('[data-business-table] .vxe-table--main-wrapper')
  const header = () => table.locator('.vxe-header--column').filter({ hasText: '负责人' })
  await page.getByTestId('column-settings').click()
  await page.getByTestId('column-panel').getByRole('button', { name: '更多设置', exact: true }).click()
  const drawer = page.getByTestId('settings-drawer')
  await expectBox(drawer, { x: 880, y: 0, width: 1040, height: 945 })
  await expectBox(drawer.getByTestId('settings-preview'), { y: 657, height: 227 })
  expect(await drawer.locator('.bt-settings-tabs').evaluate(element => element.scrollHeight - element.clientHeight), 'desktop settings tabs must fit without a vertical scrollbar').toBeLessThanOrEqual(0)
  await expect(drawer.getByRole('button', { name: '应用', exact: true })).toBeDisabled()
  await drawer.getByRole('button', { name: '编辑列 负责人', exact: true }).click()
  await drawer.getByRole('textbox', { name: '显示名称', exact: true }).fill('负责同事')
  await expect(header()).toHaveCount(1)
  await expect(table.locator('.vxe-header--column').filter({ hasText: '负责同事' })).toHaveCount(0)
  await drawer.getByRole('button', { name: '取消', exact: true }).click()
  await expect(drawer).toHaveCount(0)
  await expect(header()).toHaveCount(1)

  await page.getByRole('button', { name: '表格设置', exact: true }).click()
  await drawer.getByRole('button', { name: '编辑列 负责人', exact: true }).click()
  await expect(drawer.getByRole('textbox', { name: '显示名称', exact: true })).toHaveValue('负责人')
  await drawer.getByRole('textbox', { name: '显示名称', exact: true }).fill('负责同事')
  await drawer.getByRole('button', { name: '应用', exact: true }).click()
  await expect(drawer).toHaveCount(0)
  await expect(table.locator('.vxe-header--column').filter({ hasText: '负责同事' })).toBeVisible()
})

test('narrow quotation and settings keep scrolling inside the content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await expect(page.getByRole('heading', { name: '报价管理', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByTestId('column-settings').click()
  const panel = page.getByTestId('column-panel')
  await expect(panel).toBeInViewport()
  await panel.getByRole('button', { name: '更多设置', exact: true }).click()
  const drawer = page.getByTestId('settings-drawer')
  await expect(drawer).toBeInViewport()
  const box = await drawer.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await expect(drawer.getByRole('button', { name: '取消', exact: true })).toBeInViewport()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('header text alignment is applied to the live table as well as the preview',async({page})=>{
  await page.getByTestId('table-settings').click()
  const drawer=page.getByTestId('settings-drawer')
  await drawer.getByRole('button',{name:'编辑列 负责人',exact:true}).click()
  const headerStyle=drawer.locator('section').filter({has:page.getByRole('heading',{name:'表头文字',exact:true})})
  await headerStyle.getByRole('button',{name:'表头文字右对齐',exact:true}).click()
  await drawer.getByRole('button',{name:'应用',exact:true}).click()
  const cell=page.locator('.vxe-table--main-wrapper .vxe-header--column').filter({hasText:'负责人'})
  await expect.poll(()=>cell.evaluate(element=>{
    const content=element.querySelector('.bt__sort')!
    return Math.abs(element.getBoundingClientRect().right-content.getBoundingClientRect().right-10)
  })).toBeLessThanOrEqual(1)
})
