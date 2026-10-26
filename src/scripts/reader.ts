/**
 * Reader halaman (gambar statis).
 *
 * Dua mode delivery, keduanya memakai struktur indeks yang sama:
 *   - "sheets": N halaman digabung ke 1 strip vertikal. Reader memotong
 *     strip dengan container overflow:hidden + offset Y.
 *   - "images": 1 halaman = 1 file (offset Y selalu 0).
 *
 * Karena itu kode di sini tidak perlu tahu mode-nya.
 *
 * Data come dari SSR (lihat Reader.astro):
 *   #reader-data -> { slug, count, pageW, pageH, mode, indexUrl }
 * Indeks lengkap (posisi tiap halaman) diambil dari indexUrl.
 */

export interface ReaderData {
  slug: string;
  count: number;
  pageW: number;
  pageH: number;
  mode: 'sheets' | 'images';
  indexUrl: string;
}

interface PageIndex {
  slug: string;
  mode: string;
  count: number;
  pageW: number;
  pageH: number;
  strips: { file: string; pages: [number, number][] }[];
}

interface Loc {
  strip: number;
  y: number;
  h: number;
}

const POS_KEY = (slug: string) => `pb:pos:${slug}`;
const THEME_KEY = 'pb:theme';

/** Peta halaman (0-based) -> posisi di dalam strip. */
function buildLocator(index: PageIndex): Loc[] {
  const locs: Loc[] = [];
  index.strips.forEach((strip, stripIdx) => {
    for (const [y, h] of strip.pages) locs.push({ strip: stripIdx, y, h });
  });
  return locs;
}

function readStoredPosition(slug: string): number {
  try {
    const raw = localStorage.getItem(POS_KEY(slug));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { page?: number };
    return Number.isFinite(parsed.page) ? Math.max(0, (parsed.page ?? 1) - 1) : 0;
  } catch {
    return 0;
  }
}

function storePosition(slug: string, page: number) {
  try {
    localStorage.setItem(POS_KEY(slug), JSON.stringify({ page: page + 1, at: Date.now() }));
  } catch {
    /* kuota penuh / mode privat */
  }
}

function readTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* abaikan */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function initReader() {
  const root = document.getElementById('reader');
  const dataEl = document.getElementById('reader-data');
  if (!root || !dataEl) return;

  let data: ReaderData;
  try {
    data = JSON.parse(dataEl.textContent ?? '{}') as ReaderData;
  } catch {
    return;
  }
  if (!data.slug || !data.count) return;

  const stage = root.querySelector<HTMLElement>('[data-stage]');
  const viewport = root.querySelector<HTMLElement>('[data-viewport]');
  const layerA = root.querySelector<HTMLImageElement>('[data-layer="a"]');
  const layerB = root.querySelector<HTMLImageElement>('[data-layer="b"]');
  const counter = root.querySelector<HTMLElement>('[data-counter]');
  const progress = root.querySelector<HTMLElement>('[data-progress]');
  const loader = root.querySelector<HTMLElement>('[data-loader]');
  const jumpInput = root.querySelector<HTMLInputElement>('[data-jump]');
  if (!stage || !viewport || !layerA || !layerB) return;

  const total = data.count;
  let index: PageIndex | null = null;
  let locs: Loc[] = [];
  let page = 0;
  let activeLayer: HTMLImageElement = layerA;
  let idleLayer: HTMLImageElement = layerB;
  let activeFile = '';
  let chromeTimer = 0;
  let saveTimer = 0;
  let wheelAccum = 0;
  let wheelLock = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  const prefetched = new Set<string>();

  // ---------------------------------------------------------------------
  // Tema
  // ---------------------------------------------------------------------
  function applyTheme(theme: 'light' | 'dark') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    const btn = root.querySelector<HTMLButtonElement>('[data-theme-toggle]');
    if (btn) {
      btn.setAttribute('aria-pressed', String(theme === 'dark'));
      btn.setAttribute('aria-label', theme === 'dark' ? 'Mode terang' : 'Mode gelap');
    }
  }

  applyTheme(readTheme());

  // ---------------------------------------------------------------------
  // Penskalaan & geometri
  // ---------------------------------------------------------------------
  function scale(): number {
    const vw = stage.clientWidth;
    const vh = stage.clientHeight;
    if (!vw || !vh) return 1;
    return Math.min(vw / data.pageW, vh / data.pageH);
  }

  /**
   * Terapkan ukuran & offset ke satu layer saja.
   * Layer lama harus tetap menampilkan posisi lamanya selama transisi,
   * jadi setiap layer punya style sendiri.
   */
  function applyGeometry(layer: HTMLImageElement, loc: Loc, s: number) {
    // Halaman landscape lebih pendek -> dipusatkan vertikal.
    const extra = Math.max(0, (data.pageH - loc.h) / 2);
    layer.style.width = `${data.pageW * s}px`;
    layer.style.top = `${-(loc.y * s + extra * s)}px`;
  }

  function layoutViewport(s: number) {
    viewport.style.width = `${data.pageW * s}px`;
    viewport.style.height = `${data.pageH * s}px`;
  }

  // ---------------------------------------------------------------------
  // Render halaman
  // ---------------------------------------------------------------------
  function urlFor(loc: Loc): string {
    const file = index?.strips[loc.strip]?.file ?? '';
    const dir = data.mode === 'sheets' ? 'sheets' : 'pages';
    return `/${dir}/${data.slug}/${file}`;
  }

  function prefetch(n: number) {
    if (!index || n < 0 || n >= total) return;
    const loc = locs[n];
    if (!loc) return;
    const url = urlFor(loc);
    if (prefetched.has(url)) return;
    prefetched.add(url);
    const img = new Image();
    img.src = url;
  }

  function swapLayers() {
    if (activeLayer === idleLayer) return;
    activeLayer.classList.remove('is-active');
    idleLayer.classList.add('is-active');
    const tmp = activeLayer;
    activeLayer = idleLayer;
    idleLayer = tmp;
  }

  function showPage(n: number, { animate = true } = {}) {
    if (!index) return;
    page = Math.min(Math.max(0, n), total - 1);
    const loc = locs[page];
    if (!loc) return;

    const file = index.strips[loc.strip].file;
    const s = scale();
    layoutViewport(s);

    if (file === activeFile) {
      // Halaman berikutnya masih di strip yang sama -> cuma geser offset.
      applyGeometry(activeLayer, loc, s);
    } else {
      const url = urlFor(loc);
      idleLayer.src = url;
      loader?.classList.remove('is-hidden');
      const done = () => {
        loader?.classList.add('is-hidden');
        activeFile = file;
        applyGeometry(idleLayer, loc, s);
        swapLayers();
        if (!animate) idleLayer.classList.add('no-fade');
        else idleLayer.classList.remove('no-fade');
      };
      if (idleLayer.complete) done();
      else idleLayer.decode().then(done).catch(done);
    }

    updateCounter();
    updateProgress();
    scheduleSave();
    syncUrl();
    prefetch(page + 1);
    prefetch(page + 2);
  }

  function updateCounter() {
    const text = `${page + 1} / ${total}`;
    if (counter) counter.textContent = text;
    if (jumpInput && document.activeElement !== jumpInput) jumpInput.value = String(page + 1);
  }

  function updateProgress() {
    if (progress) progress.style.width = `${((page + 1) / total) * 100}%`;
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => storePosition(data.slug, page), 600);
  }

  function syncUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('p', String(page + 1));
    history.replaceState(null, '', url);
  }

  function go(delta: number) {
    const next = page + delta;
    if (next < 0 || next >= total) return;
    showPage(next);
    wakeChrome();
  }

  function jumpTo(n: number) {
    const target = Math.min(Math.max(0, n - 1), total - 1);
    showPage(target);
    wakeChrome();
  }

  // ---------------------------------------------------------------------
  // Chrome (bar atas/bawah, auto-hide)
  // ---------------------------------------------------------------------
  function wakeChrome() {
    root.classList.remove('is-idle');
    window.clearTimeout(chromeTimer);
    chromeTimer = window.setTimeout(() => {
      root.classList.add('is-idle');
    }, 3200);
  }

  // ---------------------------------------------------------------------
  // Navigasi: keyboard, klik, swipe, wheel
  // ---------------------------------------------------------------------
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        event.preventDefault();
        go(1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        event.preventDefault();
        go(-1);
        break;
      case 'Home':
        event.preventDefault();
        jumpTo(1);
        break;
      case 'End':
        event.preventDefault();
        jumpTo(total);
        break;
      case 'Escape':
        window.location.href = `/books/${data.slug}/`;
        break;
      default:
        break;
    }
    wakeChrome();
  });

  stage.addEventListener('click', (event) => {
    const rect = stage.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    if (ratio < 0.33) go(-1);
    else if (ratio > 0.67) go(1);
    else wakeChrome();
  });

  stage.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.changedTouches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    },
    { passive: true },
  );

  stage.addEventListener(
    'touchend',
    (event) => {
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        go(dx < 0 ? 1 : -1);
      }
    },
    { passive: true },
  );

  stage.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) return; // zoom browser
      const now = Date.now();
      if (now < wheelLock) return;
      wheelAccum += event.deltaY;
      if (Math.abs(wheelAccum) > 60) {
        wheelLock = now + 250;
        go(wheelAccum > 0 ? 1 : -1);
        wheelAccum = 0;
      }
      wakeChrome();
    },
    { passive: true },
  );

  root.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      go(Number(button.dataset.nav ?? 0));
    });
  });

  jumpInput?.addEventListener('change', () => {
    const value = Number(jumpInput.value);
    if (Number.isFinite(value)) jumpTo(value);
    jumpInput.blur();
  });

  root.querySelector<HTMLButtonElement>('[data-theme-toggle]')?.addEventListener('click', () => {
    const next = readTheme() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* abaikan */
    }
    applyTheme(next);
  });

  window.addEventListener('resize', () => {
    if (!index) return;
    const s = scale();
    layoutViewport(s);
    const loc = locs[page];
    if (loc) applyGeometry(activeLayer, loc, s);
  });

  document.addEventListener('mousemove', wakeChrome, { passive: true });

  // ---------------------------------------------------------------------
  // Muat index + mulai
  // ---------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const requested = Number(params.get('p'));

  fetch(data.indexUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((json: PageIndex) => {
      index = json;
      locs = buildLocator(index);

      const max = Math.min(total, locs.length) - 1;
      const start =
        Number.isFinite(requested) && requested > 0 ? requested - 1 : readStoredPosition(data.slug);
      page = Math.min(Math.max(0, start), Math.max(0, max));

      const s = scale();
      layoutViewport(s);
      showPage(page, { animate: false });
      wakeChrome();
    })
    .catch(() => {
      loader?.classList.add('is-hidden');
      root.querySelector<HTMLElement>('[data-error]')?.classList.remove('is-hidden');
    });
}
