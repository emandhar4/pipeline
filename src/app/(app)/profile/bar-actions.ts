'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { refreshMyMatches } from '@/lib/onboarding/profile';
import { barSchema, roleFieldSlugs } from '@/lib/scoring/bar';
import { createClient } from '@/lib/supabase/server';

export type BarFormState = {
  errors?: { bar?: string; company?: string; role?: string; pay?: string };
  message?: string;
  saved?: boolean;
  /** What the user submitted, so a failed attempt keeps their input. */
  values?: { company: string; role: string; pay: string };
};

const text = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
};

export async function saveBar(_prev: BarFormState, formData: FormData): Promise<BarFormState> {
  const { id } = await getCurrentUser();
  const values = { company: text(formData, 'company'), role: text(formData, 'role'), pay: text(formData, 'pay') };
  const parsed = barSchema.safeParse(values);
  if (!parsed.success) {
    const errors: NonNullable<BarFormState['errors']> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0];
      const key = k === 'company' || k === 'role' || k === 'pay' ? k : 'bar';
      errors[key] ??= i.message;
    }
    return { errors, values };
  }
  const { company, role, pay_cents, pay_period } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from('bars').upsert(
    {
      user_id: id,
      company,
      role,
      pay_cents,
      pay_period,
      role_field_slugs: role ? roleFieldSlugs(role) : [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('[profile] saveBar failed', { message: error.message });
    return { message: 'Could not save your bar. Try again in a minute.', values };
  }
  revalidatePath('/profile');
  revalidatePath('/dashboard');
  try {
    await refreshMyMatches();
  } catch (e) {
    console.error('[profile] refresh after saveBar failed', { message: (e as Error).message });
    return { message: 'Saved, but matches did not refresh. They update with the next daily run.', saved: true, values };
  }
  return { saved: true };
}

export async function removeBar(): Promise<void> {
  const { id } = await getCurrentUser();
  const supabase = await createClient();
  const { error } = await supabase.from('bars').delete().eq('user_id', id);
  if (error) {
    console.error('[profile] removeBar failed', { message: error.message });
    return;
  }
  await refreshMyMatches().catch((e: unknown) =>
    console.error('[profile] refresh after removeBar failed', { message: (e as Error).message }),
  );
  revalidatePath('/profile');
  revalidatePath('/dashboard');
}

const RELATIONS = z.enum(['target', 'dream', 'capped', 'rejected']);

export async function setCompanyRelation(companyId: string, relation: string): Promise<void> {
  const { id } = await getCurrentUser();
  if (!z.uuid().safeParse(companyId).success) return;
  const rel = RELATIONS.safeParse(relation);
  if (!rel.success) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from('user_companies')
    .update({ relation: rel.data })
    .eq('user_id', id)
    .eq('company_id', companyId);
  if (error) {
    console.error('[profile] setCompanyRelation failed', { message: error.message });
    return;
  }
  await refreshMyMatches().catch((e: unknown) =>
    console.error('[profile] refresh after relation failed', { message: (e as Error).message }),
  );
  revalidatePath('/profile');
  revalidatePath('/dashboard');
}
