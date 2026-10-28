import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/desktop/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter desktop dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
