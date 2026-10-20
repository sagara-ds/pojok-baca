# UI Components - Pojok Baca RPL

## 📁 Lokasi
`src/components/ui/`

---

## 🔘 Button.astro
**Props:**
```typescript
interface Props {
  children: any;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  href?: string;              // Jika ada → render <a>, else <button>
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;          // Show spinner, disable
  fullWidth?: boolean;
  class?: string;
  'aria-label'?: string;
}
```

**Variants:**
| Variant | Use Case |
|---------|----------|
| `primary` | Main CTA (Mulai Baca, Submit) |
| `secondary` | Secondary actions |
| `outline` | Less prominent |
| `ghost` | Toolbar, minimal |
| `danger` | Destructive (Delete) |

**Accessibility:**
- `aria-busy` saat loading
- `focus-visible:ring-2 ring-accent`
- `disabled` → `opacity-50 pointer-events-none`

---

## 🃏 Card.astro
**Props:**
```typescript
interface Props {
  children: any;
  variant?: 'default' | 'outlined' | 'elevated' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  href?: string;              // Link wrapper
  'aria-label'?: string;
}
```

**Variants:**
| Variant | Style |
|---------|-------|
| `default` | `bg-surface border border-border` |
| `outlined` | `border-2 border-border hover:border-accent` |
| `elevated` | `shadow-lg hover:shadow-xl` |
| `interactive` | `hover:border-accent hover:shadow-md cursor-pointer` |

---

## 💀 Skeleton.astro
**Props:**
```typescript
interface Props {
  variant?: 'text' | 'circular' | 'rectangular' | 'book-card' | 'book-detail';
  width?: string | number;
  height?: string | number;
  class?: string;
  count?: number;    // untuk variant='text'
}
```

**Usage:**
```astro
<Skeleton variant="book-card" />      {/* Grid card placeholder */}
<Skeleton variant="book-detail" />   {/* Detail page placeholder */}
<Skeleton variant="text" count={4} /> {/* Paragraph lines */}
```

---

## ⚠️ ErrorState.astro
**Props:**
```typescript
interface Props {
  title?: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;        // Link retry
  actionOnclick?: (e) => void; // Button retry
  variant?: 'default' | 'inline' | 'page';
  class?: string;
  icon?: boolean;
}
```

**Variants:**
| Variant | Layout |
|---------|--------|
| `default` | `py-12 px-4` centered |
| `inline` | `py-6 px-4` dalam card |
| `page` | `flex-1 flex items-center justify-center` full page |

---

## ⏳ LoadingSpinner.astro
**Props:**
```typescript
interface Props {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  class?: string;
  label?: string;      // aria-label
  overlay?: boolean;   // Full-screen overlay
}
```

---

## 🎨 Design Tokens (Tailwind v4)
Semua components menggunakan CSS variables dari `@theme`:

```css
/* Colors */
--color-primary, --color-accent, --color-surface, --color-border
/* Spacing */
--space-1 ... --space-16
/* Radius */
--radius-sm ... --radius-2xl
/* Shadows */
--shadow-sm ... --shadow-xl
/* Transitions */
--transition-fast (150ms), --transition-normal (250ms)
```

---

## ♿ Accessibility Checklist (per component)
- [ ] Semantic HTML (`<button>`, `<a>`, `<article>`, `<dl>`)
- [ ] `aria-label` / `aria-labelledby` untuk icon-only
- [ ] `focus-visible` ring visible (2px accent)
- [ ] Color contrast ≥ 4.5:1 (text), 3:1 (UI)
- [ ] `disabled` state proper (not just visual)
- [ ] `loading` → `aria-busy="true"` + spinner
- [ ] Reduced motion support (`prefers-reduced-motion`)

---

## 📝 Usage Examples

### Book Card (List Page)
```astro
<Card variant="interactive" padding="none" href={`/books/${book.slug}`}>
  <div class="aspect-[2/3] overflow-hidden">
    <img src={book.coverUrl} alt="" loading="lazy" class="w-full h-full object-cover" />
  </div>
  <div class="p-4">
    <h3 class="font-semibold line-clamp-2">{book.title}</h3>
    <p class="text-sm text-text-muted">{book.author}</p>
  </div>
</Card>
```

### Detail Page Layout
```astro
<div class="grid gap-6 sm:grid-cols-[256px_1fr]">
  <div class="sticky top-24">
    <Card variant="elevated" padding="none">
      <BookCover src={book.coverUrl} alt={book.title} priority />
    </Card>
    <ReadButton slug={book.slug} title={book.title} fullWidth />
  </div>
  <div>
    <h1>{book.title}</h1>
    <BookMeta {...book} />
    <BookDescription description={book.description} />
  </div>
</div>
```

---
*Related: [[Components - Book]], [[Tech Stack]], [[API Integration]]*