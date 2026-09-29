import type {Locator,Page} from '@playwright/test'

/** Open only the groups a scenario needs, through the same buttons as a user. */
export async function openSettingsSections(scope:Locator|Page,...titles:string[]){
  await scope.locator('.bt-settings-preview').waitFor({state:'visible'})
  for(const title of titles){
    const toggle=scope.getByRole('button',{name:'展开'+title,exact:true})
    if(await toggle.count())await toggle.click()
  }
}
