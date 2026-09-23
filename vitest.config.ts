import { availableParallelism } from 'node:os'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom', include: ['tests/*.spec.ts'], exclude: ['tests/e2e/**'],
    // Bound concurrent SFC compilation and jsdom work on developer machines and CI.
    maxWorkers: Math.min(4, availableParallelism()),
  },
})
