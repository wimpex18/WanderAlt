/* End-to-end checks in Chromium at a phone and a desktop width, against the
   static server and the recorded catalogue in tests/e2e/fixtures (see
   tests/e2e/support/env.ts). npm run e2e:record refreshes the recording. */
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 5391;
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE,
    browserName: 'chromium',
    locale: 'en-GB',
    timezoneId: 'Europe/Tallinn',
    serviceWorkers: 'block',
    /* A request no route answers fails here instead of reaching the network. */
    proxy: { server: 'http://127.0.0.1:9', bypass: 'localhost,127.0.0.1,[::1]' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `node .scripts/dev-server.js --port ${PORT}`,
    url: `${BASE}/manifest.webmanifest`,
    /* Another checkout may be serving a port: never test what it serves. */
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
