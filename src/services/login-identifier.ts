const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const nisPattern = /^[0-9]{1,32}$/;

export function normalizeUsername(value: string): string | null {
  const username = value.trim().toLowerCase();
  return usernamePattern.test(username) && /[a-z]/.test(username) ? username : null;
}

export function normalizeNis(value: string): string | null {
  const nis = value.trim();
  return nisPattern.test(nis) ? nis : null;
}

export function normalizeLoginIdentifier(value: string): string | null {
  return normalizeNis(value) ?? normalizeUsername(value);
}
