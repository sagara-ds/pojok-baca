# Quick Reference - Pojok Baca RPL

## ⚡ Perintah Cepat

| Perintah | Fungsi |
|----------|--------|
| `npm run dev` | Dev server (localhost:4321) |
| `npm run build` | Production build |
| `npm run preview` | Preview build |
| `npm run check` | TypeScript + Astro check |
| `npm run lint` | ESLint |

## 🌿 Branch Commands

```bash
# New feature
git checkout main && git pull && git checkout -b feat/nama-fitur

# Commit
git add -A && git commit -m "feat(scope): deskripsi"

# Push & PR
git push origin feat/nama-fitur && gh pr create

# Sync
git checkout main && git pull && git checkout feat/nama-fitur && git rebase main
```

## 📁 File Locations

| Item | Path |
|------|------|
| Config | `astro.config.mjs`, `src/styles/global.css` |
| Layouts | `src/layouts/BaseLayout.astro` |
| Pages | `src/pages/books/index.astro`, `src/pages/books/[slug].astro` |
| API | `src/services/api.ts`, `src/pages/api/proxy/` |
| UI Components | `src/components/ui/` |
| Book Components | `src/components/book/` |
| Types | `src/services/types.ts` |
| Utils | `src/utils/helpers.ts` |
| Public | `public/_headers`, `public/manifest.json` |

## 🎨 Tailwind Colors (CSS Variables)

```css
/* Light */
--color-primary: #1a1a2e;
--color-accent: #c9a84c;
--color-background: #fafafa;
--color-surface: #ffffff;
--color-text: #1a1a1a;
--color-text-muted: #6b6b6b;
--color-border: #e5e5e5;

/* Dark (auto + .dark class) */
--color-primary: #fafafa;
--color-accent: #d4b85e;
--color-background: #0f0f1a;
--color-surface: #1a1a2e;
--color-text: #fafafa;
--color-text-muted: #9ca3af;
--color-border: #2d2d44;
```

## 🔑 Breakpoints

| Prefix | Min Width | Device |
|--------|-----------|--------|
| (default) | 0px | Mobile |
| `sm:` | 640px | Large mobile |
| `md:` | 768px | Tablet |
| `lg:` | 1024px | Desktop |
| `xl:` | 1280px | Large desktop |

## ♿ A11y Checklist (Minimum)

- [ ] Semantic HTML (`main`, `header`, `footer`, `nav`, `dl`, `article`)
- [ ] Skip link: `<a href="#main-content" class="skip-link">`
- [ ] Focus visible: `focus-visible:ring-2 ring-accent`
- [ ] Color contrast: 4.5:1 (text), 3:1 (UI)
- [ ] ARIA labels untuk icon-only
- [ ] `alt` text pada images
- [ ] Heading hierarchy (h1 → h2 → h3)

## 🛡️ Security Headers (public/_headers)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## 📡 API Proxy Endpoints

| Route | Description |
|-------|-------------|
| `/api/proxy/books?page=1&limit=20` | List buku |
| `/api/proxy/books/:slug` | Detail buku |
| `/api/proxy/books/search?q=...` | Search |
| `/api/proxy/categories` | Kategori |

Rate limit: 60 req/min/IP (in-memory)

## 🧪 Testing URLs (Dev)

```
Home:           http://localhost:4321/
Books List:     http://localhost:4321/books
Book Detail:    http://localhost:4321/books/slug-buku
API List:       http://localhost:4321/api/proxy/books?limit=3
API Detail:     http://localhost:4321/api/proxy/books/test-slug
API Search:     http://localhost:4321/api/proxy/books/search?q=pemrograman
```

## 📦 Component Import Patterns

```astro
--- Layout ---
import BaseLayout from '../../layouts/BaseLayout.astro';

--- UI Components ---
import Button from '../../components/ui/Button.astro';
import Card from '../../components/ui/Card.astro';
import Skeleton from '../../components/ui/Skeleton.astro';
import ErrorState from '../../components/ui/ErrorState.astro';

--- Book Components ---
import BookCover from '../../components/book/BookCover.astro';
import BookMeta from '../../components/book/BookMeta.astro';
import BookDescription from '../../components/book/BookDescription.astro';
import ReadButton from '../../components/book/ReadButton.astro';

--- Services ---
import { fetchBook, fetchBooks } from '../../services/api';
import type { Book } from '../../services/types';

--- Utils ---
import { formatNumber, truncate, cn } from '../../utils/helpers';
```

## 🚨 Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Tailwind class not working | Check `@import "tailwindcss"` di global.css, typo class |
| Import not found | Check relative path (count `../` correctly) |
| TypeScript error | Run `npm run check`, avoid `any`, use `unknown` + type guards |
| SSR not working | Check `output: 'server'` dan `@astrojs/node` adapter |
| API 502/504 | Check welib.org status, increase timeout, check rate limit |
| Build fails | Run `npm run check` first, fix TypeScript errors |

## 📋 Definition of Done (Per PR)

- [ ] `npm run check` ✅
- [ ] `npm run lint` ✅
- [ ] `npm run build` ✅
- [ ] Mobile test (375px, 414px) ✅
- [ ] Desktop test (1440px, 1920px) ✅
- [ ] Accessibility (axe/Lighthouse > 90) ✅
- [ ] Performance (Lighthouse > 90) ✅
- [ ] No console errors ✅
- [ ] Sanitization verified ✅
- [ ] Rate limiting tested ✅

---

*Simpan file ini sebagai bookmark di Obsidian (Ctrl+P → "Quick Reference")*