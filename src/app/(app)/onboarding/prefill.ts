import { US_STATES } from '@/lib/onboarding/regions';
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
  const fields = suggestedFields(s, categories);
  if (fields.length === 0) return { values, suggested: [] };
  return { values: { ...values, fields }, suggested: fields.map((f) => f.category_slug) };
}

type Field = StepTwoValues['fields'][number];
type CategoryField = Field & { category_slug: string };

/** The resume's suggested fields that are still categories, primary first. */
function suggestedFields(
  s: ResumeSuggestions,
  categories: { slug: string; name: string }[],
): CategoryField[] {
  const rank = { primary: 0, secondary: 1 } as const;
  return s.fields
    .flatMap((f) => {
      const category = categories.find((c) => c.slug === f.slug);
      return category ? [{ category_slug: f.slug, label: category.name, weight: f.weight }] : [];
    })
    .sort((a, b) => rank[a.weight] - rank[b.weight]);
}

/** What the resume says for a step-1 answer, and the form values "Use this" puts in. */
export type StepOneHint = { text: string; set: Partial<StepOneValues> };
export type StepOneHints = Partial<Record<'school' | 'major' | 'grad_date' | 'home_location', StepOneHint>>;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2027-05" as "May 2027". */
function monthText(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/**
 * Hints for step-1 answers whose resume suggestion differs from what the user has. Only once
 * step 1 has been saved (`savedStep >= 1`; before that `prefillStepOne` fills blanks instead).
 * Saved blanks get a hint too but are never filled: the user applies a hint by hand and saves.
 * School and major compare ids when both sides have one, else names (case and spaces ignored).
 */
export function stepOneHints(values: StepOneValues, s: ResumeSuggestions | null, savedStep: number): StepOneHints {
  if (!s || savedStep < 1) return {};
  const hints: StepOneHints = {};

  if (s.school) {
    const { id, name, city, state } = s.school;
    const differs = id && values.school_id ? id !== values.school_id : !same(name, values.school);
    if (differs) {
      const set: Partial<StepOneValues> = { school: name, school_id: id ?? '' };
      const location = [city, state].filter(Boolean).join(', ');
      if (location) set.school_location = location;
      if (state) set.school_state = state;
      hints.school = { text: name, set };
    }
  }
  if (s.major) {
    const { cip, title } = s.major;
    const differs = cip && values.major_cip ? cip !== values.major_cip : !same(title, values.major);
    if (differs) hints.major = { text: title, set: { major: title, major_cip: cip ?? '' } };
  }
  if (s.grad_date && s.grad_date !== values.grad_date) {
    hints.grad_date = { text: monthText(s.grad_date), set: { grad_date: s.grad_date } };
  }
  const location = s.home_location;
  const state = s.home_state;
  if (
    (location && !same(location, values.home_location)) ||
    (state && state !== values.home_state)
  ) {
    const set: Partial<StepOneValues> = {};
    if (location) set.home_location = location;
    if (state) set.home_state = state;
    const text = location ?? US_STATES.find((st) => st.code === state)?.name ?? state ?? '';
    hints.home_location = { text, set };
  }
  return hints;
}

/**
 * One hint for step 2 when the resume's fields (still-existing categories only) differ from the
 * saved category fields. Fields the user added by hand are not compared. Null when they match.
 */
export function stepTwoHint(
  values: StepTwoValues,
  s: ResumeSuggestions | null,
  categories: { slug: string; name: string }[],
): { text: string; fields: Field[] } | null {
  if (!s) return null;
  const fields = suggestedFields(s, categories);
  if (fields.length === 0) return null;
  const saved = values.fields.filter((f) => f.category_slug !== null);
  const matches =
    saved.length === fields.length &&
    fields.every((f) => saved.some((x) => x.category_slug === f.category_slug && x.weight === f.weight));
  if (matches) return null;
  return { text: fields.map((f) => `${f.label} (${f.weight})`).join(', '), fields };
}
