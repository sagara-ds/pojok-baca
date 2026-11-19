/**
 * Navigasi tab Koleksiku tanpa reload.
 *
 * Halaman tetap berfungsi tanpa JavaScript karena tautan tab adalah tautan
 * biasa. Saat JavaScript aktif, panel dan daftar tab diganti dari HTML yang
 * sama supaya fokus, riwayat peramban, dan pembaca layar tetap konsisten.
 */
export function initLibraryTabs() {
  const tabs = document.querySelector<HTMLElement>('[data-library-tabs]');
  const panel = document.querySelector<HTMLElement>('[data-library-panel]');
  const status = document.querySelector<HTMLElement>('[data-library-status]');
  if (!tabs || !panel) return;

  let request: AbortController | undefined;
  let latest = 0;

  async function load(destination: URL, push: boolean) {
    const id = ++latest;
    request?.abort();
    const current = new AbortController();
    request = current;
    panel!.setAttribute('aria-busy', 'true');
    if (status) status.textContent = 'Memuat koleksi…';

    try {
      const response = await fetch(destination, {
        signal: current.signal,
        headers: { Accept: 'text/html' },
      });
      if (!response.ok || response.redirected) throw new Error('Koleksi belum dapat dimuat');
      const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nextPanel = parsed.querySelector('[data-library-panel]');
      const nextTabs = parsed.querySelector('[data-library-tabs]');
      if (!nextPanel || !nextTabs || current.signal.aborted || id !== latest) return;

      if (push) history.pushState(null, '', destination);
      panel!.replaceChildren(...nextPanel.childNodes);
      tabs!.replaceChildren(...nextTabs.childNodes);

      const active = tabs!.querySelector<HTMLElement>('[aria-current="page"]');
      active?.focus({ preventScroll: true });
      if (status) status.textContent = active ? `Menampilkan ${active.dataset.tabLabel ?? 'koleksi'}.` : '';
    } catch {
      if (!current.signal.aborted) location.assign(destination);
    } finally {
      if (id === latest) {
        panel!.removeAttribute('aria-busy');
        request = undefined;
      }
    }
  }

  tabs.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!link || !tabs.contains(link)) return;
    const destination = new URL(link.href, location.href);
    if (destination.href === location.href) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    void load(destination, true);
  });

  window.addEventListener('popstate', () => {
    if (location.pathname === '/my-library/' || location.pathname === '/my-library') {
      void load(new URL(location.href), false);
    }
  });
}
