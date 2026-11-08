import 'server-only';
import { getCurrentUser } from '@/lib/auth';
import { seasonOptions } from '@/lib/onboarding/options';
import type { OnboardingState } from '@/lib/onboarding/profile';
import { resumeSuggestionsSchema, type ResumeSuggestions } from '@/lib/resume/types';
import { createClient } from '@/lib/supabase/server';
import type { StepOneValues } from './step-one-form';
import type { Category, StepTwoValues } from './step-two-form';

export async function loadCategories(): Promise<Category[]> {
  await getCurrentUser();
  const client = await createClient();
  const { data, error } = await client.from('field_categories').select('slug, name').order('sort');
  if (error) throw new Error(`read field_categories failed: ${error.message}`);
  return data;
}

/**
 * Suggestions from the user's newest uploaded resume, or null when there is none or the
 * stored suggestions do not match the current shape. Reads through the user's RLS client.
 */
export async function latestResumeSuggestions(): Promise<ResumeSuggestions | null> {
  await getCurrentUser();
  const client = await createClient();
  const { data, error } = await client
    .from('resumes')
    .select('suggestions')
    .eq('kind', 'uploaded')
    .not('suggestions', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`read resumes failed: ${error.message}`);
  if (!data) return null;
  const parsed = resumeSuggestionsSchema.safeParse(data.suggestions);
  return parsed.success ? parsed.data : null;
}

export function stepOneValues({ profile }: OnboardingState): StepOneValues {
  return {
    career_stage: profile.career_stage ?? '',
    school: profile.school ?? '',
    school_id: profile.school_id ?? '',
    major: profile.major ?? '',
    major_cip: profile.major_cip ?? '',
    grad_date: profile.grad_date ? profile.grad_date.slice(0, 7) : '',
    work_auth: profile.work_auth ?? '',
    home_location: profile.home_location ?? '',
    home_state: profile.home_state ?? '',
    school_location: profile.school_location ?? '',
    school_state: profile.school_state ?? '',
    work_anywhere_us: profile.work_anywhere_us,
    work_states: profile.work_states,
    work_countries: profile.work_countries,
    work_style: profile.work_style ?? '',
  };
}

function payAmount(cents: number | null): string {
  if (cents === null) return '';
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export function stepTwoValues({ profile, fields, industries }: OnboardingState): StepTwoValues {
  // Hourly suits students; a salary suits everyone else. Only a default, the user can switch.
  const defaultPeriod = profile.career_stage === 'intern' ? 'hour' : 'year';
  return {
    fields: fields.map((f) => ({ category_slug: f.category_slug, label: f.label, weight: f.weight })),
    industries: industries.map((i) => ({ industry: i.industry, preference: i.preference })),
    pay_amount: payAmount(profile.pay_floor_cents),
    pay_period: profile.pay_floor_period ?? defaultPeriod,
    season: profile.season ?? '',
  };
}

/** Upcoming seasons, plus a saved season that has since gone by so it still shows. */
export function seasonsFor(saved: string): string[] {
  const options = seasonOptions(new Date());
  return saved && !options.includes(saved) ? [saved, ...options] : options;
}
