# Pojok Baca RPL - Project Overview

## 📋 Ringkasan Project
**Nama:** Pojok Baca RPL  
**Deskripsi:** Website minimalis, mobile-first untuk menampilkan buku dari API Welib.org secara aman. Dibangun kolaboratif oleh 2 orang (RPL = nama tim/kelompok).  
**Tech Stack:** Astro 7.x + Tailwind CSS v4 + TypeScript (strict)  
**Deploy Target:** Static hosting (Netlify/Vercel/GitHub Pages) dengan SSR untuk halaman detail buku  

## 🎯 Tujuan
- Tampilkan daftar buku dari `https://id.welib.org` dengan aman (sanitized, rate-limited)
- Desain minimalis, mobile-first, responsive desktop
- Setiap fitur di branch terpisah (`main` tetap kosong)
- Code quality tinggi: TypeScript strict, ESLint, accessibility (WCAG 2.1 AA)

## 🌿 Branch Strategy
```
main (kosong, hanya README + config)
├── feat/project-setup          ✅ Astro init, config, struktur folder, base components
├── feat/book-detail            (sudah di project-setup) Detail buku dengan SSR
├── feat/book-list              Pagination, sort, grid/list toggle, skeleton
├── feat/search-filter          Search debounced, filter kategori/tahun, URL state
├── feat/reading-view           EPUB.js / PDF.js reader dengan TOC, theme, progress
├── feat/ui-polish              Accessibility, animasi, offline, micro-interactions
└── feat/deploy-config          CI/CD, headers, sitemap, monitoring
```

**Rule:** 1 fitur = 1 branch. PR ke `main` setelah review & test. `main` tidak pernah di-commit langsung.

## 🔗 Referensi Cepat
- **Repo:** (belum ada remote)
- **API Source:** `https://id.welib.org` (data dari Anna's Archive)
- **Plan File:** `.claude/plans/aku-mau-membuat-web-memoized-nygaard.md`

---
*Created: 2026-10-20 | Updated: 2026-10-20*