import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// App icons, generated at build time from public/icon.svg (the logo as a full-bleed square).
// Maskable and Apple icons get padding in the brand color, so it blends into the tile.
const background = '#be185d';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    // Android masks to a circle at most (80% safe zone); iOS only rounds the corners.
    maskable: { ...minimal2023Preset.maskable, padding: 0.2, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background } },
  },
  images: ['public/icon.svg'],
});
