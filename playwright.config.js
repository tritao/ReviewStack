const {defineConfig} = require('@playwright/test');

const baseURL = process.env.REVIEWSTACK_BASE_URL ?? 'http://127.0.0.1:4173/ReviewStack/';

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: {timeout: 30_000},
  retries: process.env.CI ? 2 : 0,
  use: {baseURL, browserName: 'chromium', trace: 'retain-on-failure'},
  reporter: process.env.CI ? [['github'], ['html', {open: 'never'}]] : 'list',
  webServer: process.env.REVIEWSTACK_BASE_URL
    ? undefined
    : {
        command: 'node scripts/serve-pages.js',
        url: baseURL,
        reuseExistingServer: true,
      },
});
