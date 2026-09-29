import {test,expect} from './runtime'

test('bounded virtual rows preserve multiline data, selection and reach the last record',async({page},testInfo)=>{
  test.setTimeout(90000)
  const samples:Record<string,unknown>[]=[]
  for(const [count,virtual,paged] of [[1000,false,false],[1000,true,false],[10000,true,false],[10000,true,true]] as const){
    const start=Date.now()
    await page.goto(`/?example=performance&count=${count}&virtual=${virtual}&paged=${paged}`)
    // The nonvirtual baseline mounts 1000 rows; allow startup under parallel
    // browser load while retaining the 90s total and all structural assertions.
    await expect(page.locator('[data-performance-state]')).toContainText(`当前结果 ${count} 行`,{timeout:60000})
    const body=page.locator('.vxe-table--main-wrapper .vxe-table--body-wrapper')
    await expect(body.getByText('设备 1',{exact:true})).toBeVisible()
    const rowCount=await body.locator('.vxe-body--row').count()
    samples.push({count,virtual,paged,readyMs:Date.now()-start,renderedRows:rowCount})
    expect(rowCount).toBeLessThanOrEqual(!virtual?1000:paged?100:100)
    if(!virtual)expect(rowCount).toBe(1000)
    const first=body.locator('.vxe-body--row').first(),second=body.locator('.vxe-body--row').nth(1)
    expect((await first.boundingBox())!.height).toBeGreaterThan((await second.boundingBox())!.height)
    if(virtual&&!paged){
      const scrollStart=Date.now()
      // The region's native keyboard handler uses the same viewport as the user.
      const viewport=page.getByRole('region',{name:'性能示例，可横向滚动'})
      await viewport.focus();await viewport.press('End')
      await expect(body.getByText(`设备 ${count}`,{exact:true})).toBeVisible()
      await expect(body.locator('.vxe-body--row')).not.toHaveCount(count)
      samples.at(-1)!.endScrollMs=Date.now()-scrollStart
      await viewport.focus();await viewport.press('Home')
      const selection=page.getByRole('checkbox',{name:'选择 1',exact:true}).filter({visible:true}).first()
      await expect(selection).toBeVisible();await selection.check()
      await viewport.focus();await viewport.press('End');await viewport.press('Home')
      await expect(selection).toBeChecked()
    }
  }
  await testInfo.attach('browser-rendering-samples',{body:JSON.stringify(samples,null,2),contentType:'application/json'})
  console.log('BROWSER_RENDERING_SAMPLES',JSON.stringify(samples))
})

test('custom empty slot receives effective query reason and recovery commands',async({page})=>{
  await page.goto('/?example=performance&count=1000&paged=true')
  await page.getByRole('button',{name:'查询无匹配',exact:true}).click()
  await expect(page.locator('[data-empty-reason="no-results"]').filter({visible:true})).toBeVisible()
  await page.getByRole('button',{name:'清除查询条件',exact:true}).click()
  await expect(page.locator('[data-performance-state]')).toContainText('当前结果 1000 行')
  await page.getByRole('button',{name:'模拟失败',exact:true}).click()
  await expect(page.locator('[data-empty-reason="error"]').filter({visible:true})).toBeVisible()
  await page.getByRole('button',{name:'重试读取',exact:true}).click()
  await expect(page.locator('[data-empty-reason="error"]')).toHaveCount(0)
  await expect(page.locator('.vxe-table--main-wrapper .vxe-body--row')).toHaveCount(100)
})
