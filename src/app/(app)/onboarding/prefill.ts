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
 * A school the user already has keeps its own id, location and state.
 */
export function prefillStepOne(
  values: StepOneValues,
  s: ResumeSuggestions | null,
): { values: StepOneValues; fromResume: string[] } {
  if (!s) return { values, fromResume: [] };
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

/** Switches on the suggested field chips, but only when the user has picked none. */
export function prefillStepTwo(
  values: StepTwoValues,
  s: ResumeSuggestions | null,
): { values: StepTwoValues; suggested: string[] } {
  if (!s || s.fields.length === 0 || values.fields.length > 0) return { values, suggested: [] };
  // The chip label comes from the category list; the slug is only a fallback.
  const fields = s.fields.map((f) => ({ category_slug: f.slug, label: f.slug, weight: f.weight }));
  return { values: { ...values, fields }, suggested: s.fields.map((f) => f.slug) };
}
