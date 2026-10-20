# Book Components - Pojok Baca RPL

## 📁 Lokasi
`src/components/book/`

---

## 📚 BookCover.astro
**Props:**
```typescript
interface Props {
  src: string;
  alt: string;
  width?: number;       // default 256
  height?: number;      // default 384 (ratio 2:3)
  class?: string;
  priority?: boolean;   // eager load, high fetchpriority
  fallback?: string;    // default '/book-placeholder.svg'
}
```

**Features:**
- Aspect ratio 2:3 (portrait book cover)
- `loading="lazy"` (default) / `eager` (priority)
- `fetchpriority="high"` untuk above-the-fold
- Error fallback → placeholder SVG + book icon
- `decoding="async"` untuk non-blocking decode
- Responsive: `w-full h-full object-cover`

**Accessibility:**
- `role="img" aria-label={alt}`
- Fallback icon decorative (`aria-hidden="true"`)

---

## 🏷️ BookMeta.astro
**Props:**
```typescript
interface Props {
  title: string;
  author: string;
  category?: string;
  publishedYear?: number;
  pages?: number;
  language?: string;
  isbn?: string;
  class?: string;
}
```

**Output:** Semantic `<dl>` (definition list)
```html
<dl class="grid gap-3 sm:gap-4">
  <div role="listitem">
    <dt class="text-text-muted">Penulis</dt>
    <dd class="text-text">{author}</dd>
  </div>
  <div role="listitem">
    <dt class="text-text-muted">Kategori</dt>
    <dd class="text-text">{category}</dd>
  </div>
  ...
</dl>
```

**Category Badge:** Pill style `bg-accent/10 text-accent`

---

## 📖 BookDescription.astro
**Props:**
```typescript
interface Props {
  description: string;    // HTML dari API (sudah sanitized)
  maxLines?: number;      // default 5
  class?: string;
}
```

**Features:**
- `prose` class untuk typography
- Read more/less toggle (clamp by line count)
- Smooth `max-height` transition (300ms)
- Gradient fade overlay saat collapsed
- Keyboard accessible button (`aria-expanded`)

**Sanitization:** Input sudah lewat `sanitizeHtml()` di API layer

---

## ▶️ ReadButton.astro
**Props:**
```typescript
interface Props {
  readingUrl?: string;    // Custom reading URL
  slug: string;           // Fallback → `/books/${slug}/read`
  title: string;          // Untuk aria-label
  variant?: 'primary' | 'secondary';
  class?: string;
  continueReading?: boolean;  // "Lanjutkan Baca" vs "Mulai Baca"
}
```

**Output:**
```html
<a href="/books/slug/read" class="inline-flex items-center gap-2 px-6 py-3 ...">
  <svg class="w-5 h-5">...</svg>  <!-- Book icon -->
  <span>Mulai Baca</span>
</a>
```

**Accessibility:**
- `aria-label="Mulai membaca {title}"`
- Focus visible ring
- Semantic `<a>` (bukan button) untuk navigasi

---

## 🔗 Component Dependencies

```
BookCover
  └── (none - standalone)

BookMeta
  └── sanitizeText() from api.ts

BookDescription
  └── sanitizeHtml() from api.ts

ReadButton
  └── (none - standalone)
```

---

## 🎯 Usage Patterns

### Detail Page (Full Layout)
```astro
<div class="grid gap-6 sm:grid-cols-[256px_1fr] items-start">
  <div class="sticky top-24 self-start">
    <Card variant="elevated" padding="none">
      <BookCover src={book.coverUrl} alt={book.title} priority />
    </Card>
    <ReadButton slug={book.slug} title={book.title} fullWidth />
  </div>
  <div class="space-y-6">
    <header>
      <h1>{book.title}</h1>
      <p class="text-text-muted">{book.author}</p>
    </header>
    <BookMeta {...book} />
    <BookDescription description={book.description} />
  </div>
</div>
```

### List Card (Compact)
```astro
<Card variant="interactive" padding="none" href={`/books/${book.slug}`}>
  <div class="aspect-[2/3] relative">
    {book.coverUrl ? (
      <img src={book.coverUrl} alt="" loading="lazy" class="w-full h-full object-cover" />
    ) : (
      <Skeleton variant="rectangular" class="w-full h-full" />
    )}
  </div>
  <div class="p-4 flex-1 flex flex-col">
    <h3 class="font-semibold line-clamp-2">{book.title}</h3>
    <p class="text-sm text-text-muted line-clamp-1">{book.author}</p>
    <div class="mt-auto pt-3 border-t">
      <ReadButton slug={book.slug} title={book.title} variant="secondary" fullWidth />
    </div>
  </div>
</Card>
```

---

## 🧪 Testing Checklist
- [ ] Cover loads lazy, priority works
- [ ] Error fallback shows placeholder
- [ ] Meta displays all fields, handles missing
- [ ] Description read more/less smooth
- [ ] Button navigates correctly
- [ ] RTL language support (Arabic, etc.)
- [ ] Long titles truncate properly
- [ ] Mobile: cover centered, desktop: left-aligned sticky

---
*Related: [[Components - UI]], [[API Integration]], [[Project Overview]]*