import { test as base, expect } from '@playwright/test'

export const test = base.extend<{ runtimeErrors: void }>({
  runtimeErrors: [async ({ page }, use, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
    })
    await page.exposeFunction('__reportRuntimeError', (message: string) => errors.push(message))
    await page.addInitScript(() => {
      const report = (message: string) => {
        void (window as unknown as { __reportRuntimeError: (message: string) => Promise<void> })
          .__reportRuntimeError(message)
      }
      window.addEventListener('error', event => report(`window.error: ${event.message}`))
      window.addEventListener('unhandledrejection', event => report(`unhandledrejection: ${String(event.reason)}`))
    })
    await use()
    if (!page.isClosed()) {
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await page.close()
    }
    await testInfo.attach('runtime-errors', { body: JSON.stringify(errors), contentType: 'application/json' })
    expect(errors, '浏览器运行错误必须为 0').toEqual([])
  }, { auto: true }]
})

export { expect }
