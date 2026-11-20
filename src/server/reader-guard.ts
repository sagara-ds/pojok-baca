export function guardedRoute(path: string, method: string) {
  if (/^\/api\/admin(?:\/|$)/.test(path)) return 'admin_api';
  if (/^\/admin(?:\/|$)/.test(path)) return 'admin';
  if (/^\/my-library\/?$/.test(path)) return 'library';
  if (/^\/(?:books\/[^/]+\/read|read\/[^/]+)\/?$/.test(path)) return 'reader';
  if (/^\/onboarding\/?$/.test(path)) return 'onboarding';
  if (/^\/change-password\/?$/.test(path)) return 'password_change';
  if (method === 'POST' && /^\/api\/stats\/?$/.test(path)) return 'stats';
  return null;
}

export function safeReturnTo(value: string | null, origin: string): string {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/books/';
  try {
    const next = new URL(value, origin);
    const path = decodeURIComponent(next.pathname);
    if (next.origin === origin && !path.startsWith('//') && !path.includes('\\')
      && !/^\/(?:login|onboarding|change-password|api)(?:\/|$)/.test(path)) {
      return next.pathname + next.search + next.hash;
    }
  } catch {
    // Invalid return destinations fall back to the catalog.
  }
  return '/books/';
}
