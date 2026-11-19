// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import { fileURLToPath } from 'node:url';
import { stagePublicSite } from './pipeline/lib/public-site.mjs';

// Adapter dipilih dari NODE_ENV yang di-set Astro sendiri:
//   astro dev   -> development -> node (dev via workerd sering hang/lambat
//                  start di Windows; iterasi di node jauh lebih cepat)
//   astro build -> production  -> cloudflare (target deploy)
const isDev = process.env.NODE_ENV === 'development';

// https://astro.build/config
export default defineConfig({
  publicDir: stagePublicSite(fileURLToPath(new URL('.', import.meta.url))),
  site: 'https://pojok-baca.asagara2223.workers.dev',
  output: 'server', // SSR untuk halaman detail + reader
  trailingSlash: 'always',
  // Proyek ini tidak memakai Astro sessions. Pada adapter Cloudflare, sessions
  // butuh binding KV ("SESSION") dan membuat dev server menggantung saat start.
  session: false,
  adapter: isDev
    ? node({ mode: 'standalone' })
    : cloudflare({
        imageService: 'passthrough', // gambar halaman sudah di-compress pipeline
      }),
  vite: {
    resolve: {
      alias: isDev ? {
        'cloudflare:workers': fileURLToPath(new URL('./src/server/cloudflare-dev.ts', import.meta.url)),
      } : {},
    },
    plugins: [tailwindcss()],
    server: {
      fs: {
        // Vite must not expose original or private staging files via source URLs.
        deny: [
          '.env', '.env.*', '.dev.vars', '.dev.vars.*', '*.{crt,pem}',
          '**/.git/**', '**/.data/**', '**/.cache/**', '**/public/**', '**/dist/**',
          '**/data/*.private.json',
        ],
      },
      watch: {
        // public/sheets berisi ~16.000 file strip hasil pipeline. Kalau Vite
        // memindainya, event loop jadi penuh dan `astro dev` timeout saat
        // memuat server app ("transport invoke timed out").
        // .cache/pages bahkan lebih besar (~41.000 file hasil render).
        // File-file ini statis, tidak pernah berubah saat development.
        ignored: [
          '**/public/sheets/**',
          '**/public/covers/**',
          '**/public/dl/**',
          '**/.cache/**',
          '**/.data/**',
        ],
      },
    },
  },
});
