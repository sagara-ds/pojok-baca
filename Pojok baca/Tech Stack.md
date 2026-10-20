# Tech Stack - Pojok Baca RPL

## 🏗️ Core Framework
| Tool | Version | Purpose |
|------|---------|---------|
| **Astro** | 7.4.x | Static site generator + SSR untuk dynamic routes |
| **TypeScript** | 5.x (strict) | Type safety, better DX |
| **Tailwind CSS** | 4.x | Utility-first styling, CSS-first config |
| **Node.js** | >=22.22.0 | Runtime untuk SSR adapter |

## 🔧 Astro Integrations
```json
{
  "@astrojs/node": "^9.x",      // SSR adapter (standalone mode)
  "@tailwindcss/vite": "^4.x"   // Tailwind v4 Vite plugin
}
```

## 📦 Key Dependencies
- **Runtime:** Tidak ada heavy dependencies (vanilla Astro components)
- **Dev:** ESLint, Prettier, TypeScript
- **No React/Vue/Svelte** - Pure Astro components untuk performa maksimal

## 🎨 Tailwind v4 Config (CSS-first)
File: `src/styles/global.css`

```css
@import "tailwindcss";

@theme {
  /* Colors */
  --color-primary: #1a1a2e;
  --color-accent: #c9a84c;
  --color-background: #fafafa;
  --color-surface: #ffffff;
  --color-text: #1a1a1a;
  --color-text-muted: #6b6b6b;
  --color-border: #e5e5e5;
  
  /* Typography */
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  
  /* Spacing */
  --space-1: 0.25rem;  --space-4: 1rem;  --space-8: 2rem;
  
  /* Radius */
  --radius-md: 0.375rem;  --radius-lg: 0.5rem;  --radius-xl: 0.75rem;
}
```

**Dark mode:** `prefers-color-scheme` + manual `.dark` class toggle

## 🔒 Security & Quality
- **CSP Headers:** Strict via `_headers` (Netlify) / `astro.config.mjs`
- **Sanitization:** `DOMPurify`-style di `src/services/api.ts`
- **Rate Limiting:** In-memory per IP di API proxy routes
- **TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`

## 🚀 Scripts
```json
{
  "dev": "astro dev",
  "build": "astro build",        // SSR build dengan @astrojs/node
  "preview": "astro preview",    // Preview production build
  "check": "astro check",        // TypeScript + Astro validation
  "lint": "eslint src --ext .ts,.astro"
}
```

## 📁 Struktur Folder
```
src/
├── components/
│   ├── ui/           # Button, Card, Skeleton, ErrorState, LoadingSpinner
│   ├── layout/       # Header, Footer
│   └── book/         # BookCover, BookMeta, BookDescription, ReadButton
├── layouts/          # BaseLayout
├── pages/
│   ├── index.astro   # Redirect → /books
│   ├── books/
│   │   ├── index.astro      # List + pagination + sort
│   │   └── [slug].astro     # Detail (SSR, prerender=false)
│   └── api/proxy/            # Secure proxy ke welib.org
├── services/         # api.ts (fetch + sanitize), types.ts
├── styles/           # global.css (Tailwind v4 @theme)
└── utils/            # helpers.ts (format, debounce, slug, dll)
```

## 🎯 Design Principles
1. **Mobile-first** → `sm:` `md:` `lg:` `xl:` breakpoints
2. **Semantic HTML** → `<main>`, `<header>`, `<footer>`, `<nav>`, `<dl>`, `<article>`
3. **Accessibility First** → ARIA labels, focus-visible, skip link, color contrast 4.5:1
4. **Performance** → Lazy load images, skeleton loaders, minimal JS, static-first
5. **Security** → Sanitize ALL external data, CSP, rate limiting, no inline scripts

---
*Referensi: [Astro Docs](https://docs.astro.build) | [Tailwind v4](https://tailwindcss.com/docs) | [TypeScript Strict](https://www.typescriptlang.org/tsconfig#strict)*