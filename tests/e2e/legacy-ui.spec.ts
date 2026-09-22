import { test, expect } from './runtime'

const legacy = 'http://127.0.0.1:4173/reference/legacy-v3.1/quotation-manager-v3.1/index.html'

test('matches legacy control size, font and header height', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(legacy)
  await expect(page.locator('#table-body tr')).toHaveCount(6)
  const reference = await page.locator('#filter-keyword').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    font: getComputedStyle(element).fontSize,
  }))
  const headerHeight = await page.locator('#table-head').evaluate(element => element.getBoundingClientRect().height)
  await page.screenshot({ path: info.outputPath('legacy-1440.png'), fullPage: true })
  await page.goto('/')
  await expect(page.locator('.vxe-body--row').first()).toBeVisible()
  await page.screenshot({ path: info.outputPath('vue-1440.png'), fullPage: true })
  const input = page.getByRole('searchbox').first().or(page.locator('.bt__search').first()).first()
  const actual = await input.evaluate(element => ({ height: element.getBoundingClientRect().height, font: getComputedStyle(element).fontSize }))
  expect(actual.height).toBe(reference.height)
  expect(actual.font).toBe(reference.font)
  const actualHeader = await page.locator('.vxe-header--row').first().evaluate(element => element.getBoundingClientRect().height)
  expect(Math.abs(actualHeader - headerHeight)).toBeLessThanOrEqual(1)
})

test('shows the legacy quotation page hierarchy and all six seed records', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '报价管理', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '报价列表', exact: true })).toBeVisible()
  await expect(page.getByText('销售管理', { exact: true })).toBeVisible()
  for (const id of ['Q20260914-0001', 'Q20260914-0181', 'Q20260914-0121', 'Q20260912-0051', 'Q20260912-0013', 'Q20260912-0002']) {
    await expect(page.getByText(id, { exact: true }).first()).toBeVisible()
  }
  await expect(page.getByLabel('客户', { exact: true })).toBeVisible()
  await expect(page.getByLabel('状态', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('quotation-page.png'), fullPage: true })
})

test('column draft cancel restores applied state and returns keyboard focus', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByTestId('column-settings')
  await trigger.click()
  const panel = page.getByTestId('column-panel')
  const visible = panel.locator('input[type="checkbox"]').first()
  const label = await visible.getAttribute('aria-label')
  await visible.uncheck()
  await panel.getByRole('button', { name: '取消', exact: true }).click()
  await expect(panel).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(panel.getByLabel(label!, { exact: true })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(panel).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('density changes actual row height without resizing feedback', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '行高', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '紧凑', exact: true }).click()
  const compact = await page.locator('.vxe-body--row').first().evaluate(element => element.getBoundingClientRect().height)
  await page.getByRole('button', { name: '行高', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '宽松', exact: true }).click()
  await expect.poll(() => page.locator('.vxe-body--row').first().evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(compact)
  const heights = await page.locator('.vxe-table').first().evaluate(async element => {
    const values: number[] = []
    for (let frame = 0; frame < 15; frame++) { await new Promise(requestAnimationFrame); values.push(element.getBoundingClientRect().height) }
    return values
  })
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
})

for (const width of [320, 390, 768, 1440]) {
  test(`keeps ordinary content inside a ${width}px viewport`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.locator('.vxe-body--row').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '表格设置', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`vue-${width}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.getByRole('button', { name: '表格设置', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '表格设置', exact: true })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('button', { name: '应用', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`settings-${width}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible()
  })
}
