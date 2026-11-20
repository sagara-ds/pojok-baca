import type { ReaderPage } from '../server/private-reader';

interface Configuration {
  mode: 'page' | 'text';
  session: string;
  edition: string;
  position: number;
  hasText: boolean;
  pages: ReaderPage[];
}

interface ActionInput {
  index?: number;
  seq?: number;
  visit?: string;
  enabled?: boolean;
  text?: string;
}

export function initPrivateReader() {
  const source = document.querySelector('#private-reader-config')?.textContent;
  if (!source) return;
  const config = JSON.parse(source) as Configuration;
  if (config.mode === 'page' && config.hasText) {
    try {
      const url = new URL(location.href);
      if (!url.searchParams.has('mode') && localStorage.getItem('pb:mode') === 'text') {
        url.searchParams.set('mode', 'text');
        location.replace(url);
        return;
      }
    } catch { /* the explicit mode switch still works */ }
  }
  const feedback = document.querySelector('#reader-feedback');
  const focus = document.querySelector<HTMLButtonElement>('#reader-focus')!;
  const header = document.querySelector('header')!;
  let anchor = config.position;
  const toggleFocus = (enabled: boolean) => {
    const marker = config.mode === 'text' ? document.getElementById(`paragraph-${anchor}`) : document.getElementById('reader-page');
    const readingOffset = () => (marker?.getBoundingClientRect().top ?? 0) - header.offsetHeight;
    const offset = window.scrollY > 0 && marker && !marker.hidden ? readingOffset() : undefined;
    document.body.toggleAttribute('data-reader-focus', enabled);
    focus.setAttribute('aria-pressed', String(enabled));
    focus.textContent = enabled ? 'Keluar mode fokus' : 'Mode fokus';
    if (offset !== undefined) window.scrollBy({ top: readingOffset() - offset, behavior: 'instant' });
  };
  focus.hidden = false;
  focus.addEventListener('click', () => toggleFocus(focus.getAttribute('aria-pressed') !== 'true'));
  const shortcuts = document.querySelector<HTMLDialogElement>('#reader-shortcuts');
  const shortcutsOpen = document.querySelector<HTMLButtonElement>('#reader-shortcuts-open');
  const shortcutsClose = shortcuts?.querySelector<HTMLButtonElement>('[data-shortcuts-close]');
  let previousFocus: HTMLElement | null = null;
  function openShortcuts() {
    if (!shortcuts || shortcuts.open) return;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    shortcuts.showModal();
    shortcutsClose?.focus();
  }
  if (shortcutsOpen) shortcutsOpen.hidden = false;
  shortcutsOpen?.addEventListener('click', openShortcuts);
  shortcutsClose?.addEventListener('click', () => shortcuts?.close());
  shortcuts?.addEventListener('close', () => {
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
    const chapters = document.querySelector<HTMLDetailsElement>('#reader-chapters[open]');
    if (chapters) {
      chapters.open = false;
      chapters.querySelector('summary')?.focus();
    } else if (focus.getAttribute('aria-pressed') === 'true') {
      toggleFocus(false);
      focus.focus();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]')) return;
    const dialogOpen = document.querySelector('dialog[open]');
    if (event.key === '?') {
      if (dialogOpen) return;
      event.preventDefault();
      openShortcuts();
      return;
    }
    if (dialogOpen) return;
    if ((event.key === 'f' || event.key === 'F') && !event.shiftKey) {
      event.preventDefault();
      toggleFocus(focus.getAttribute('aria-pressed') !== 'true');
    }
  });
  const progress = document.querySelector<HTMLProgressElement>('#reader-progress')!;
  const positionLabel = document.querySelector('#reader-position')!;
  const updateProgress = (position: number) => {
    progress.value = position;
    positionLabel.textContent = `${config.mode === 'page' ? 'Halaman' : 'Paragraf'} ${position} / ${progress.max}`;
  };
  if (config.mode === 'text') {
    const theme = document.querySelector<HTMLSelectElement>('#reader-theme')!;
    const smaller = document.querySelector<HTMLButtonElement>('#reader-type-smaller')!;
    const larger = document.querySelector<HTMLButtonElement>('#reader-type-larger')!;
    let size = 18;
    try {
      const stored = localStorage.getItem('pb:reader-theme');
      if (stored && ['white','sepia','dark'].includes(stored)) theme.value = stored;
      size = Math.min(32, Math.max(14, Number(localStorage.getItem('pb:reader-size')) || 18));
    } catch {}
    const setTheme = () => {
      document.body.dataset.readerTheme = theme.value;
      try { localStorage.setItem('pb:reader-theme', theme.value); } catch {}
    };
    const setSize = (diff: number) => {
      size = Math.min(32, Math.max(14, size+diff));
      document.body.style.setProperty('--reader-text-size', `${size}px`);
      smaller.disabled = size <= 14;
      larger.disabled = size >= 32;
      try { localStorage.setItem('pb:reader-size', String(size)); } catch {}
    };
    theme.addEventListener('change', setTheme);
    smaller.addEventListener('click', () => setSize(-2));
    larger.addEventListener('click', () => setSize(2));
    setTheme();
    setSize(0);
  }
  const tell = (message: string) => { if (feedback) feedback.textContent = message; };
  const visible = () => document.visibilityState === 'visible';
  const send = async (action: string, input: ActionInput = {}) => {
    const response = await fetch('/api/reader/action/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, session: config.session, ...input }),
      keepalive: true,
    });
    if (!response.ok) throw new Error(`Reader action failed: ${response.status}`);
    return await response.json() as { ok: boolean; visit?: string };
  };

  let contentReady = false;
  let confirmed = false;
  let confirmTimer: number | undefined;
  function startConfirmation() {
    if (!visible() || !contentReady || confirmed || confirmTimer !== undefined) return;
    confirmTimer = window.setTimeout(async () => {
      confirmTimer = undefined;
      if (!visible() || !contentReady || confirmed) return;
      try {
        await send('confirm');
        confirmed = true;
      } catch {
        startConfirmation();
      }
    }, 15_100);
  }
  function stopConfirmation() {
    clearTimeout(confirmTimer);
    confirmTimer = undefined;
  }
  document.addEventListener('visibilitychange', () => visible() ? startConfirmation() : stopConfirmation());

  let sequence = 0;
  const savePosition = (index: number) => {
    void send('position', { index, seq: ++sequence }).catch(() => {});
  };
  const favorite = document.querySelector<HTMLButtonElement>('#reader-favorite-anchor');
  const bookFavorite = document.querySelector<HTMLButtonElement>('#reader-favorite-book');
  const favorites = new Map<number, boolean>();

  function showFavorite(button: HTMLButtonElement | null, checked: boolean, label: string) {
    if (!button) return;
    button.setAttribute('aria-pressed', String(checked));
    button.textContent = checked ? `Hapus favorit ${label}` : `Favoritkan ${label}`;
  }
  const anchorLabel = config.mode === 'page' ? 'halaman' : 'paragraf';
  const updateAnchorLabel = () => showFavorite(favorite, favorites.get(anchor) ?? false, anchorLabel);
  bookFavorite?.addEventListener('click', async () => {
    bookFavorite.disabled = true;
    const enabled = bookFavorite.getAttribute('aria-pressed') !== 'true';
    try {
      await send('favorite_book', { enabled });
      showFavorite(bookFavorite, enabled, 'buku');
      tell(enabled ? 'Buku disimpan ke favorit.' : 'Buku dihapus dari favorit.');
    } catch { tell('Favorit buku belum dapat disimpan.'); }
    finally { bookFavorite.disabled = false; }
  });
  favorite?.addEventListener('click', async () => {
    favorite.disabled = true;
    const index = anchor;
    const enabled = !favorites.get(index);
    try {
      await send('favorite_anchor', { index, enabled });
      favorites.set(index, enabled);
      updateAnchorLabel();
      tell(enabled ? 'Posisi disimpan ke favorit.' : 'Posisi dihapus dari favorit.');
    } catch { tell('Posisi belum dapat disimpan.'); }
    finally { favorite.disabled = false; }
  });
  async function saveQuote(index: number, text?: string) {
    try {
      await send('quote', { index, text });
      tell('Kutipan privat tersimpan.');
      return true;
    } catch {
      tell('Kutipan belum dapat disimpan.');
      return false;
    }
  }

  if (config.mode === 'page') {
    const canvas = document.querySelector<HTMLCanvasElement>('#reader-page')!;
    const input = document.querySelector<HTMLInputElement>('#reader-page-number')!;
    const prev = document.querySelector<HTMLButtonElement>('#reader-prev')!;
    const next = document.querySelector<HTMLButtonElement>('#reader-next')!;
    const retry = document.querySelector<HTMLButtonElement>('#reader-retry')!;
    const quotePage = document.querySelector<HTMLButtonElement>('#reader-quote-page')!;
    const dialog = document.querySelector<HTMLDialogElement>('#reader-quote-dialog')!;
    const pages = new Map(config.pages.map((page) => [page.number, page]));
    const positions = new Map(config.pages.map((page, index) => [page.number, index + 1]));
    for (const page of config.pages) favorites.set(page.number, page.favorite);
    const images = new Map<number, { image: HTMLImageElement; ready: Promise<void> }>();
    let visiblePage: number | undefined;
    let canvasInView = false;
    let drawVersion = 0;
    let visitVersion = 0;
    let visit: string | undefined;
    let visitTimer: number | undefined;
    let visitQueue = Promise.resolve();

    function imageFor(assetPage: number) {
      const existing = images.get(assetPage);
      if (existing) return existing;
      const image = new Image();
      image.src = `/api/reader/asset/?edition=${config.edition}&page=${assetPage}`;
      const ready = image.decode();
      void ready.catch(() => { if (images.get(assetPage)?.image === image) images.delete(assetPage); });
      const entry = { image, ready };
      images.set(assetPage, entry);
      return entry;
    }

    function stopVisit() {
      visitVersion++;
      clearTimeout(visitTimer);
      const previous = visit;
      visit = undefined;
      if (previous) visitQueue = visitQueue.then(() => send('cancel_page', { visit: previous }).then(() => {}, () => {}));
    }
    function startVisit(index: number) {
      if (!visible() || !canvasInView || visiblePage !== index) return;
      const version = ++visitVersion;
      visitQueue = visitQueue.then(async () => {
        if (version !== visitVersion || !visible() || !canvasInView) return;
        try {
          const { visit: started } = await send('begin_page', { index });
          if (!started) return;
          if (version !== visitVersion || !visible() || !canvasInView) {
            await send('cancel_page', { visit: started });
            return;
          }
          visit = started;
          visitTimer = window.setTimeout(() => {
            if (version !== visitVersion || !visible() || !canvasInView) return;
            visitQueue = visitQueue.then(() => send('finish_page', { visit: started }).then(() => {}, () => {}));
          }, 4_100);
        } catch { /* a failed write is not counted */ }
      });
    }
    async function show(index: number) {
      const page = pages.get(index);
      if (!page) return;
      const version = ++drawVersion;
      stopVisit();
      canvas.hidden = true;
      retry.hidden = true;
      quotePage.disabled = true;
      visiblePage = undefined;
      anchor = index;
      input.value = String(index);
      prev.disabled = !pages.has(index - 1);
      next.disabled = !pages.has(index + 1);
      updateAnchorLabel();
      tell('Memuat halaman…');
      const windowPages = [page, pages.get(index + 1), pages.get(index + 2)];
      const wanted = new Set(windowPages.flatMap((item) => item ? [item.assetPage] : []));
      for (const [key, entry] of images) {
        if (!wanted.has(key)) {
          if (!entry.image.complete) entry.image.removeAttribute('src');
          images.delete(key);
        }
      }
      const { image, ready } = imageFor(page.assetPage);
      for (const key of wanted) if (key !== page.assetPage) imageFor(key);
      try {
        await ready;
        if (version !== drawVersion) return;
        canvas.width = image.naturalWidth;
        canvas.height = page.cropHeight ?? image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        const y = page.cropY ?? 0;
        if (y + canvas.height > image.naturalHeight) throw new Error('Invalid crop');
        context.drawImage(image, 0, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        canvas.hidden = false;
        canvas.setAttribute('aria-label', `Halaman ${index}`);
        quotePage.disabled = false;
        updateProgress(positions.get(index)!);
        tell('');
        visiblePage = index;
        contentReady = true;
        savePosition(index);
        startConfirmation();
        startVisit(index);
      } catch {
        if (version !== drawVersion) return;
        retry.hidden = false;
        tell('Halaman belum dapat dimuat.');
      }
    }
    prev.addEventListener('click', () => void show(anchor - 1));
    next.addEventListener('click', () => void show(anchor + 1));
    retry.addEventListener('click', () => void show(anchor));
    document.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || document.querySelector('dialog[open]') || event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return;
      if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]')) return;
      if (event.key === 'Home' || event.key === 'End') {
        const index = event.key === 'Home'
          ? config.pages[0]?.number
          : config.pages[config.pages.length - 1]?.number;
        if (index === undefined || !pages.has(index)) return;
        event.preventDefault();
        void show(index);
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const index = anchor + (event.key === 'ArrowLeft' ? -1 : 1);
      if (!pages.has(index)) return;
      event.preventDefault();
      void show(index);
    });
    input.addEventListener('change', () => {
      if (pages.has(input.valueAsNumber)) void show(input.valueAsNumber);
      else input.value = String(anchor);
    });
    const quoteForm = dialog.querySelector('form')!;
    const quoteInput = dialog.querySelector('textarea')!;
    const quoteStatus = dialog.querySelector('[data-quote-status]')!;
    const quoteSave = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const quoteCancel = dialog.querySelector<HTMLButtonElement>('[data-quote-cancel]')!;
    let quoteIndex = anchor;
    quotePage.addEventListener('click', async () => {
      const page = pages.get(anchor);
      if (!page) return;
      if (page.hasText) {
        quotePage.disabled = true;
        await saveQuote(page.number);
        if (visiblePage === page.number) quotePage.disabled = false;
      } else {
        quoteIndex = page.number;
        quoteForm.reset();
        quoteStatus.textContent = '';
        dialog.showModal();
        quoteInput.focus();
      }
    });
    quoteCancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', (event) => {
      if (quoteSave.disabled) event.preventDefault();
    });
    quoteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = quoteInput.value.trim();
      if (quoteSave.disabled) return;
      if (!text) {
        quoteStatus.textContent = 'Isi teks kutipan.';
        quoteInput.focus();
        return;
      }
      quoteSave.disabled = true;
      quoteCancel.disabled = true;
      quoteStatus.textContent = 'Menyimpan kutipan…';
      try {
        if (await saveQuote(quoteIndex, text)) dialog.close();
        else quoteStatus.textContent = 'Kutipan belum dapat disimpan. Coba lagi.';
      } finally {
        quoteSave.disabled = false;
        quoteCancel.disabled = false;
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (!visible()) stopVisit();
      else if (visiblePage !== undefined) startVisit(visiblePage);
    });
    const observer = new IntersectionObserver(([entry]) => {
      const inView = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.05);
      if (canvasInView === inView) return;
      canvasInView = inView;
      if (!canvasInView) stopVisit();
      else if (visiblePage !== undefined) startVisit(visiblePage);
    }, { threshold: 0.05 });
    observer.observe(canvas);
    window.addEventListener('pagehide', stopVisit);
    void show(anchor);
    return;
  }

  const paragraphs = [...document.querySelectorAll<HTMLElement>('#reader-text [data-index]')];
  const positions = new Map(paragraphs.map((paragraph, index) => [Number(paragraph.dataset.index), index + 1]));
  for (const p of paragraphs) favorites.set(Number(p.dataset.index), p.dataset.favorite === 'true');
  updateAnchorLabel();
  let debounce: number | undefined;
  let queuedPosition: number | undefined;
  const flush = () => {
    if (debounce === undefined) return;
    clearTimeout(debounce);
    debounce = undefined;
    savePosition(anchor);
  };
  function queuePosition(index: number) {
    if (queuedPosition === index) return;
    queuedPosition = index;
    anchor = index;
    updateProgress(positions.get(index)!);
    updateAnchorLabel();
    clearTimeout(debounce);
    debounce = window.setTimeout(flush, 3000);
  }
  const chapters = document.querySelector<HTMLDetailsElement>('#reader-chapters');
  chapters?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) chapters.open = false;
  });
  let paragraphObserver: IntersectionObserver | undefined;
  let margins = '';
  function trackParagraphs() {
    const top = header.offsetHeight + 12;
    const bottom = Math.max(0, Math.min(Math.round(innerHeight * .45), innerHeight - top - 48));
    const nextMargins = `-${top}px 0px -${bottom}px 0px`;
    if (margins === nextMargins) return;
    margins = nextMargins;
    document.documentElement.style.scrollPaddingTop = `${top}px`;
    paragraphObserver?.disconnect();
    const visible = new Set<HTMLElement>();
    paragraphObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target as HTMLElement);
        else visible.delete(entry.target as HTMLElement);
      }
      const first = [...visible].sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))[0];
      if (first) queuePosition(Number(first.dataset.index));
    }, { rootMargin: margins });
    for (const paragraph of paragraphs) paragraphObserver.observe(paragraph);
  }
  new ResizeObserver(trackParagraphs).observe(header);
  window.addEventListener('resize', trackParagraphs);
  trackParagraphs();
  const hash = location.hash.match(/^#(?:paragraph|chapter)-(\d+)$/);
  if (hash && positions.has(Number(hash[1]))) queuePosition(Number(hash[1]));
  if (hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
  else if (anchor !== Number(paragraphs[0]?.dataset.index)) {
    document.getElementById(`paragraph-${anchor}`)?.scrollIntoView({ behavior: 'instant' });
  }
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || document.querySelector('dialog[open]') || event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return;
    if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]')) return;
    if (event.key !== 'Home' && event.key !== 'End') return;
    const target = event.key === 'Home' ? paragraphs[0] : paragraphs[paragraphs.length - 1];
    if (!target) return;
    event.preventDefault();
    queuePosition(Number(target.dataset.index));
    target.scrollIntoView({ block: 'start' });
  });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (!visible()) flush(); });

  const quote = document.querySelector<HTMLButtonElement>('#reader-quote-text')!;
  let selected: { index: number; text: string } | undefined;
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    const start = selection?.anchorNode?.parentElement?.closest<HTMLElement>('#reader-text [data-index]');
    const end = selection?.focusNode?.parentElement?.closest('#reader-text [data-index]');
    const text = selection?.toString().trim().slice(0, 2000);
    quote.hidden = true;
    selected = undefined;
    if (!start || start !== end || !text || !selection?.rangeCount) return;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    quote.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 170))}px`;
    quote.style.top = `${Math.max(8, rect.top - 46)}px`;
    selected = { index: Number(start.dataset.index), text };
    quote.hidden = false;
  });
  quote.addEventListener('mousedown', (event) => event.preventDefault());
  quote.addEventListener('click', () => {
    if (selected) void saveQuote(selected.index, selected.text);
    quote.hidden = true;
  });
  requestAnimationFrame(() => {
    contentReady = paragraphs.length > 0;
    startConfirmation();
  });
}
