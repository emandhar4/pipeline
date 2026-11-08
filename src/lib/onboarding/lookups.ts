import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Client = SupabaseClient<Database>;

export type SchoolHit = { id: string; name: string; city: string | null; state: string | null };
export type MajorHit = { cip: string; title: string };

const MAX_QUERY = 100;
const MIN_QUERY = 2;
const DEFAULT_LIMIT = 8;

/** Trimmed and capped search text, or null when it is too short to search. */
function query(q: string): string | null {
  const t = q.trim().slice(0, MAX_QUERY).trim();
  return t.length < MIN_QUERY ? null : t;
}

/** Ranked school matches (at most 20, set by the database). Throws on a database error. */
export async function searchSchools(
  client: Client,
  q: string,
  limit = DEFAULT_LIMIT,
): Promise<SchoolHit[]> {
  const text = query(q);
  if (text === null) return [];
  const { data, error } = await client.rpc('search_schools', { q: text, lim: limit });
  if (error) throw new Error(`search_schools failed: ${error.message}`);
  return data.map((s) => ({ id: s.id, name: s.name, city: s.city, state: s.state }));
}

/** Ranked major matches by title (at most 20, set by the database). Throws on a database error. */
export async function searchMajors(
  client: Client,
  q: string,
  limit = DEFAULT_LIMIT,
): Promise<MajorHit[]> {
  const text = query(q);
  if (text === null) return [];
  const { data, error } = await client.rpc('search_majors', { q: text, lim: limit });
  if (error) throw new Error(`search_majors failed: ${error.message}`);
  return data.map((m) => ({ cip: m.cip_code, title: m.title }));
}
