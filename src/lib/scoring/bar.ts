import { z } from 'zod';
import { fieldSlugsFromTitle } from '@/finder/classify/fields';
import { parsePayFloor, type PayPeriod } from '@/lib/onboarding/options';

export const BAR_EMPTY_MESSAGE = 'Add the company, the role or the pay.';

/** Field slugs for an offer's role title, using the same rules as postings. */
export function roleFieldSlugs(role: string): string[] {
  const title = role.trim();
  return title ? fieldSlugsFromTitle(title) : [];
}

/**
 * Splits "$25/hr", "85k per year" or "30" into an amount and an optional period.
 * Without a period, a fallback is used by the caller.
 */
function splitPay(raw: string): { amount: string; period: PayPeriod | null } {
  const m = raw.trim().match(/^(.*?)\s*(?:\/|per\s+|a\s+)\s*(h(?:ou)?r|hour|y(?:ea)?r|year|annum)\s*$/i);
  if (!m) return { amount: raw, period: null };
  return { amount: m[1], period: /^h/i.test(m[2]) ? 'hour' : 'year' };
}

/**
 * The offer the user already holds. Input is the raw form text; output is what the table stores.
 * Pay is optional. A period typed with the pay ("$25/hr") wins over the `pay_period` field; with
 * neither, amounts of 1,000 or more read as yearly and smaller ones as hourly.
 */
export const barSchema = z
  .object({
    company: z.string().trim().max(120, 'Keep the company to 120 characters'),
    role: z.string().trim().max(120, 'Keep the role to 120 characters'),
    pay: z.string().max(40, 'Keep the pay to 40 characters'),
    pay_period: z.enum(['hour', 'year']).optional(),
  })
  .transform((v, ctx) => {
    const company = v.company || null;
    const role = v.role || null;
    let pay_cents: number | null = null;
    let pay_period: PayPeriod | null = null;
    const { amount, period } = splitPay(v.pay);
    try {
      const parsed = parsePayFloor(amount, period ?? v.pay_period ?? 'year');
      if (parsed.cents !== null) {
        if (parsed.cents <= 0) throw new Error('Pay must be more than zero.');
        pay_cents = parsed.cents;
        pay_period = period ?? v.pay_period ?? (parsed.cents >= 100_000 ? 'year' : 'hour');
      }
    } catch (e) {
      ctx.addIssue({ code: 'custom', path: ['pay'], message: (e as Error).message });
      return z.NEVER;
    }
    if (!company && !role && pay_cents === null) {
      ctx.addIssue({ code: 'custom', path: ['bar'], message: BAR_EMPTY_MESSAGE });
      return z.NEVER;
    }
    return { company, role, pay_cents, pay_period };
  });

export type BarInput = z.output<typeof barSchema>;
