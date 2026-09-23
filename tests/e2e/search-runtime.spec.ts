import { test, expect } from './runtime'

const rows = (page: import('@playwright/test').Page) => page.locator('.vxe-table--main-wrapper .vxe-body--row')

test('quotation Search keeps drafts separate and saves ID-based values in a View', async ({ page }) => {
  await page.goto('/')
  await expect(rows(page)).toHaveCount(3)
  await expect(page.locator('.q-modified')).toHaveCount(0)

  await page.locator('#quotation-customer').selectOption('泽临管道')
  await expect(page.getByText('条件已修改，点击查询生效')).toBeVisible()
  await expect(rows(page)).toHaveCount(3)
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(rows(page)).toHaveCount(1)
  await expect(page.locator('.q-filter-chip')).toHaveCount(1)

  await page.getByTitle('查询条件').click()
  await expect(page.locator('#quotation-customer')).toHaveCount(0)
  await expect(rows(page)).toHaveCount(1)
  await page.getByTitle('查询条件').click()

  await page.getByRole('button', { name: '保存与切换视图' }).click()
  await page.getByRole('button', { name: '另存为视图', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '另存为视图', exact: true })
  await editor.getByRole('textbox', { name: '视图名称' }).fill('泽临查询')
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.q-modified')).toHaveCount(0)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('business-table.quotation-demo.views.v1') ?? '[]') as { name: string; search?: { values: Record<string, unknown> }; filters?: unknown[] }[])
  const view = saved.find(item => item.name === '泽临查询')
  expect(view?.search?.values.customer).toBe('泽临管道')
  expect(view?.filters).toEqual([])

  await page.reload()
  await expect(rows(page)).toHaveCount(3)
  await page.getByRole('button', { name: '保存与切换视图' }).click()
  await page.getByRole('button', { name: '泽临查询', exact: true }).click()
  await expect(rows(page)).toHaveCount(1)
  await expect(page.locator('#quotation-customer')).toHaveValue('泽临管道')
  await expect(page.locator('.q-modified')).toHaveCount(0)
})

test('invalid date Search does not replace the applied query', async ({ page }) => {
  await page.goto('/')
  await expect(rows(page)).toHaveCount(3)
  await page.locator('#quotation-from').fill('2026-09-30')
  await page.locator('input[aria-label="创建结束日期"]').fill('2026-09-01')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('开始日期不能晚于结束日期')
  await expect(rows(page)).toHaveCount(3)
})
