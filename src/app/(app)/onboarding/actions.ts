'use server';

import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { saveStep1, saveStep2 } from '@/lib/onboarding/profile';
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

/** 'yes' and 'no' map to booleans; anything else (unanswered or not shown) is unknown. */
function yesNo(value: string): boolean | null {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
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
  const input = {
    career_stage: text(formData, 'career_stage'),
    school: text(formData, 'school'),
    major: text(formData, 'major'),
    grad_date: text(formData, 'grad_date'),
    work_auth: text(formData, 'work_auth'),
    home_location: text(formData, 'home_location'),
    school_location: text(formData, 'school_location'),
    in_state_school: yesNo(text(formData, 'in_state_school')),
    relocate: text(formData, 'relocate'),
  };
  const parsed = step1Schema.safeParse(input);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    // The schema's in-state check only runs once the other fields pass; report it alongside them.
    if (input.home_location.trim() && input.school_location.trim() && input.in_state_school === null) {
      errors.in_state_school ??= 'Choose one';
    }
    return { errors };
  }

  try {
    await saveStep1(parsed.data);
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

  try {
    await saveStep2(parsed.data);
  } catch (e) {
    console.error('[onboarding] saveStep2 failed', { message: (e as Error).message });
    return { message: SAVE_FAILED };
  }
  redirect(modeOf(mode) === 'profile' ? '/profile?saved=1' : '/dashboard');
}
