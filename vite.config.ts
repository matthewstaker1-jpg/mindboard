import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mindboard',
        short_name: 'Mindboard',
        description: 'Blindfold chess trainer',
        theme_color: '#0E0F12',
        background_color: '#0E0F12',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // The engine is ~7 MB; cache it on first use instead of precaching.
        globIgnores: ['engine/**'],
        runtimeCaching: [
          { urlPattern: /\/engine\//, handler: 'CacheFirst', options: { cacheName: 'engine' } },
        ],
      },
    }),
  ],
  // The Lichess lines (src/content/lines.json) are one lazily loaded ~540 kB data chunk (~75 kB gzipped).
  build: { chunkSizeWarningLimit: 600 },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
});
