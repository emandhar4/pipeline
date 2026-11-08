export type Option<T extends string> = { value: T; label: string };

export const CAREER_STAGES: Option<'intern' | 'new_grad' | 'experienced' | 'career_switcher'>[] = [
  { value: 'intern', label: 'Student looking for an internship' },
  { value: 'new_grad', label: 'New graduate' },
  { value: 'experienced', label: 'Experienced professional' },
  { value: 'career_switcher', label: 'Changing careers' },
];

export const WORK_AUTH: Option<'citizen_or_pr' | 'no_sponsorship_needed' | 'needs_sponsorship'>[] = [
  { value: 'citizen_or_pr', label: 'Citizen or permanent resident' },
  { value: 'no_sponsorship_needed', label: 'Authorized to work, no sponsorship needed' },
  { value: 'needs_sponsorship', label: 'Will need visa sponsorship' },
];

export const RELOCATE: Option<'no' | 'within_region' | 'anywhere'>[] = [
  { value: 'no', label: 'No, I need to stay where I am' },
  { value: 'within_region', label: 'Within my region' },
  { value: 'anywhere', label: 'Anywhere' },
];

const INT4_MAX = 2147483647;

export type PayPeriod = 'hour' | 'year';

// Term start dates as [month index, day]. A term "has started" on its start date.
const TERMS: { name: string; month: number; day: number }[] = [
  { name: 'Spring', month: 0, day: 1 },
  { name: 'Summer', month: 4, day: 1 },
  { name: 'Fall', month: 7, day: 15 },
];

/** The next 6 terms that have not started yet, then "Full-time". Uses UTC date parts. */
export function seasonOptions(today: Date): string[] {
  const todayKey = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const out: string[] = [];
  for (let year = today.getUTCFullYear(); out.length < 6; year++) {
    for (const t of TERMS) {
      if (out.length < 6 && Date.UTC(year, t.month, t.day) > todayKey) {
        out.push(`${t.name} ${year}`);
      }
    }
  }
  return [...out, 'Full-time'];
}

/**
 * Parses a pay floor into integer cents. Blank means no floor. Strips commas, whitespace and a
 * leading `$`; a trailing `k`/`K` multiplies by 1000 ("85k"). Throws on anything non-numeric,
 * negative, or with over 2 decimals.
 */
export function parsePayFloor(
  amount: string,
  period: PayPeriod,
): { cents: number | null; period: PayPeriod | null } {
  let cleaned = amount.replace(/[,\s]/g, '');
  if (cleaned === '') return { cents: null, period: null };
  cleaned = cleaned.replace(/^\$/, '');
  const thousands = /[kK]$/.test(cleaned);
  if (thousands) cleaned = cleaned.slice(0, -1);
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(cleaned)) {
    throw new Error('Enter pay as a number, like 22, $22.50 or 85k');
  }
  const cents = Math.round(Number(cleaned) * 100) * (thousands ? 1000 : 1);
  if (cents > INT4_MAX) throw new Error('That pay amount is too large.');
  return { cents, period };
}
