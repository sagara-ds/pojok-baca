import { env } from 'cloudflare:workers';
import { neon } from '@neondatabase/serverless';

export function serverSetting(name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || !value) throw new Error(`Konfigurasi server belum tersedia: ${name}`);
  return value;
}

export function getDatabase() {
  const connection = serverSetting('DATABASE_URL');
  if (!new URL(connection).hostname.split('.')[0]?.endsWith('-pooler')) {
    throw new Error('DATABASE_URL harus memakai endpoint Neon pooled.');
  }
  return neon(connection);
}
