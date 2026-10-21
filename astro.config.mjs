// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: 'https://pojokbaca.example.com',
  output: 'server', // SSR for dynamic routes
  trailingSlash: 'always',
  adapter: node({ mode: 'standalone' }),
  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        // public/pages berisi ~41.000 file hasil render pipeline. Kalau Vite
        // memindainya, event loop jadi penuh dan `astro dev` timeout saat
        // memuat server app ("transport invoke timed out"). File ini statis,
        // tidak pernah berubah saat development, jadi tidak perlu diawasi.
        ignored: ['**/public/pages/**', '**/public/covers/**', '**/public/dl/**'],
      },
    },
  },
});