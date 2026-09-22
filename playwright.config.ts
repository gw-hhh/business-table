import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  use: { browserName: 'chromium', trace: 'retain-on-failure', launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } },
  projects: [
    { name: 'chromium-dev', use: { baseURL: 'http://127.0.0.1:4173' } },
    { name: 'chromium-preview', testMatch: ['demo.spec.ts','configuration.spec.ts','visual-parity.spec.ts','text-style.spec.ts','reference-refinement.spec.ts'], use: { baseURL: 'http://127.0.0.1:4174' } }
  ],
  webServer: [
    { command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 120000 },
    { command: 'npm run preview:demo -- --host 127.0.0.1 --port 4174 --strictPort', url: 'http://127.0.0.1:4174', reuseExistingServer: false, timeout: 120000 }
  ]
})
