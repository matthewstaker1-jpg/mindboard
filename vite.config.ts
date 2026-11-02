import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Mindboard',
        short_name: 'Mindboard',
        description: 'Blindfold chess trainer',
        theme_color: '#0E0F12',
        background_color: '#0E0F12',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // The engine is ~7 MB; cache it on first use instead of precaching.
        globIgnores: ['engine/**'],
        runtimeCaching: [
          { urlPattern: /\/engine\//, handler: 'CacheFirst', options: { cacheName: 'engine' } },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
});
