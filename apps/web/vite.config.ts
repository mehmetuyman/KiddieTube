import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// URL path the app is served from. GitHub Pages serves it from
// https://<user>.github.io/KiddieTube/ (the default); the self-hosted site at
// https://kids.tinyapps.dev/ builds with BASE_PATH=/
const base = normalizeBase(process.env.BASE_PATH ?? '/KiddieTube/')

function normalizeBase(p: string): string {
  const trimmed = p.trim().replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}/` : '/'
}

export default defineConfig({
  base,
  server: {
    // server mode in development: `npm run dev -w @kiddietube/api` on :3007
    proxy: { '/api': 'http://127.0.0.1:3007' },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      // New versions wait for the user: the app shows "New version - tap to
      // update" (components/UpdateBanner.tsx) instead of swapping silently.
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'assets/*.png'],
      // Single source of truth for the web app manifest. Paths are relative so
      // they resolve under the /KiddieTube/ base on GitHub Pages.
      manifest: {
        name: 'Kiddie Tube',
        short_name: 'KiddieTube',
        description: 'Kid-friendly curated video player for quick access to favorite clips.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f8f9fa',
        theme_color: '#ffb938', // default (Sunny) theme; the page updates it per device
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // The app is a single page: unknown paths (/parent, /join, ...) get
        // index.html from the cache - but never API calls.
        navigateFallbackDenylist: [/\/api\//],
        // The seed list isn't precached (it must pick up new deploys), but keep
        // the last copy so an installed app still has videos when offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/videos.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'kiddietube-seed', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
})
