const { defineConfig } = require('@playwright/test')
module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.cjs',
  timeout: 60000,
  expect: { timeout: 12000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: '.private/e2e-report.json' }]],
  use: { actionTimeout: 10000, screenshot: 'only-on-failure', trace: 'retain-on-failure' }
})
