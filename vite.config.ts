import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  // GitHub Pages serves the site from https://<user>.github.io/<repo>/
  // set base to the repo name so asset URLs resolve correctly
  base: '/KiddieTube/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        theme_color: '#4a90e2',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
