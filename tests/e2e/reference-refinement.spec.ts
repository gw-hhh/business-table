import type { Page } from '@playwright/test'
import { test, expect } from './runtime'

const legacyURL = 'http://127.0.0.1:4173/reference/legacy-v3.1/quotation-manager-v3.1/index.html'
const comparisons: { name: string; old: string; current: string; properties: string[]; matchText?: string }[] = [
  { name: 'page title', old: '.page-title-row h1', current: '.q-title-row h1', properties: ['font-size', 'font-weight', 'color', 'letter-spacing', 'line-height'] },
  { name: 'breadcrumb', old: '.breadcrumb', current: '.q-breadcrumb', properties: ['font-size', 'color', 'margin-bottom'] },
  { name: 'query label', old: 'label[for="filter-keyword"]', current: 'label[for="quotation-keyword"]', properties: ['font-size', 'color'] },
  { name: 'query input', old: '#filter-keyword', current: '#quotation-keyword', properties: ['height', 'font-size', 'color', 'border-color', 'border-radius', 'padding-left'] },
  { name: 'page button', old: '#export-button', current: '.q-header-actions button[aria-label="导出"]', properties: ['height', 'font-size', 'color', 'border-color', 'border-radius'] },
  { name: 'customer subline', old: '.cell-customer', current: '.bt-cell-secondary', properties: ['color', 'line-height'] },
  { name: 'draft tag', old: '.status-neutral', current: '.bt-cell-map', matchText: '草稿', properties: ['color', 'background-color', 'border-radius'] },
  { name: 'contract tag', old: '.status-green', current: '.bt-cell-map', matchText: '已转合同', properties: ['color', 'background-color', 'border-radius'] },
  { name: 'footer summary', old: '.result-summary', current: '.q-result-summary', properties: ['color', 'font-size'] },
]
async function measure(page: Page, original: boolean) {
  const result: Record<string, Record<string, string>> = {}
  for (const item of comparisons) {
    const target = page.locator(original ? item.old : item.current)
    const element = (!original && item.matchText ? target.filter({ hasText: item.matchText }) : target).first()
    await expect(element, `${item.name} should remain visible`).toBeVisible()
    result[item.name] = await element.evaluate((element, properties) => {
      const style = getComputedStyle(element)
      return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]))
    }, item.properties)
  }
  return result
}
async function clickTableTool(page: Page, title: string) {
  const tool = page.getByRole('button', { name: title, exact: true })
  await expect(tool).toBeVisible()
  await tool.click()
}
async function expectDefaultState(page: Page) {
  const rows = page.locator('.vxe-table--main-wrapper .vxe-body--row')
  await expect(rows).toHaveCount(6)
  await expect(page.getByRole('button', { name: '保存与切换视图', exact: true })).toContainText('全部报价')
  await expect(page.getByRole('button', { name: '展开', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: '批量操作', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: '排序规则', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('combobox', { name: '每页条数' })).toHaveValue('10')
  await expect(page.locator('#quotation-customer')).toHaveValue('')
  await expect(page.locator('[data-business-table]')).toHaveClass(/bt--default/)
  expect((await rows.first().boundingBox())!.height).toBeCloseTo(61, 0)
  for (const name of ['模板下载', '导出', '新增报价']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  for (const name of ['列设置', '表格设置', '排序规则', '行高密度']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
}

for (const width of [1440, 390]) {
  test(`reference typography and component colors at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(legacyURL)
    await expect(page.locator('#table-body tr')).toHaveCount(6)
    const reference = await measure(page, true)
    await page.screenshot({ path: info.outputPath(`legacy-${width}.png`), fullPage: true })
    await page.goto('/')
    await expectDefaultState(page)
    const current = await measure(page, false)
    await page.mouse.move(0, 0)
    await page.screenshot({ path: info.outputPath(`vue-${width}.png`), fullPage: true })
    await info.attach('measured-styles', { body: JSON.stringify({ reference, current }, null, 2), contentType: 'application/json' })
    console.log('PARITY_STYLES', width, JSON.stringify({ reference, current }))
    for (const item of comparisons) {
      if (!current[item.name]) continue
      for (const property of item.properties) {
        expect.soft(current[item.name][property], `${item.name}: ${property}`).toBe(reference[item.name][property])
      }
    }
    await expect.soft(page.getByRole('heading', { name: '报价列表', exact: true })).toBeVisible()
  })
}

test('page actions support keyboard entry, arrow navigation, Tab and return focus', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: '更多页面操作', exact: true })
  await trigger.focus()
  await page.keyboard.press('ArrowDown')
  const menu = page.getByRole('menu', { name: '更多页面操作', exact: true })
  await expect(menu).toBeVisible()
  const items = menu.getByRole('menuitem')
  await expect(items.first()).toBeFocused()
  await page.keyboard.press('End')
  await expect(items.last()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(items.first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(items.last()).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(menu).toHaveCount(0)
  await expect(page.locator('#quotation-keyword')).toBeFocused()
})

test('density menu supports keyboard selection and returns focus', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: '行高密度', exact: true })
  await trigger.focus()
  await page.keyboard.press('ArrowDown')
  const menu = page.getByRole('menu', { name: '行高密度', exact: true })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitemradio', { name: '默认', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(menu.getByRole('menuitemradio').first()).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(page.locator('[data-business-table]')).toHaveClass(/bt--compact/)
  await page.keyboard.press('ArrowUp')
  await expect(menu.getByRole('menuitemradio', { name: '宽松', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(page.locator('[data-business-table]')).toHaveClass(/bt--comfortable/)
})

for (const width of [320, 768]) {
  test(`view popup and drawer remain reachable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.getByRole('button', { name: '保存与切换视图', exact: true }).click()
    const view = page.getByRole('dialog', { name: '我的视图', exact: true })
    await expect(view).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: info.outputPath(`view-${width}.png`), fullPage: true })
    await page.keyboard.press('Escape')
    await clickTableTool(page, '表格设置')
    const drawer = page.getByTestId('settings-drawer')
    await expect(drawer.getByRole('button', { name: '应用', exact: true })).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`drawer-${width}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}
