# Deployment - Pojok Baca RPL

## 🎯 Target Platforms
| Platform | Support | Notes |
|----------|---------|-------|
| **Netlify** | ✅ Full | `_headers`, `_redirects`, auto-detect |
| **Vercel** | ✅ Full | `vercel.json` untuk config |
| **GitHub Pages** | ⚠️ Static only | Perlu adapter static, tidak SSR |
| **Cloudflare Pages** | ✅ Full | Functions support |

> **Current Config:** `@astrojs/node` adapter (standalone) → SSR support → **Netlify/Vercel/Cloudflare** recommended

---

## ⚙️ Build Configuration

### `astro.config.mjs`
```javascript
export default defineConfig({
  site: 'https://pojokbaca.example.com',  // Update untuk production
  output: 'server',                        // SSR untuk dynamic routes
  trailingSlash: 'always',
  adapter: node({ mode: 'standalone' }),
  vite: { plugins: [tailwindcss()] },
});
```

### Environment Variables
```env
# .env (local) / Platform env vars
PUBLIC_WELIB_API_BASE=https://id.welib.org/api
NODE_ENV=production
```

---

## 📋 Pre-deployment Checklist

### Build Verification
- [ ] `npm run build` → success (exit code 0)
- [ ] `npm run check` → TypeScript + Astro validation pass
- [ ] `npm run lint` → ESLint clean
- [ ] `npm run preview` → test production build locally

### Performance
- [ ] Lighthouse Performance > 90
- [ ] Lighthouse Accessibility > 90
- [ ] Lighthouse Best Practices > 90
- [ ] Lighthouse SEO > 90

### Security
- [ ] CSP headers present (`_headers` / platform config)
- [ ] No console errors in production
- [ ] Rate limiting active on API proxy
- [ ] Sanitization working on all API responses

### Functionality
- [ ] Home → redirect to `/books`
- [ ] `/books` → list with pagination + sort
- [ ] `/books/:slug` → detail page loads (SSR)
- [ ] API proxy returns sanitized data
- [ ] 404 handling untuk slug tidak valid
- [ ] Mobile responsive (375px, 414px)
- [ ] Desktop layout (1440px, 1920px)

---

## 🌐 Netlify Deployment

### Auto-detect (Recommended)
1. Connect repo di Netlify dashboard
2. Build command: `npm run build`
3. Output directory: `dist` (atau kosong untuk SSR)
4. Auto-detects `@astrojs/node` adapter

### Manual Config (`netlify.toml`)
```toml
[build]
  command = "npm run build"
  publish = "dist"

[functions]
  node_bundler = "esbuild"
  included_files = ["dist/**/*"]

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[redirects]]
  from = "/*/index.html"
  to = "/:splat"
  status = 301
```

### Environment Variables di Netlify
```
PUBLIC_WELIB_API_BASE = https://id.welib.org/api
NODE_VERSION = 22
```

---

## 🚀 Vercel Deployment

### `vercel.json`
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "astro",
  "installCommand": "npm install",
  "devCommand": "npm run dev",
  "regions": ["sin1"],
  "functions": {
    "src/pages/api/**/*.ts": {
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

---

## 📊 Monitoring & Analytics

### Recommended
- **Netlify Analytics** / **Vercel Analytics** (privacy-friendly)
- **Sentry** untuk error tracking (optional)
- **Web Vitals** via `web-vitals` library

### Health Checks
```bash
# API health
curl https://your-domain.com/api/proxy/books?limit=1

# Page health
curl -I https://your-domain.com/books/
```

---

## 🔄 CI/CD Pipeline (GitHub Actions)

### `.github/workflows/deploy.yml`
```yaml
name: Deploy
on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run check
      - run: npm run lint
      - run: npm run build
      
  deploy-preview:
    needs: build
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: netlify/actions/cli@master
        with:
          args: deploy --build --message "PR #${{ github.event.number }}"
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}

  deploy-production:
    needs: build
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: netlify/actions/cli@master
        with:
          args: deploy --build --prod --message "Production deploy"
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

---

## 🔧 Production URL Updates
Update `astro.config.mjs` sebelum deploy production:
```javascript
site: 'https://pojokbaca.rpl.example.com',  // Actual domain
```

Update `manifest.json`:
```json
{
  "start_url": "/books",
  "theme_color": "#1a1a2e"
}
```

---

## 📝 Rollback Strategy
- Netlify/Vercel: Instant rollback via dashboard (previous deploy)
- Keep last 3 successful builds
- Database: N/A (static + API proxy)

---
*Related: [[Tech Stack]], [[API Integration]], [[Project Overview]]*