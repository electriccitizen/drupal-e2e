import { defineConfig } from '@playwright/test';
import { SITE_CONFIG } from './tests/playwright/site-config';

export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  globalSetup: './tests/playwright/global-setup.ts',
  timeout: 120_000,
  use: {
    baseURL: SITE_CONFIG.baseUrl,
    ignoreHTTPSErrors: true,
    storageState: 'tests/playwright/.auth/session.json',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
