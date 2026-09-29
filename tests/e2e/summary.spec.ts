import {test,expect} from './runtime'
import {openSettingsSections} from './settings-helpers'
import type {Page} from '@playwright/test'

async function openSummarySettings(page:Page){
  await page.getByRole('button',{name:'表格设置',exact:true}).click()
  const drawer=page.getByTestId('settings-drawer')
  await drawer.getByRole('tab',{name:'表格外观',exact:true}).click()
  await openSettingsSections(drawer,'底部汇总')
  return drawer
}

test('summary settings apply, persist disabling after reload, and restore the numeric field',async({page})=>{
  await page.goto('/')
  await expect(page.locator('.q-result-summary')).toContainText('筛选合计：')
  const drawer=await openSummarySettings(page)
  await expect(drawer.getByRole('combobox',{name:'汇总列',exact:true})).toHaveValue('amount')
  await drawer.getByRole('checkbox',{name:'启用底部汇总',exact:true}).uncheck()
  await drawer.getByRole('button',{name:'应用',exact:true}).click()
  await expect(page.locator('.q-result-summary .bt-summary-result')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.q-result-summary')).toContainText('共 6 条')
  await expect(page.locator('.q-result-summary .bt-summary-result')).toHaveCount(0)
  const reopened=await openSummarySettings(page)
  await expect(reopened.getByRole('checkbox',{name:'启用底部汇总',exact:true})).not.toBeChecked()
  await reopened.getByRole('checkbox',{name:'启用底部汇总',exact:true}).check()
  await reopened.getByRole('combobox',{name:'汇总列',exact:true}).selectOption('amount')
  await reopened.getByRole('button',{name:'应用',exact:true}).click()
  await expect(page.locator('.q-result-summary')).toContainText('筛选合计：')
  await expect(page.locator('.q-result-summary')).not.toContainText('计算中')
})

test('summary follows selected records and restores the query total when selection clears',async({page})=>{
  await page.goto('/')
  const summary=page.locator('.q-result-summary .bt-summary-result')
  await expect(summary).toContainText('筛选合计：')
  await expect(summary).not.toContainText('计算中')
  const before=await summary.textContent()
  await page.getByRole('button',{name:'批量操作',exact:true}).click()
  await page.getByRole('checkbox',{name:'选择 Q20260914-0001',exact:true}).first().check()
  await expect(summary).toContainText('所选合计：')
  await page.getByRole('button',{name:'取消选择',exact:true}).click()
  await expect(summary).toHaveText(before!)
})
