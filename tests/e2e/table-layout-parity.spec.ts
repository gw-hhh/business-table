import type { Page } from '@playwright/test'
import { test, expect } from './runtime'

// The reference archive is served only by Vite dev and is excluded from the Demo build.
const legacyPath = 'http://127.0.0.1:4173/reference/legacy-v3.1/quotation-manager-v3.1/index.html'
const mainHead = '.vxe-table--main-wrapper .vxe-header--column'
async function widths(page: Page, legacy = false) {
  const cells = page.locator(legacy ? '#table-head th' : mainHead)
  await expect(cells).toHaveCount(7)
  return cells.evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().width)))
}
async function expectFilled(page: Page) {
  await expect.poll(() => page.locator('.bt__viewport').evaluate(element => {
    const header = element.querySelector('.vxe-table--main-wrapper .vxe-table--header-wrapper')!
    const columns = [...header.querySelectorAll('th')]
    return Math.abs(columns.reduce((total, column) => total + column.getBoundingClientRect().width, 0) - header.clientWidth)
  })).toBeLessThanOrEqual(1)
}

test('column widths fill both reference desktop sizes and recalculate on container resize', async ({ page }) => {
  const reference: Record<number, number[]> = {}
  await page.setViewportSize({ width: 1440, height: 945 })
  await page.goto(legacyPath)
  reference[1440] = await widths(page, true)
  await page.setViewportSize({ width: 1920, height: 945 })
  await expect.poll(async () => (await widths(page, true))[1]).toBe(917)
  reference[1920] = await widths(page, true)
  await page.goto('/')
  for (const width of [1920, 1440, 1920]) {
    await page.setViewportSize({ width, height: 945 })
    await expect.poll(() => widths(page)).toEqual(reference[width])
    await expectFilled(page)
  }
})

test('resizing and hiding columns redistribute free space without saving expanded widths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 945 })
  await page.goto('/')
  const owner = page.getByRole('separator', { name: '调整负责人列宽', exact: true })
  await owner.focus()
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight')
  await expect.poll(() => widths(page)).toEqual([194, 397, 180, 112, 160, 136, 196])
  await page.getByRole('button', { name: '列设置', exact: true }).click()
  await page.getByRole('checkbox', { name: '显示项目名称 / 客户', exact: true }).uncheck()
  await page.getByTestId('column-panel').getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.locator(mainHead)).toHaveCount(6)
  await expectFilled(page)
  expect(await page.locator(mainHead).nth(1).evaluate(element => element.getBoundingClientRect().width)).toBe(577)
  await page.reload()
  await expect(page.locator(mainHead)).toHaveCount(6)
  await expectFilled(page)
  await page.getByRole('button', { name: '表格设置', exact: true }).click()
  const drawer = page.getByTestId('settings-drawer')
  await drawer.getByRole('button', { name: '编辑列 项目名称 / 客户', exact: true }).click()
  await expect(drawer.getByRole('spinbutton', { name: '列宽（px）', exact: true })).toHaveValue('280')
  await drawer.getByRole('button', { name: '编辑列 负责人', exact: true }).click()
  await expect(drawer.getByRole('spinbutton', { name: '列宽（px）', exact: true })).toHaveValue('160')
})

test('vertical and horizontal scrolling retain the reference header and both fixed edges', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 520 })
  await page.goto(legacyPath)
  await expect(page.locator('#table-body tr')).toHaveCount(6)
  const reference = await page.locator('.table-viewport').evaluate(element => {
    element.scrollTop = 150; element.scrollLeft = 150
    const cells = [...element.querySelectorAll('th')]
    return cells.map(cell => ({ x: cell.getBoundingClientRect().x, y: cell.getBoundingClientRect().y, width: cell.getBoundingClientRect().width }))
  })
  await page.goto('/')
  await expect(page.locator('.vxe-table--main-wrapper .vxe-body--row')).toHaveCount(6)
  const viewport = page.locator('.bt__viewport')
  // Rows render before the async action column; wait for the intended scroll range before sending input.
  await expect.poll(() => viewport.locator('.vxe-table--main-wrapper .vxe-table--body-inner-wrapper').evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThanOrEqual(150)
  await viewport.hover()
  await page.mouse.wheel(150, 150)
  await expect.poll(() => viewport.locator('.vxe-table--main-wrapper .vxe-table--body-inner-wrapper').evaluate(element => element.scrollTop)).toBeGreaterThanOrEqual(100)
  await expect.poll(() => viewport.locator('.vxe-table--main-wrapper .vxe-table--body-inner-wrapper').evaluate(element => element.scrollLeft)).toBeGreaterThanOrEqual(100)
  const left = viewport.locator('.vxe-table--fixed-left-wrapper .vxe-header--column').first()
  const right = viewport.locator('.vxe-table--fixed-right-wrapper .vxe-header--column').last()
  for (const [cell, target] of [[left, reference[0]!], [right, reference.at(-1)!]] as const) {
    await expect.poll(async () => {
      const box = await cell.boundingBox()
      return box ? Math.max(Math.abs(box.x - target.x), Math.abs(box.y - target.y), Math.abs(box.width - target.width)) : Infinity
    }).toBeLessThanOrEqual(1)
  }
  await expect.poll(async () => Math.abs((await viewport.locator('.vxe-table--main-wrapper .vxe-table--header-wrapper').boundingBox())!.y - reference[0]!.y)).toBeLessThanOrEqual(1)
  const fixedRow = viewport.locator('.vxe-table--fixed-left-wrapper .vxe-body--row').nth(3)
  const centerRow = viewport.locator('.vxe-table--main-wrapper .vxe-body--row').nth(3)
  await expect.poll(async () => Math.abs((await fixedRow.boundingBox())!.y - (await centerRow.boundingBox())!.y)).toBeLessThanOrEqual(1)
  expect(await viewport.evaluate(element => element.scrollTop), 'the outer frame must not scroll the table header away').toBe(0)
})

test('height-only resizing keeps a keyboard-scrollable viewport with a stationary header', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 945 })
  await page.goto('/')
  const viewport = page.locator('.bt__viewport')
  const body = viewport.locator('.vxe-table--main-wrapper .vxe-table--body-inner-wrapper')
  await expect(page.locator('.vxe-table--main-wrapper .vxe-body--row')).toHaveCount(6)
  await page.setViewportSize({ width: 1100, height: 520 })
  await expect.poll(() => body.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(150)
  const headerY = (await viewport.locator('.vxe-table--main-wrapper .vxe-table--header-wrapper').boundingBox())!.y
  await viewport.focus()
  await page.keyboard.press('PageDown')
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThanOrEqual(100)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => body.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  await page.keyboard.press('Home')
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBe(0)
  expect((await viewport.locator('.vxe-table--main-wrapper .vxe-table--header-wrapper').boundingBox())!.y).toBe(headerY)
  await expect(viewport).toBeFocused()
})

test('overflow within the reserved vertical gutter does not consume an extra horizontal scrollbar row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(legacyPath)
  await expect(page.locator('#table-body tr')).toHaveCount(6)
  const referenceBodyHeight = await page.locator('.table-viewport').evaluate(element => element.clientHeight - element.querySelector('thead')!.getBoundingClientRect().height)
  await page.goto('/')
  const viewport = page.locator('.bt__viewport')
  const body = viewport.locator('.vxe-table--main-wrapper .vxe-table--body-inner-wrapper')
  await expect(page.locator('.vxe-table--main-wrapper .vxe-body--row')).toHaveCount(6)
  // Match the other geometry checks: system font metrics can shift the page frame by 1 CSS pixel.
  await expect.poll(async () => Math.abs(await body.evaluate(element => element.clientHeight) - referenceBodyHeight)).toBeLessThanOrEqual(1)
  // Independently check this page's height budget so the parity tolerance cannot hide a lost scrollbar row.
  await expect.poll(() => viewport.evaluate(element => {
    const header = element.querySelector<HTMLElement>('.vxe-table--main-wrapper .vxe-table--header-wrapper')!
    const content = element.querySelector<HTMLElement>('.vxe-table--main-wrapper .vxe-table--body-inner-wrapper')!
    return Math.abs(element.clientHeight - header.clientHeight - content.clientHeight)
  })).toBeLessThanOrEqual(1)
  await expect.poll(() => viewport.locator('.vxe-table--scroll-x-virtual').evaluate(element => element.getBoundingClientRect().height)).toBe(0)
  await viewport.hover()
  await page.mouse.wheel(0, 100)
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
})
