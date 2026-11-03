import { defineConfig, devices } from '@playwright/test'

// End-to-end tests of SERVER MODE: the real API (fresh embedded database,
// YouTube lookups faked) + the server-mode web build, proxied like nginx.
const API_PORT = 3317
const WEB_PORT = 4318
const WEB = `http://localhost:${WEB_PORT}`

export default defineConfig({
  testDir: './e2e-server',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-server' }]] : 'list',
  outputDir: 'test-results-server',
  use: {
    baseURL: `${WEB}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'android-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: [
    {
      cwd: '../api',
      command: `node -e "require('fs').rmSync('.data/e2e',{recursive:true,force:true})" && node --import tsx src/server.ts`,
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        DATABASE_URL: 'pglite:./.data/e2e',
        BASE_URL: WEB,
        ADMIN_EMAILS: 'admin@example.com',
        FAKE_YOUTUBE_META: 'true',
        LOG_LEVEL: 'warn',
      },
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx vite build --outDir dist-server && npx vite preview --outDir dist-server --port ${WEB_PORT} --strictPort`,
      env: { BASE_PATH: '/', VITE_SERVER_MODE: 'true', API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
      url: `${WEB}/`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
})
