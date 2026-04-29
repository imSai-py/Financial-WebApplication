import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 1,
  workers: 1, // Sequential — Firebase Auth state can conflict in parallel

  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 20000,
  },

  projects: [
    {
      name: 'Mobile-Chrome',
      use: {
        viewport: { width: 375, height: 812 }, // iPhone X dimensions
        browserName: 'chromium',
      },
      testMatch: /.*ui\.spec\.js/, // Run only UI tests on mobile for speed normally, but we'll configure explicitly
    },
    {
      name: 'Tablet-Chrome',
      use: {
        viewport: { width: 768, height: 1024 }, // iPad dimensions
        browserName: 'chromium',
      },
      testMatch: /.*ui\.spec\.js/,
    },
    {
      name: 'Desktop-Chrome',
      use: {
        viewport: { width: 1440, height: 900 },
        browserName: 'chromium',
      },
    },
  ],

  // Dev server must already be running (npm run dev)
  webServer: undefined,
});
