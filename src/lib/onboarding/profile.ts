import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentUser } from '@/lib/auth';
import type { Database } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/server';
import { parsePayFloor } from './options';
import type { Step1, Step2 } from './schema';

type Client = SupabaseClient<Database>;
type Tables = Database['public']['Tables'];

export type ProfileRow = Tables['profiles']['Row'];
export type FieldRow = Tables['profile_fields']['Row'];
export type IndustryRow = Tables['profile_industries']['Row'];

export type OnboardingState = {
  step: number;
  profile: ProfileRow;
  fields: FieldRow[];
  industries: IndustryRow[];
};

async function currentStep(client: Client, userId: string): Promise<number> {
  const { data, error } = await client
    .from('profiles')
    .select('onboarding_step')
    .eq('user_id', userId)
    .single();
  if (error) throw new Error(`read onboarding_step failed: ${error.message}`);
  return data.onboarding_step ?? 0;
}

/** Writes step 1 answers. grad_date (YYYY-MM) is stored as the first of that month. */
export async function applyStep1(client: Client, userId: string, input: Step1): Promise<void> {
  const step = Math.max(await currentStep(client, userId), 1);
  const { error } = await client
    .from('profiles')
    .update({
      career_stage: input.career_stage,
      school: input.school || null,
      major: input.major || null,
      grad_date: input.grad_date ? `${input.grad_date}-01` : null,
      work_auth: input.work_auth,
      home_location: input.home_location || null,
      school_location: input.school_location || null,
      in_state_school: input.in_state_school,
      relocate: input.relocate,
      onboarding_step: step,
    })
    .eq('user_id', userId);
  if (error) throw new Error(`save step 1 failed: ${error.message}`);
}

/**
 * Writes pay floor and season first (the likeliest failure, before anything destructive), then
 * replaces the user's fields and industries (delete then insert; not one transaction,
 * see DECISIONS.md). onboarding_step is bumped last, so a failure part-way never marks the
 * user as onboarded.
 */
export async function applyStep2(client: Client, userId: string, input: Step2): Promise<void> {
  const pay = parsePayFloor(input.pay_amount, input.pay_period);

  const upd = await client
    .from('profiles')
    .update({
      pay_floor_cents: pay.cents,
      pay_floor_period: pay.period,
      season: input.season,
    })
    .eq('user_id', userId);
  if (upd.error) throw new Error(`save step 2 failed: ${upd.error.message}`);

  const delFields = await client.from('profile_fields').delete().eq('user_id', userId);
  if (delFields.error) throw new Error(`clear fields failed: ${delFields.error.message}`);
  if (input.fields.length > 0) {
    const ins = await client.from('profile_fields').insert(
      input.fields.map((f) => ({
        user_id: userId,
        category_slug: f.category_slug,
        label: f.label,
        weight: f.weight,
      })),
    );
    if (ins.error) throw new Error(`save fields failed: ${ins.error.message}`);
  }

  const delInd = await client.from('profile_industries').delete().eq('user_id', userId);
  if (delInd.error) throw new Error(`clear industries failed: ${delInd.error.message}`);
  if (input.industries.length > 0) {
    const ins = await client.from('profile_industries').insert(
      input.industries.map((i) => ({
        user_id: userId,
        industry: i.industry,
        preference: i.preference,
      })),
    );
    if (ins.error) throw new Error(`save industries failed: ${ins.error.message}`);
  }

  const step = Math.max(await currentStep(client, userId), 2);
  const done = await client.from('profiles').update({ onboarding_step: step }).eq('user_id', userId);
  if (done.error) throw new Error(`mark step 2 failed: ${done.error.message}`);
}

export const getOnboardingState = cache(async (): Promise<OnboardingState> => {
  const { id } = await getCurrentUser();
  const client = await createClient();
  const [profile, fields, industries] = await Promise.all([
    client.from('profiles').select('*').eq('user_id', id).single(),
    client.from('profile_fields').select('*').eq('user_id', id).order('created_at'),
    client.from('profile_industries').select('*').eq('user_id', id).order('created_at'),
  ]);
  if (profile.error) throw new Error(`read profile failed: ${profile.error.message}`);
  if (fields.error) throw new Error(`read fields failed: ${fields.error.message}`);
  if (industries.error) throw new Error(`read industries failed: ${industries.error.message}`);
  return {
    step: profile.data.onboarding_step ?? 0,
    profile: profile.data,
    fields: fields.data,
    industries: industries.data,
  };
});

export async function saveStep1(input: Step1): Promise<void> {
  const { id } = await getCurrentUser();
  await applyStep1(await createClient(), id, input);
}

export async function saveStep2(input: Step2): Promise<void> {
  const { id } = await getCurrentUser();
  await applyStep2(await createClient(), id, input);
}
