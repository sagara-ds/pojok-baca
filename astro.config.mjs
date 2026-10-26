// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';

// Adapter dipilih dari NODE_ENV yang di-set Astro sendiri:
//   astro dev   -> development -> node (dev via workerd sering hang/lambat
//                  start di Windows; iterasi di node jauh lebih cepat)
//   astro build -> production  -> cloudflare (target deploy)
const isDev = process.env.NODE_ENV === 'development';

// https://astro.build/config
export default defineConfig({
  site: 'https://pojokbaca.example.com',
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
    plugins: [tailwindcss()],
    server: {
      watch: {
        // public/sheets berisi ~16.000 file strip hasil pipeline. Kalau Vite
        // memindainya, event loop jadi penuh dan `astro dev` timeout saat
        // memuat server app ("transport invoke timed out").
        // File ini statis, tidak pernah berubah saat development.
        ignored: ['**/public/sheets/**', '**/public/covers/**', '**/public/dl/**'],
      },
    },
  },
});
