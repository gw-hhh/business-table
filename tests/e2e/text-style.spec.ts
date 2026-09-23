import type { Locator } from '@playwright/test'
import { test, expect } from './runtime'

async function expectTextToFit(locator: Locator) {
  const metrics = await locator.evaluate(element => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const text = range.getBoundingClientRect(), box = element.getBoundingClientRect(), cell = element.closest('td')!.getBoundingClientRect()
    return { top: text.top - box.top, bottom: box.bottom - text.bottom, overflow: element.scrollHeight - element.clientHeight, cellTop: text.top - cell.top, cellBottom: cell.bottom - text.bottom }
  })
  expect(metrics.top, 'the top of the text must not be clipped').toBeGreaterThanOrEqual(-1)
  expect(metrics.bottom, 'the bottom of the text must not be clipped').toBeGreaterThanOrEqual(-1)
  expect(metrics.overflow, 'the text should grow its line box').toBeLessThanOrEqual(1)
  expect(metrics.cellTop, 'the text must fit within the top of the cell').toBeGreaterThanOrEqual(0)
  expect(metrics.cellBottom, 'the text must fit within the bottom of the cell').toBeGreaterThanOrEqual(0)
}

test('quotation cell font sizes apply to project and status in the preview and live table', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 945 })
  await page.goto('/')
  const table = page.locator('.vxe-table--main-wrapper')
  const projectCell = table.locator('.bt-business-cell').filter({has: page.locator('.bt-cell-secondary')}).first()
  const project = projectCell.locator('.bt-cell-primary')
  const secondary = projectCell.locator('.bt-cell-secondary')
  const status = table.locator('.bt-cell-map').first()
  await expect(project).toHaveCSS('font-size', '14px')
  await expect(secondary).toHaveCSS('font-size', '12px')
  await expect(project).toHaveCSS('line-height', '22px')
  await expect(secondary).toHaveCSS('line-height', '18px')
  await expect(status).toHaveCSS('font-size', '14px')
  expect((await table.locator('.vxe-body--row').first().boundingBox())!.height).toBe(61)

  for (const size of [20, 32]) {
    await page.getByRole('button', { name: '表格设置', exact: true }).click()
    const drawer = page.getByTestId('settings-drawer')
    const preview = drawer.getByTestId('settings-preview')
    await drawer.getByRole('button', { name: '编辑列 项目名称 / 客户', exact: true }).click()
    await drawer.getByRole('combobox', { name: '单元格文字字号', exact: true }).selectOption(String(size))
    await expect(preview.locator('.bt-cell-primary')).toHaveCSS('font-size', `${size}px`)
    await expectTextToFit(preview.locator('.bt-cell-primary'))
    await expectTextToFit(preview.locator('.bt-cell-secondary'))

    await drawer.getByRole('button', { name: '编辑列 状态', exact: true }).click()
    await drawer.getByRole('combobox', { name: '单元格文字字号', exact: true }).selectOption(String(size))
    await expect(preview.locator('.bt-cell-map')).toHaveCSS('font-size', `${size}px`)
    await expectTextToFit(preview.locator('.bt-cell-map'))
    await drawer.getByRole('button', { name: '应用', exact: true }).click()
    await expect(drawer).toHaveCount(0)

    await expect(project).toHaveCSS('font-size', `${size}px`)
    await expect(status).toHaveCSS('font-size', `${size}px`)
    await expectTextToFit(project)
    await expectTextToFit(secondary)
    await expectTextToFit(status)
  }
})
