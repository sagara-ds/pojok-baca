/**
 * Preferensi tampilan: tema, ukuran font, dan mode baca default.
 * Disimpan di localStorage dan diterapkan ke elemen <html>.
 */

export type Theme = 'light' | 'dark' | 'system';
export type FontSize = 'sm' | 'md' | 'lg';
export type ReadingMode = 'image' | 'text';

const THEME_KEY = 'pb:theme';
const FONT_KEY = 'pb:font';
const MODE_KEY = 'pb:mode';

function get(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* mode privat */
  }
}

export function getTheme(): Theme {
  const value = get(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme): void {
  set(THEME_KEY, theme);
  applyTheme(theme);
}

export function getFontSize(): FontSize {
  const value = get(FONT_KEY);
  return value === 'sm' || value === 'lg' ? value : 'md';
}

export function applyFontSize(size: FontSize): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.font = size;
}

export function setFontSize(size: FontSize): void {
  set(FONT_KEY, size);
  applyFontSize(size);
}

export function getReadingMode(): ReadingMode {
  return get(MODE_KEY) === 'text' ? 'text' : 'image';
}

export function setReadingMode(mode: ReadingMode): void {
  set(MODE_KEY, mode);
}
