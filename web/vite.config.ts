import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app. The service worker caches only the app shell; /api and map tiles always
    // go to the network, so data is never stale. A new deploy activates on the next open.
    VitePWA({
      registerType: 'autoUpdate',
      // index.html links the favicon (the rounded logo) and the Apple icon itself.
      pwaAssets: {
        config: true,
        overrideManifestIcons: true,
        includeHtmlHeadLinks: false,
        injectThemeColor: false,
      },
      manifest: {
        name: 'Trag',
        short_name: 'Trag',
        description: 'Praćenje vozila',
        lang: 'sr-Latn',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#be185d',
        background_color: '#f5f6f8',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', ws: true },
    },
  },
  test: {
    environment: 'node',
  },
});
