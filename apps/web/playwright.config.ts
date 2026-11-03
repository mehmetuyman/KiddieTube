import { defineConfig, devices } from '@playwright/test'

const PORT = 4317

// End-to-end tests against the production build (served at the root path,
// like kids.tinyapps.dev), with YouTube stubbed (see e2e/fixtures.ts).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Once the PWA's service worker controls a page, WebKit no longer lets
    // page.route() see its requests (the YouTube stub would be bypassed after
    // a reload). Offline/service-worker behaviour gets its own tests.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'android-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    env: { BASE_PATH: '/' },
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
