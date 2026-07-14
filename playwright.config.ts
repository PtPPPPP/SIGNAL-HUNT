import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config.
 *
 * The app is local-first (IndexedDB only), so each test gets Playwright's default
 * per-test isolated browser context — that means a fresh, empty IndexedDB per
 * test. In DEV mode the DisplayPage auto-seeds a demo event + prizes when no
 * active event exists (see displayBootstrap), so every test starts from a known
 * drawable state with no seeding harness of our own.
 *
 * webServer boots `npm run dev` (127.0.0.1:5180) and is reused locally so a
 * already-running dev server doesn't get killed between runs.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:5180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
