import { describe, expect, it } from 'vitest';
import { normalizeFields, normalizeIndustries, step1Schema, step2Schema } from '@/lib/onboarding/schema';

const step1 = {
  career_stage: 'intern', school: 'State U', major: 'Industrial Engineering', grad_date: '2027-05',
  work_auth: 'citizen_or_pr', home_location: 'Austin, TX', school_location: 'Dallas, TX',
  in_state_school: true, relocate: 'anywhere',
};
const base2 = { industries: [], pay_amount: '', pay_period: 'year', season: 'Summer 2027' };

describe('step1Schema', () => {
  it('accepts a valid month and rejects an invalid one', () => {
    expect(step1Schema.safeParse(step1).success).toBe(true);
    expect(step1Schema.safeParse({ ...step1, grad_date: '2027-13' }).success).toBe(false);
  });
  it('trims strings and rejects overlong ones', () => {
    expect(step1Schema.parse({ ...step1, school: '  State U ' }).school).toBe('State U');
    expect(step1Schema.safeParse({ ...step1, school: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('step2Schema', () => {
  const f = (label: string, weight: 'primary' | 'secondary') => ({ category_slug: null, label, weight });
  it('rejects zero fields and all-secondary fields', () => {
    expect(step2Schema.safeParse({ ...base2, fields: [] }).success).toBe(false);
    const allSecondary = step2Schema.safeParse({ ...base2, fields: [f('A', 'secondary')] });
    expect(allSecondary.success).toBe(false);
    // The onboarding UI shows this message inline; the e2e test matches it.
    expect(allSecondary.error?.issues.map((i) => i.message)).toContain('Pick at least one primary field');
    expect(allSecondary.error?.issues[0].path[0]).toBe('fields');
  });
  it('accepts 1 primary + 1 secondary', () => {
    expect(step2Schema.safeParse({ ...base2, fields: [f('A', 'primary'), f('B', 'secondary')] }).success).toBe(true);
  });
  it('rejects more than 12 fields and 20 industries', () => {
    const many = Array.from({ length: 13 }, (_, i) => f(`F${i}`, 'primary'));
    expect(step2Schema.safeParse({ ...base2, fields: many }).success).toBe(false);
    const inds = Array.from({ length: 21 }, (_, i) => ({ industry: `I${i}`, preference: 'prefer' }));
    expect(step2Schema.safeParse({ ...base2, fields: [f('A', 'primary')], industries: inds }).success).toBe(false);
  });
});

describe('normalizers', () => {
  it('dedupes fields case-insensitively, trimmed, first wins', () => {
    const out = normalizeFields([
      { category_slug: null, label: 'Consulting', weight: 'primary' },
      { category_slug: null, label: 'consulting ', weight: 'secondary' },
    ]);
    expect(out).toEqual([{ category_slug: null, label: 'Consulting', weight: 'primary' }]);
  });
  it('dedupes industries case-insensitively', () => {
    const out = normalizeIndustries([
      { industry: 'Energy', preference: 'prefer' },
      { industry: ' energy', preference: 'avoid' },
    ]);
    expect(out).toEqual([{ industry: 'Energy', preference: 'prefer' }]);
  });
});
