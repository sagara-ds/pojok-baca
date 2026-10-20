# API Integration - Welib.org / Anna's Archive

## 📡 API Overview
**Base URL:** `https://id.welib.org/api`  
**Sumber Data:** Anna's Archive (shadow library metadata aggregator)  
**Auth:** Tidak perlu API key (public)  
**Rate Limit:** Self-imposed 60 req/min per IP via proxy

## 🔗 Endpoints (Asumsi - perlu verifikasi)
| Endpoint | Method | Params | Response |
|----------|--------|--------|----------|
| `/books` | GET | `page`, `limit`, `category`, `year`, `language`, `sort` | `{ data: Book[], pagination }` |
| `/books/:slug` | GET | - | `Book` |
| `/books/search` | GET | `q`, `page`, `limit`, `category`, `sort` | `{ data: Book[], pagination }` |
| `/categories` | GET | - | `Category[]` |

## 📦 TypeScript Types (`src/services/types.ts`)
```typescript
interface Book {
  id: string;
  slug: string;
  title: string;
  author: string;
  coverUrl: string;
  description: string;      // HTML dari API
  category: string;
  publishedYear: number;
  pages: number;
  language: string;         // "id", "en", dll
  isbn?: string;
  readingUrl?: string;      // URL ke EPUB/PDF
}

interface BookListResponse {
  data: Book[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

## 🛡️ Security Layer (`src/services/api.ts`)

### Sanitization Functions
```typescript
// Strip dangerous HTML, keep safe tags
sanitizeHtml(html: string): string

// Strip ALL HTML, plain text only
sanitizeText(text: string): string

// Validate & sanitize book object dari API
sanitizeBook(raw: unknown): Book | null
```

### Rate Limiting (Proxy Routes)
- **File:** `src/pages/api/proxy/books/[...slug].ts`
- **Limit:** 60 req/menit per IP (in-memory Map)
- **Headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`

### Caching Strategy
| Endpoint | Cache-Control | Stale-While-Revalidate |
|----------|---------------|------------------------|
| `/books/:slug` (detail) | `max-age=3600` (1 jam) | 86400 (1 hari) |
| `/books` (list) | `max-age=300` (5 menit) | 3600 (1 jam) |
| `/categories` | `max-age=86400` (1 hari) | 604800 (1 minggu) |

## ⚠️ Error Handling
```typescript
// Timeout: 10 detik (AbortSignal)
// Retry: 3x untuk 5xx errors (exponential backoff 1s)
// Fallback: ErrorState component di UI
```

## 🔄 Data Flow
```
Client (Browser)
    ↓
Astro Page (SSR/SSG)
    ↓
API Proxy Route (/api/proxy/books/...)
    ↓ [Rate Limit + Timeout + Sanitize]
Welib.org API
    ↓
Sanitized JSON Response
    ↓
Client Render
```

## 🧪 Testing API
```bash
# Test proxy langsung
curl "http://localhost:4321/api/proxy/books?page=1&limit=5"
curl "http://localhost:4321/api/proxy/books/slug-buku-ini"
curl "http://localhost:4321/api/proxy/books/search?q=pemrograman"
curl "http://localhost:4321/api/proxy/categories"
```

## 📝 Notes untuk Development
- [ ] Verifikasi endpoint aktual welib.org (Cloudflare protected)
- [ ] Handle pagination style (cursor vs offset)
- [ ] Cek format `readingUrl` (EPUB/PDF direct link?)
- [ ] Handle missing fields gracefully (optional chaining)
- [ ] Add request/response logging untuk debugging

---
*Related: [[Tech Stack]], [[Components - Book]], [[Project Overview]]*