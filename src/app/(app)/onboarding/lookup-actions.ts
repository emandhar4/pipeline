'use server';

import { getCurrentUser } from '@/lib/auth';
import { searchMajors, searchSchools } from '@/lib/onboarding/lookups';
import { createClient } from '@/lib/supabase/server';
import type { ComboOption } from './combobox';

/** Type-ahead for the School field. A failed lookup returns no rows so free text still works. */
export async function findSchools(q: string): Promise<ComboOption[]> {
  await getCurrentUser();
  if (typeof q !== 'string') return [];
  try {
    const hits = await searchSchools(await createClient(), q);
    return hits.map((s) => {
      const detail = [s.city, s.state].filter(Boolean).join(', ');
      return detail ? { id: s.id, label: s.name, detail } : { id: s.id, label: s.name };
    });
  } catch (e) {
    console.error('[onboarding] findSchools failed', { message: (e as Error).message });
    return [];
  }
}

/** Type-ahead for the Major field; the option id is the CIP code. */
export async function findMajors(q: string): Promise<ComboOption[]> {
  await getCurrentUser();
  if (typeof q !== 'string') return [];
  try {
    const hits = await searchMajors(await createClient(), q);
    return hits.map((m) => ({ id: m.cip, label: m.title }));
  } catch (e) {
    console.error('[onboarding] findMajors failed', { message: (e as Error).message });
    return [];
  }
}
