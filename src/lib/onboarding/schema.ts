import { z } from 'zod';
import { CAREER_STAGES, RELOCATE, WORK_AUTH, parsePayFloor } from './options';

const text = (max: number) => z.string().trim().max(max);

const values = <T extends string>(opts: { value: T }[]) => opts.map((o) => o.value) as [T, ...T[]];

export const step1Schema = z.object({
  career_stage: z.enum(values(CAREER_STAGES)),
  school: text(200),
  major: text(200),
  // YYYY-MM, or blank when it does not apply.
  grad_date: z.string().trim().regex(/^(\d{4}-(0[1-9]|1[0-2]))?$/, 'Use YYYY-MM'),
  work_auth: z.enum(values(WORK_AUTH)),
  home_location: text(200),
  school_location: text(200),
  in_state_school: z.boolean(),
  relocate: z.enum(values(RELOCATE)),
});
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
