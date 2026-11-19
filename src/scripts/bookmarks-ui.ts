/**
 * UI bookmark global.
 *
 * Semua elemen dengan `[data-bookmark-toggle]` otomatis tersinkron dengan
 * localStorage. Dipakai di kartu katalog dan halaman detail, jadi logikanya
 * tidak diduplikasi per halaman.
 */
import { isBookmarked, toggleBookmark, trackEvent } from './library';

const FILLED = 'currentColor';

function refresh(button: HTMLButtonElement) {
  const slug = button.dataset.slug;
  if (!slug) return;
  const active = isBookmarked(slug);
  button.setAttribute('aria-pressed', String(active));

  const icon = button.querySelector<SVGElement>('[data-bookmark-icon]');
  if (icon) {
    icon.setAttribute('fill', active ? FILLED : 'none');
  }
  const label = button.querySelector<HTMLElement>('[data-bookmark-label]');
  if (label) {
    label.textContent = active ? 'Tersimpan' : 'Simpan';
  }
}

function hydrate(button: HTMLButtonElement) {
  refresh(button);

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const { slug, title, author, cover } = button.dataset;
    if (!slug) return;

    const nowSaved = toggleBookmark({
      slug,
      title: title ?? '',
      author: author ?? '',
      cover: cover ?? '',
    });

    trackEvent('bookmark', slug, nowSaved ? 1 : -1);

    // Segarkan semua tombol untuk buku yang sama (kartu & detail bisa
    // tampil bersamaan di halaman yang sama).
    document.querySelectorAll<HTMLButtonElement>('[data-bookmark-toggle]').forEach((other) => {
      if (other.dataset.slug === slug) refresh(other);
    });
  });
}

function init() {
  document.querySelectorAll<HTMLButtonElement>('[data-bookmark-toggle]').forEach(hydrate);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.addEventListener('pb:library-change', () => {
  document.querySelectorAll<HTMLButtonElement>('[data-bookmark-toggle]').forEach(refresh);
});
