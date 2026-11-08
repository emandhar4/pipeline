import type { ResumeSuggestions } from '@/lib/resume/types';
import type { StepOneValues } from './step-one-form';
import type { StepTwoValues } from './step-two-form';

/** Hidden ids filled together with their text field; not answers of their own. */
const HIDDEN_IDS = new Set(['school_id', 'major_cip']);

/** How many visible answers `fromResume` covers (the hidden ids are not counted). */
export function answersFilled(fromResume: string[]): number {
  return fromResume.filter((f) => !HIDDEN_IDS.has(f)).length;
}

/**
 * Fills empty step-1 answers from resume suggestions. Never overwrites what the user has.
 * A school the user already has keeps its own id, location and state. Once step 1 has been
 * saved (`savedStep >= 1`) a blank answer is the user's choice, so nothing is filled.
 */
export function prefillStepOne(
  values: StepOneValues,
  s: ResumeSuggestions | null,
  savedStep = 0,
): { values: StepOneValues; fromResume: string[] } {
  if (!s || savedStep >= 1) return { values, fromResume: [] };
  const next = { ...values };
  const fromResume: string[] = [];
  const fill = (key: keyof StepOneValues & string, value: string | null | undefined) => {
    if (!value || next[key] !== '') return;
    (next as Record<string, unknown>)[key] = value;
    fromResume.push(key);
  };

  if (s.school && next.school === '') {
    fill('school', s.school.name);
    fill('school_id', s.school.id);
    fill('school_location', [s.school.city, s.school.state].filter(Boolean).join(', '));
    fill('school_state', s.school.state);
  }
  if (s.major && next.major === '') {
    fill('major', s.major.title);
    fill('major_cip', s.major.cip);
  }
  fill('grad_date', s.grad_date);
  fill('home_location', s.home_location);
  fill('home_state', s.home_state);
  return { values: next, fromResume };
}

/**
 * Switches on the suggested field chips, but only when the user has picked none. Slugs not in
 * `categories` (e.g. a category removed since the resume was read) are dropped.
 */
export function prefillStepTwo(
  values: StepTwoValues,
  s: ResumeSuggestions | null,
  categories: { slug: string; name: string }[],
): { values: StepTwoValues; suggested: string[] } {
  if (!s || values.fields.length > 0) return { values, suggested: [] };
  const fields = s.fields.flatMap((f) => {
    const category = categories.find((c) => c.slug === f.slug);
    return category ? [{ category_slug: f.slug, label: category.name, weight: f.weight }] : [];
  });
  if (fields.length === 0) return { values, suggested: [] };
  return { values: { ...values, fields }, suggested: fields.map((f) => f.category_slug) };
}
