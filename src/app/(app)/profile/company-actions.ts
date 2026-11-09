'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { parseCareersUrl } from '@/lib/companies/careers-url';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';

export type CompanyFormState = { errors?: { name?: string; careers_url?: string }; message?: string };

const BAD_LINK = "That link isn't a careers page Pipeline can read. Leave it blank and we'll search by name.";

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a company name').max(120, 'Keep the name to 120 characters'),
  careers_url: z.string().trim().max(500, BAD_LINK),
});

export async function addCompany(_prev: CompanyFormState, formData: FormData): Promise<CompanyFormState> {
  await getCurrentUser();
  const parsed = schema.safeParse({
    name: formData.get('name') ?? '',
    careers_url: formData.get('careers_url') ?? '',
  });
  if (!parsed.success) {
    const errors: NonNullable<CompanyFormState['errors']> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0] === 'careers_url' ? 'careers_url' : 'name';
      errors[k] ??= i.message;
    }
    return { errors };
  }
  const { name, careers_url } = parsed.data;
  let board: ReturnType<typeof parseCareersUrl> = null;
  if (careers_url) {
    board = parseCareersUrl(careers_url);
    if (!board) return { errors: { careers_url: BAD_LINK } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('watch_company', {
    p_name: name,
    p_careers_url: (board ? careers_url : null) as string,
    p_ats: (board?.ats ?? null) as string,
    p_token: (board?.token ?? null) as string,
    p_meta: (board?.meta ?? {}) as Json,
  });
  if (error) {
    if (error.message.includes('limit')) {
      return { message: 'You can watch up to 100 companies. Remove one first.' };
    }
    console.error('[profile] watch_company failed', { message: error.message });
    return { message: 'Could not add that company. Try again in a minute.' };
  }
  revalidatePath('/profile');
  return {};
}

export async function removeCompany(companyId: string): Promise<void> {
  const { id } = await getCurrentUser();
  if (!z.uuid().safeParse(companyId).success) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from('user_companies')
    .delete()
    .eq('user_id', id)
    .eq('company_id', companyId);
  if (error) console.error('[profile] removeCompany failed', { message: error.message });
  revalidatePath('/profile');
}
