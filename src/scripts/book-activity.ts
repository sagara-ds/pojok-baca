export function initBookActivity() {
  const panel = document.querySelector<HTMLElement>('[data-activity-panel]');
  const status = document.querySelector('[data-activity-status]');
  if (!panel || !status) return;
  const bookPath = location.pathname;
  let request: AbortController | undefined;

  async function load(destination: URL, push: boolean) {
    request?.abort();
    const current = new AbortController();
    request = current;
    const query = new URL(destination);
    query.searchParams.set('tab', destination.searchParams.get('tab') ?? 'readers');
    query.hash = '';
    panel!.setAttribute('aria-busy', 'true');
    status!.textContent = 'Memuat aktivitas buku…';

    try {
      const response = await fetch(query, { signal: current.signal });
      if (!response.ok || response.redirected) throw new Error('Aktivitas belum dapat dimuat');
      const document = new DOMParser().parseFromString(await response.text(), 'text/html');
      const next = document.querySelector('[data-activity-panel]');
      if (!next) throw new Error('Panel aktivitas tidak tersedia');
      if (current.signal.aborted) return;

      const focusTab = panel!.contains(window.document.activeElement);
      if (push && destination.href !== location.href) history.pushState(null, '', destination);
      panel!.replaceChildren(...next.childNodes);
      const active = panel!.querySelector<HTMLElement>('[aria-current="page"]');
      if (focusTab) active?.focus({ preventScroll: true });
      status!.textContent = active?.textContent?.trim() ?? '';
    } catch {
      if (!current.signal.aborted) {
        if (push) location.assign(destination);
        else location.reload();
      }
    } finally {
      if (request === current) {
        panel!.removeAttribute('aria-busy');
        request = undefined;
      }
    }
  }

  panel.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('nav a') : null;
    if (!link) return;
    event.preventDefault();
    void load(new URL(link.href), true);
  });
  window.addEventListener('popstate', () => {
    if (location.pathname === bookPath) void load(new URL(location.href), false);
  });
}
