# Development Workflow - Pojok Baca RPL

## 🔄 Git Workflow

### Branch Naming Convention
```
feat/<feature-name>      # Fitur baru
fix/<bug-description>    # Bug fix
refactor/<area>          # Refactoring
docs/<topic>             # Dokumentasi
chore/<task>             # Maintenance
```

### Current Branches
```
main (protected, empty)
├── feat/project-setup   ✅ Base project, components, API, pages
├── feat/book-list       🔄 Next: enhance list (filter, infinite scroll)
├── feat/search-filter   📋 Search + category filter + URL state
├── feat/reading-view    📋 EPUB/PDF reader
├── feat/ui-polish       📋 Accessibility, animations, offline
└── feat/deploy-config   📋 CI/CD, headers, monitoring
```

### Commit Message Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `perf`, `security`

**Example:**
```
feat(book-detail): add read more/less toggle to description

- Implement line-clamp with CSS + JS fallback
- Add smooth max-height transition
- Include gradient fade overlay

Closes #12
Co-Authored-By: Claude Code <noreply@anthropic.com>
```

---

## 🛠️ Daily Commands

### Start Development
```bash
cd C:/Users/septi/pojok-baca
npm run dev          # http://localhost:4321
```

### Code Quality
```bash
npm run check        # TypeScript + Astro validation
npm run lint         # ESLint (src/**/*.ts, *.astro)
npm run format       # Prettier (if configured)
```

### Build & Preview
```bash
npm run build        # Production build (dist/)
npm run preview      # Preview dist/ locally
```

### Git Operations
```bash
# Start new feature
git checkout main
git pull origin main
git checkout -b feat/nama-fitur

# Commit changes
git add -A
git commit -m "feat(scope): description"

# Push & create PR
git push origin feat/nama-fitur
gh pr create --title "feat(scope): description" --body "..."

# Sync with main
git checkout main
git pull origin main
git checkout feat/nama-fitur
git rebase main
```

---

## 🧪 Testing Checklist (Per Feature Branch)

### Functional
- [ ] Fitur bekerja sesuai spec
- [ ] Error states handled gracefully
- [ ] Loading states (skeleton/spinner) present
- [ ] Empty states informative

### Responsive
- [ ] Mobile: 375px (iPhone SE), 414px (iPhone 14+)
- [ ] Tablet: 768px (iPad)
- [ ] Desktop: 1440px (laptop), 1920px (monitor)
- [ ] Touch targets ≥ 44×44px

### Accessibility (WCAG 2.1 AA)
- [ ] Semantic HTML landmarks
- [ ] Color contrast ≥ 4.5:1 (text), 3:1 (UI)
- [ ] Focus visible semua interactive elements
- [ ] Keyboard navigable (Tab, Enter, Escape)
- [ ] ARIA labels untuk icon-only buttons
- [ ] Skip to main content link
- [ ] Reduced motion respected

### Performance
- [ ] Lighthouse Performance > 90
- [ ] No layout shift (CLS < 0.1)
- [ ] Images lazy loaded, proper dimensions
- [ ] No unused CSS/JS

### Security
- [ ] CSP headers present
- [ ] All API data sanitized
- [ ] No XSS vulnerabilities
- [ ] Rate limiting active

### Code Quality
- [ ] TypeScript strict mode passes
- [ ] ESLint clean
- [ ] No `any` types (use `unknown` + guards)
- [ ] Components typed with Props interface
- [ ] No console.log in production code

---

## 📁 File Organization Rules

### Components (`src/components/`)
```
ui/           # Reusable primitives (Button, Card, etc.)
layout/       # Page-level layout (Header, Footer)
book/         # Domain-specific (BookCover, BookMeta, etc.)
feature/      # Feature-specific (nanti: SearchBar, FilterPanel, etc.)
```

### Naming
- **Files:** PascalCase (`BookCover.astro`)
- **Props Interface:** `Props` (inline di file)
- **CSS Classes:** Tailwind utilities, minimal custom CSS
- **Scripts:** `is:inline` untuk client-side JS

### Imports
```typescript
// Relative imports (preferred)
import BaseLayout from '../../layouts/BaseLayout.astro';
import { fetchBook } from '../../services/api';

// Path aliases (jika dikonfigurasi tsconfig.json)
import Button from '@/components/ui/Button.astro';
```

---

## 🐛 Debugging Tips

### API Issues
```bash
# Test proxy langsung
curl -v "http://localhost:4321/api/proxy/books?page=1&limit=3"

# Check network tab di DevTools
# Filter: "api/proxy"
# Check: Response sanitized? Rate limit headers?
```

### Styling Issues
```bash
# Tailwind tidak apply?
# 1. Check @import "tailwindcss" di global.css
# 2. Check class name typo
# 3. Run: npm run dev -- --force (clear Vite cache)
```

### TypeScript Errors
```bash
# Full check
npx astro check

# Specific file
npx tsc --noEmit src/pages/books/[slug].astro
```

### SSR Issues
```bash
# Build output check
ls dist/
# Should have: server/, client/, _astro/

# Preview production
npm run preview
# Test SSR routes: /books/slug-yang-ada
```

---

## 📚 Useful References

### Astro
- [Routing](https://docs.astro.build/en/core-concepts/routing/)
- [SSR](https://docs.astro.build/en/guides/on-demand-rendering/)
- [Adapters](https://docs.astro.build/en/guides/integrations-guide/adapters/)
- [Content Collections](https://docs.astro.build/en/guides/content-collections/)

### Tailwind v4
- [CSS-first Config](https://tailwindcss.com/docs/configuration)
- [@theme](https://tailwindcss.com/docs/theme)
- [Dark Mode](https://tailwindcss.com/docs/dark-mode)

### Accessibility
- [WCAG 2.1 Checklist](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Focus Visible](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible)

### Security
- [CSP Generator](https://csper.io/generator)
- [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

---
*Related: [[Project Overview]], [[Tech Stack]], [[Deployment]]*