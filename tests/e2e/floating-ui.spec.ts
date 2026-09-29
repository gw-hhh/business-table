import {openSettingsSections} from './settings-helpers'
import {test,expect} from './runtime'
import type {Locator} from '@playwright/test'

async function insideViewport(popup:Locator,width:number,height:number){
  await expect(popup).toBeVisible()
  await expect.poll(async()=>{
    const box=await popup.boundingBox()
    return !!box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1
  }).toBe(true)
}

test('views follow a moving anchor, stay inside a resized viewport and reopen cleanly',async({page})=>{
  await page.setViewportSize({width:1280,height:900})
  await page.goto('/')
  const trigger=page.getByRole('button',{name:'保存与切换视图',exact:true})
  await trigger.click()
  const popup=page.getByRole('dialog',{name:'我的视图',exact:true})
  await insideViewport(popup,1280,900)
  const before=(await popup.boundingBox())!
  // A host can move its toolbar without a window resize or remounting the popup.
  await trigger.evaluate(element=>{element.style.transform='translateX(60px)'})
  await expect.poll(async()=>(await popup.boundingBox())!.x).toBeCloseTo(before.x+60,0)
  await page.setViewportSize({width:390,height:560})
  await insideViewport(popup,390,560)
  await popup.getByRole('button',{name:'另存为视图',exact:true}).focus()
  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.evaluate(element=>{element.style.transform=''})
  await trigger.click();await insideViewport(popup,390,560)
  await page.getByRole('heading',{name:'报价管理',exact:true}).click()
  await expect(popup).toHaveCount(0)
})

test('row menu closes on table scroll and regains keyboard focus after reopening near the viewport edge',async({page})=>{
  await page.setViewportSize({width:1280,height:540})
  await page.goto('/')
  const trigger=page.getByRole('button',{name:/^更多操作 /}).first()
  await trigger.click()
  const popup=page.getByRole('menu',{name:'行操作',exact:true})
  await insideViewport(popup,1280,540)
  await page.locator('.vxe-table--main-wrapper .vxe-table--body-wrapper').evaluate(element=>element.dispatchEvent(new Event('scroll')))
  await expect(popup).toHaveCount(0)
  await trigger.focus();await page.keyboard.press('ArrowDown')
  await insideViewport(popup,1280,540)
  await expect(popup.getByRole('menuitem').first()).toBeFocused()
  const parent=popup.getByRole('menuitem',{name:'导出本条',exact:true})
  await parent.focus();await page.keyboard.press('ArrowRight')
  const child=page.getByRole('menu',{name:'导出本条',exact:true})
  await insideViewport(child,1280,540)
  const leaf=child.getByRole('menuitem',{name:'CSV',exact:true})
  expect(await leaf.evaluate(element=>{
    const box=element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2))
  })).toBe(true)
  await page.keyboard.press('Escape')
  await expect(child).toHaveCount(0)
  await expect(parent).toBeFocused()
  await expect(popup).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
})

test('the color palette stays inside the settings container and releases itself on external scroll',async({page})=>{
  await page.setViewportSize({width:1280,height:700})
  await page.goto('/')
  await page.getByRole('button',{name:'表格设置',exact:true}).click()
  const drawer=page.getByTestId('settings-drawer')
  await openSettingsSections(page,'表头文字')
  const color=drawer.locator('[data-color-picker="表头文字"]')
  const summary=color.locator('summary'),grid=color.locator('.bt-color-presets__grid')
  await summary.click()
  await expect(grid).toBeVisible()
  await expect.poll(async()=>{
    const box=await grid.boundingBox(),boundary=await drawer.locator('.bt-settings-detail').boundingBox()
    return !!box&&!!boundary&&box.y>=boundary.y&&box.y+box.height<=boundary.y+boundary.height+1
  }).toBe(true)
  await drawer.locator('.bt-settings-detail').evaluate(element=>element.dispatchEvent(new Event('scroll')))
  await expect(grid).toHaveCount(0)
  await summary.click()
  await color.getByRole('button',{name:'使用白色',exact:true}).click()
  await expect(color.getByRole('textbox',{name:'表头文字文字颜色',exact:true})).toHaveValue('#ffffff')
  await expect(summary).toBeFocused()
  await expect(grid).toHaveCount(0)
})
