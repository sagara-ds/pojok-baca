# 📚 Pojok Baca RPL - Obsidian Vault

Vault dokumentasi untuk project **Pojok Baca RPL** - website perpustakaan digital minimalis.

## 📁 Struktur Vault
```
Pojok baca/
├── Project Overview.md       # Ringkasan project, branch strategy
├── Tech Stack.md             # Astro, Tailwind v4, TypeScript config
├── API Integration.md        # Welib.org API, sanitization, proxy
├── Components - UI.md        # Button, Card, Skeleton, ErrorState, Spinner
├── Components - Book.md      # BookCover, BookMeta, BookDescription, ReadButton
├── Deployment.md             # Netlify/Vercel, CI/CD, monitoring
├── Development Workflow.md   # Git workflow, commands, testing checklist
├── Templates/                # Note templates (lihat bawah)
└── .obsidian/                # Obsidian config
```

## 🔗 Quick Links
- [[Project Overview]]
- [[Tech Stack]]
- [[API Integration]]
- [[Components - UI]]
- [[Components - Book]]
- [[Deployment]]
- [[Development Workflow]]

## 📝 Templates

### Feature Branch Note
```markdown
# feat/<nama-fitur>

## Tujuan
- [ ] 

## Scope
- Files changed:
  - `src/...`

## Testing
- [ ] Functional
- [ ] Responsive (mobile/desktop)
- [ ] Accessibility (WCAG 2.1 AA)
- [ ] Performance (Lighthouse > 90)
- [ ] Security (CSP, sanitization)

## Notes
- 
```

### Bug Report Note
```markdown
# fix/<bug-description>

## Bug
**Expected:** 
**Actual:** 
**Steps to reproduce:**
1. 
2. 

## Root Cause
- 

## Fix
- 

## Testing
- [ ] Regression test
- [ ] Edge cases
```

### Component Documentation
```markdown
# Component: <NamaComponent>

## Props
```typescript
interface Props {
  propName: type;  // description
}
```

## Variants
| Variant | Use Case |
|---------|----------|
| `primary` | ... |

## Accessibility
- [ ] Semantic HTML
- [ ] ARIA labels
- [ ] Focus visible
- [ ] Color contrast

## Usage
```astro
<ComponentName prop="value" />
```
```

## 🏷️ Tagging Convention
- `#feat` - Fitur baru
- `#fix` - Bug fix
- `#refactor` - Refactoring
- `#docs` - Dokumentasi
- `#security` - Security related
- `#performance` - Performance optimization
- `#accessibility` / `#a11y` - Accessibility
- `#api` - API integration
- `#component` - Component documentation

## 🔍 Search Tips
- `tag:#feat` → Semua fitur
- `tag:#api` → API related
- `tag:#component` → Component docs
- `line:tag:#` → Semua tagged notes

## 📅 Meeting Notes Template
```markdown
# Meeting YYYY-MM-DD

## Attendees
- 

## Agenda
1. 
2. 

## Decisions
- 

## Action Items
- [ ] @nama: task
- [ ] @nama: task

## Next Meeting
YYYY-MM-DD
```

---

*Vault ini sinkron dengan project di `C:/Users/septi/pojok-baca/`*
*Update notes saat: mulai fitur baru, fix bug, deploy, meeting*