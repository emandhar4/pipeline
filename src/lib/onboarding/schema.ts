import { z } from 'zod';
import { CAREER_STAGES, WORK_AUTH, parsePayFloor } from './options';
import { COUNTRIES, US_STATES, isUsState, type UsState } from './regions';

const text = (max: number) => z.string().trim().max(max);

const values = <T extends string>(opts: { value: T }[]) => opts.map((o) => o.value) as [T, ...T[]];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE_INDEX = new Map<string, number>(US_STATES.map((s, i) => [s.code, i]));
const COUNTRY_SET = new Set(COUNTRIES);

const blankToNull = (s: string) => (s === '' ? null : s);

/** A state code, or '' for none. Output: the code or null. */
const optionalState = z
  .string()
  .trim()
  .refine((s) => s === '' || isUsState(s), 'Choose one')
  .transform((s) => (s === '' ? null : (s as UsState)));

export const step1Schema = z
  .object({
    career_stage: z.enum(values(CAREER_STAGES)),
    school: text(200),
    // The picked lookup row, or '' when the school was typed freely.
    school_id: z
      .string()
      .trim()
      .refine((s) => s === '' || UUID.test(s), 'Choose a school from the list')
      .transform(blankToNull),
    major: text(200),
    major_cip: z
      .string()
      .trim()
      .regex(/^(\d{2}\.\d{4})?$/, 'Choose a major from the list')
      .transform(blankToNull),
    // YYYY-MM, or blank when it does not apply.
    grad_date: z.string().trim().regex(/^(\d{4}-(0[1-9]|1[0-2]))?$/, 'Use YYYY-MM'),
    work_auth: z.enum(values(WORK_AUTH)),
    home_location: text(200),
    home_state: optionalState,
    school_location: text(200),
    school_state: optionalState,
    work_anywhere_us: z.boolean(),
    work_states: z
      .array(z.string())
      .max(100)
      .refine((xs) => xs.every(isUsState), 'Choose one')
      .transform((xs) =>
        [...new Set(xs as UsState[])].sort((a, b) => STATE_INDEX.get(a)! - STATE_INDEX.get(b)!),
      ),
    work_countries: z
      .array(z.string())
      .max(100)
      .refine((xs) => xs.every((c) => COUNTRY_SET.has(c)), 'Pick countries from the list')
      .transform((xs) => [...new Set(xs)])
      .pipe(z.array(z.string()).max(20, 'Pick at most 20 countries')),
    // Null until answered.
    open_to_remote: z.boolean().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.open_to_remote === null) {
      ctx.addIssue({ code: 'custom', path: ['open_to_remote'], message: 'Choose one' });
    }
    if (
      !v.work_anywhere_us &&
      v.work_states.length === 0 &&
      v.work_countries.length === 0 &&
      v.open_to_remote === false
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['work_states'],
        message: 'Pick where you can work, or say you are open to remote work.',
      });
    }
  })
  .transform((v) => ({
    ...v,
    // Anywhere in the US makes a state list redundant.
    work_states: v.work_anywhere_us ? [] : v.work_states,
    open_to_remote: v.open_to_remote === true,
    // Derived; the in-state question is no longer asked.
    in_state_school:
      v.home_state !== null && v.school_state !== null ? v.home_state === v.school_state : null,
  }));
export type Step1 = z.infer<typeof step1Schema>;

const fieldSchema = z.object({
  category_slug: z.string().trim().min(1).max(100).nullable(),
  label: text(100).min(1),
  weight: z.enum(['primary', 'secondary']),
});
const industrySchema = z.object({
  industry: text(100).min(1),
  preference: z.enum(['prefer', 'avoid']),
});

type FieldInput = z.infer<typeof fieldSchema>;
type IndustryInput = z.infer<typeof industrySchema>;

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item).trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...item });
  }
  return out;
}

/** Dedupes case-insensitively on trimmed label; the first occurrence wins. */
export function normalizeFields(fields: FieldInput[]): FieldInput[] {
  return dedupe(fields, (f) => f.label).map((f) => ({ ...f, label: f.label.trim() }));
}

/** Dedupes case-insensitively on trimmed industry; the first occurrence wins. */
export function normalizeIndustries(items: IndustryInput[]): IndustryInput[] {
  return dedupe(items, (i) => i.industry).map((i) => ({ ...i, industry: i.industry.trim() }));
}

export const step2Schema = z
  .object({
    fields: z
      .array(fieldSchema)
      .max(12)
      .transform(normalizeFields)
      .pipe(
        z
          .array(fieldSchema)
          .min(1, 'Pick at least one field')
          .refine((fs) => fs.some((f) => f.weight === 'primary'), 'Pick at least one primary field'),
      ),
    industries: z.array(industrySchema).max(20).transform(normalizeIndustries),
    pay_amount: z.string().max(30),
    pay_period: z.enum(['hour', 'year']),
    season: text(50).min(1),
  })
  .superRefine((v, ctx) => {
    try {
      parsePayFloor(v.pay_amount, v.pay_period);
    } catch (e) {
      ctx.addIssue({ code: 'custom', path: ['pay_amount'], message: (e as Error).message });
    }
  });
export type Step2 = z.infer<typeof step2Schema>;
