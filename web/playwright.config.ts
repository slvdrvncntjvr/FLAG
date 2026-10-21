import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0,
  timeout: 120_000, globalTimeout: 600_000, expect: { timeout: 45_000 },
  reporter: 'list', use: { baseURL: 'http://localhost:3000', trace: 'off', screenshot: 'off' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'mobile-360', use: { browserName: 'chromium', viewport: { width: 360, height: 800 } } },
  ],
});
