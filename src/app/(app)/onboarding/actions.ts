'use server';

import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { resolveStepOneLookups } from '@/lib/onboarding/lookups';
import { WORK_STYLES } from '@/lib/onboarding/options';
import { saveStep1, saveStep2 } from '@/lib/onboarding/profile';
import { createClient } from '@/lib/supabase/server';
import { loadCategories } from './data';
import { step1Schema, step2Schema } from '@/lib/onboarding/schema';

export type FormMode = 'onboarding' | 'profile';

export type FormState = {
  /** First error message per top-level field name. */
  errors?: Record<string, string>;
  /** A short message for failures that are not tied to one field. */
  message?: string;
};

const SAVE_FAILED = 'Could not save your answers. Try again in a minute.';

// Plain-language replacements for zod's built-in size messages, by field.
const TOO_BIG: Record<string, string> = {
  fields: 'Pick at most 12 fields',
  industries: 'Keep it to 20 industries or fewer',
};

function message(key: string, issue: z.core.$ZodIssue): string {
  // Enum errors name every allowed value; a person only needs to know to pick one.
  if (issue.code === 'invalid_value') return 'Choose one';
  if (issue.code === 'too_big' && issue.path.length === 1) return TOO_BIG[key] ?? 'That is too long';
  if (issue.code === 'too_small' && key === 'season') return 'Choose a season';
  if (issue.code === 'too_small' && issue.path.length > 1) return 'Labels cannot be blank';
  return issue.message;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= message(key, issue);
  }
  return out;
}

function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === 'string' ? v : '';
}

function json(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(text(formData, name) || '[]');
  } catch {
    return null;
  }
}

function modeOf(mode: unknown): FormMode {
  return mode === 'profile' ? 'profile' : 'onboarding';
}

export async function saveStepOne(
  mode: FormMode,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await getCurrentUser();
  const countries = json(formData, 'work_countries');
  if (!Array.isArray(countries)) return { errors: { work_countries: 'Pick countries from the list' } };
  const input = {
    career_stage: text(formData, 'career_stage'),
    school: text(formData, 'school'),
    school_id: text(formData, 'school_id'),
    major: text(formData, 'major'),
    major_cip: text(formData, 'major_cip'),
    grad_date: text(formData, 'grad_date'),
    work_auth: text(formData, 'work_auth'),
    home_location: text(formData, 'home_location'),
    home_state: text(formData, 'home_state'),
    school_location: text(formData, 'school_location'),
    school_state: text(formData, 'school_state'),
    work_anywhere_us: text(formData, 'work_anywhere_us') === 'on',
    work_states: formData.getAll('work_states').filter((v) => typeof v === 'string'),
    work_countries: countries,
    work_style: text(formData, 'work_style'),
  };
  const parsed = step1Schema.safeParse(input);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    // The schema's cross-field checks only run once the other fields pass; report this one alongside them.
    if (!WORK_STYLES.some((o) => o.value === input.work_style)) errors.work_style ??= 'Choose one';
    return { errors };
  }

  // A picked school or major must exist; its stored label comes from the database.
  let resolved: Awaited<ReturnType<typeof resolveStepOneLookups>>;
  try {
    resolved = await resolveStepOneLookups(await createClient(), parsed.data);
  } catch (e) {
    console.error('[onboarding] resolveStepOneLookups failed', { message: (e as Error).message });
    return { message: SAVE_FAILED };
  }
  if (!resolved.ok) return { errors: resolved.errors };

  try {
    await saveStep1(resolved.value);
  } catch (e) {
    console.error('[onboarding] saveStep1 failed', { message: (e as Error).message });
    return { message: SAVE_FAILED };
  }
  redirect(modeOf(mode) === 'profile' ? '/profile?saved=1' : '/onboarding');
}

export async function saveStepTwo(
  mode: FormMode,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await getCurrentUser();
  const fields = json(formData, 'fields');
  const industries = json(formData, 'industries');
  if (fields === null || industries === null) return { message: SAVE_FAILED };

  const parsed = step2Schema.safeParse({
    fields,
    industries,
    pay_amount: text(formData, 'pay_amount'),
    pay_period: text(formData, 'pay_period'),
    season: text(formData, 'season'),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  // Category slugs must exist; checked before any write. A category chip's label is set here
  // from the category name, never taken from the client.
  let categories: Awaited<ReturnType<typeof loadCategories>>;
  try {
    categories = await loadCategories();
  } catch (e) {
    console.error('[onboarding] loadCategories failed', { message: (e as Error).message });
    return { message: SAVE_FAILED };
  }
  const names = new Map(categories.map((c) => [c.slug, c.name]));
  const checked = parsed.data.fields.map((f) => {
    if (f.category_slug === null) return f;
    const name = names.get(f.category_slug);
    return name === undefined ? null : { ...f, label: name };
  });
  if (checked.some((f) => f === null)) {
    return { errors: { fields: 'One of the fields is not recognised. Reload the page and try again.' } };
  }
  const data = { ...parsed.data, fields: checked.filter((f) => f !== null) };

  try {
    await saveStep2(data);
  } catch (e) {
    console.error('[onboarding] saveStep2 failed', { message: (e as Error).message });
    return { message: SAVE_FAILED };
  }
  redirect(modeOf(mode) === 'profile' ? '/profile?saved=1' : '/dashboard');
}
