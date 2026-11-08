import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { Step1 } from './schema';

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

const PICK_AGAIN = (what: string) => `Pick your ${what} from the list again, or use what you typed.`;

/**
 * Checks a picked school and major against the lookup tables and replaces their labels with
 * the database names, so a client-supplied label is never stored for a picked row. Free text
 * (null id) passes through unchanged. Throws on a database error.
 */
export async function resolveStepOneLookups(
  client: Client,
  input: Step1,
): Promise<{ ok: true; value: Step1 } | { ok: false; errors: Record<string, string> }> {
  const [school, major] = await Promise.all([
    input.school_id === null
      ? null
      : client.from('schools').select('name').eq('id', input.school_id).maybeSingle(),
    input.major_cip === null
      ? null
      : client.from('majors').select('title').eq('cip_code', input.major_cip).maybeSingle(),
  ]);
  if (school?.error) throw new Error(`read schools failed: ${school.error.message}`);
  if (major?.error) throw new Error(`read majors failed: ${major.error.message}`);

  const errors: Record<string, string> = {};
  const value = { ...input };
  if (school) {
    if (school.data) value.school = school.data.name;
    else errors.school = PICK_AGAIN('school');
  }
  if (major) {
    if (major.data) value.major = major.data.title;
    else errors.major = PICK_AGAIN('major');
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}
