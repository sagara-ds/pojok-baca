import { getDatabase } from './database';
import { isPublicSlug } from '../services/curation';

export interface ReaderPage {
  number: number;
  assetPage: number;
  cropY: number | null;
  cropHeight: number | null;
  hasText: boolean;
  favorite: boolean;
}
export interface ReaderParagraph {
  index: number;
  body: string;
  chapter: number;
  title: string | null;
  favorite: boolean;
}

interface ReaderBase {
  session: string;
  edition: string;
  slug: string;
  title: string;
  author: string;
  hasPages: boolean;
  hasText: boolean;
  position: number | null;
  favorite: boolean;
}
export type ReaderData = ReaderBase & (
  { mode: 'page'; content: ReaderPage[] } | { mode: 'text'; content: ReaderParagraph[] }
);

export async function openPrivateReader(userId: string, slug: string, text: boolean) {
  if (!isPublicSlug(slug)) return null;
  const sql = getDatabase();
  const [row] = await sql`SELECT pojok_baca.open_private_reader(${userId}::uuid,${slug},${text}) AS data`;
  return row.data as ReaderData | null;
}
