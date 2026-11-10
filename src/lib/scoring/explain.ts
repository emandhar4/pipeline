import { z } from 'zod';
import type { BarVerdict, MatchReasons } from './types';

export const FIT_SCORE_TITLE = 'Fit score out of 100';

const weight = z.enum(['primary', 'secondary']);
const part = z.enum(['better', 'same', 'worse']);

const schema = z.object({
  fields: z.array(z.object({ label: z.string(), weight })).catch([]),
  weight: weight.nullable().catch(null),
  location_unknown: z.boolean().catch(false),
  age_days: z.number().nullable().catch(null),
  dream: z.boolean().catch(false),
  capped: z.boolean().catch(false),
  preferred_industry: z.string().nullable().catch(null),
  pay_ok: z.boolean().nullable().catch(null),
  bar: z
    .object({
      pay: part.nullable().catch(null),
      pay_pct: z.number().nullable().catch(null),
      brand: part.catch('same'),
      function: part.catch('same'),
    })
    .nullable()
    .catch(null),
  ai_reason: z.string().optional().catch(undefined),
});

/** Lenient: Phase 3 rows lack the newer keys, and bad input never throws. */
export function parseReasons(json: unknown): MatchReasons {
  const src = json !== null && typeof json === 'object' && !Array.isArray(json) ? json : {};
  const out = schema.parse(src);
  if (out.ai_reason === undefined) delete out.ai_reason;
  return out as MatchReasons;
}

export function reasonsLine(r: MatchReasons): string {
  const parts: string[] = [];
  const primary = r.fields.find((f) => f.weight === 'primary');
  const secondary = r.fields.find((f) => f.weight === 'secondary');
  if (primary) parts.push(`Primary field: ${primary.label}`);
  else if (secondary) parts.push(`Secondary field: ${secondary.label}`);
  if (r.age_days !== null && r.age_days >= 0 && r.age_days <= 30) {
    parts.push(
      r.age_days === 0
        ? 'posted today'
        : r.age_days === 1
          ? 'posted 1 day ago'
          : `posted ${r.age_days} days ago`,
    );
  }
  if (r.dream) parts.push('dream company');
  if (r.preferred_industry) parts.push(`${r.preferred_industry} industry`);
  if (r.capped) parts.push('capped you this cycle');
  return parts.join(' · ');
}

export function barLine(r: MatchReasons, verdict: BarVerdict): string | null {
  if (verdict === 'no_bar' || !r.bar) return null;
  const b = r.bar;
  if (verdict === 'beats') {
    const better: string[] = [];
    if (b.pay === 'better') {
      better.push(b.pay_pct === null ? 'better pay' : `better pay (+${Math.round(b.pay_pct)}%)`);
    }
    if (b.brand === 'better') better.push('stronger brand');
    if (b.function === 'better') better.push('closer to your fields');
    return `Beats your offer: ${better.join(', ')}.`;
  }
  const worse: string[] = [];
  if (b.pay === 'worse') worse.push('lower pay');
  if (b.brand === 'worse') worse.push('weaker brand');
  if (b.function === 'worse') worse.push('further from your fields');
  return `Doesn't beat your offer: ${worse.length ? worse.join(', ') : 'no clear edge'}.`;
}
