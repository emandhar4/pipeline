import { z } from 'zod';
import type { Database } from '@/lib/database.types';

type Enums = Database['public']['Enums'];

// LLM-UPGRADE: stage 2 (an AnthropicProvider with an API key) calls the model directly with the
// same ScoreFitJob and validates its answer with the same completeSchema; the queue routes stay.

/** One score_fit job as the worker sees it: the posting and the user's targeting, nothing that names the user. */
export type ScoreFitJob = {
  id: string;
  posting: {
    title: string;
    company: string;
    locations: string[];
    apply_url: string | null;
    level: Enums['job_level'];
    terms: string[];
    pay_min_cents: number | null;
    pay_max_cents: number | null;
    pay_period: Enums['pay_period'] | null;
  };
  profile: {
    career_stage: Enums['career_stage'] | null;
    season: string | null;
    fields: { label: string; weight: Enums['field_weight'] }[];
  };
};

/** Most jobs one claim returns (claim_ai_jobs caps at the same number). */
export const MAX_CLAIM = 10;

/** POST /api/ai-jobs/claim body. A limit above 10 is capped, not refused. */
export const claimSchema = z.strictObject({
  limit: z
    .number()
    .int()
    .min(1)
    .default(MAX_CLAIM)
    .transform((n) => Math.min(n, MAX_CLAIM)),
});

const jobId = z.uuid();

/** POST /api/ai-jobs/complete body: a 1–10 score with a one-sentence reason, or an error. */
export const completeSchema = z.union([
  z.strictObject({
    id: jobId,
    score: z.number().int().min(1).max(10),
    reason: z.string().trim().min(1).max(200),
  }),
  z.strictObject({
    id: jobId,
    error: z.string().trim().min(1).max(500),
  }),
]);

export type ClaimInput = z.infer<typeof claimSchema>;
export type CompleteInput = z.infer<typeof completeSchema>;
export type CompleteResult = 'ok' | 'not_found' | 'not_claimed';
