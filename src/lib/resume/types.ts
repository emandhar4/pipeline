import { z } from 'zod';
import { US_STATES, type UsState } from '@/lib/onboarding/regions';

export type ResumeSuggestions = {
  version: 1;
  school: { id: string | null; name: string; city: string | null; state: UsState | null } | null;
  major: { cip: string | null; title: string } | null;
  grad_date: string | null; // YYYY-MM
  home_location: string | null; // as written, e.g. "Columbus, OH"
  home_state: UsState | null;
  fields: { slug: string; weight: 'primary' | 'secondary'; matched: string[] }[];
};

const usState = z.enum(US_STATES.map((s) => s.code) as [UsState, ...UsState[]]);

/** What a resume reader suggests for onboarding. Stored in `resumes.suggestions`. */
export const resumeSuggestionsSchema: z.ZodType<ResumeSuggestions> = z.object({
  version: z.literal(1),
  school: z
    .object({
      id: z.string().nullable(),
      name: z.string(),
      city: z.string().nullable(),
      state: usState.nullable(),
    })
    .nullable(),
  major: z.object({ cip: z.string().nullable(), title: z.string() }).nullable(),
  grad_date: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable(),
  home_location: z.string().nullable(),
  home_state: usState.nullable(),
  fields: z.array(
    z.object({
      slug: z.string(),
      weight: z.enum(['primary', 'secondary']),
      matched: z.array(z.string()),
    }),
  ),
});
