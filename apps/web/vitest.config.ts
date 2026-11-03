import { defineConfig } from 'vitest/config'

// Unit tests only (e2e lives in e2e/ and runs with Playwright).
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
