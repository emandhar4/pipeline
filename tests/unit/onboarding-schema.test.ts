import { describe, expect, it } from 'vitest';
import { normalizeFields, normalizeIndustries, step1Schema, step2Schema } from '@/lib/onboarding/schema';

const step1 = {
  career_stage: 'intern', school: 'State U', school_id: '', major: 'Industrial Engineering', major_cip: '',
  grad_date: '2027-05', work_auth: 'citizen_or_pr', home_location: 'Austin, TX', home_state: 'TX',
  school_location: 'Dallas, TX', school_state: 'TX', work_anywhere_us: false, work_states: ['TX'],
  work_countries: [] as string[], open_to_remote: false as boolean | null,
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
  it('maps blank ids to null', () => {
    const out = step1Schema.parse(step1);
    expect(out.school_id).toBeNull();
    expect(out.major_cip).toBeNull();
    expect(step1Schema.parse({ ...step1, major_cip: '14.3501' }).major_cip).toBe('14.3501');
    expect(step1Schema.safeParse({ ...step1, major_cip: '143501' }).success).toBe(false);
  });
  it('derives in_state_school from the two states', () => {
    expect(step1Schema.parse({ ...step1, home_state: 'GA', school_state: 'GA' }).in_state_school).toBe(true);
    expect(step1Schema.parse({ ...step1, home_state: 'GA', school_state: 'TN' }).in_state_school).toBe(false);
    const oneBlank = step1Schema.parse({ ...step1, home_state: 'GA', school_state: '' });
    expect(oneBlank.in_state_school).toBeNull();
    expect(oneBlank.school_state).toBeNull();
  });
  it('anywhere clears specific states', () => {
    expect(step1Schema.parse({ ...step1, work_anywhere_us: true, work_states: ['GA'] }).work_states).toEqual([]);
  });
  it('needs somewhere to work', () => {
    const nowhere = { ...step1, work_anywhere_us: false, work_states: [], work_countries: [], open_to_remote: false };
    const r = step1Schema.safeParse(nowhere);
    expect(r.success).toBe(false);
    expect(r.error?.issues).toEqual([
      expect.objectContaining({
        path: ['work_states'],
        message: 'Pick where you can work, or say you are open to remote work.',
      }),
    ]);
    expect(step1Schema.safeParse({ ...nowhere, open_to_remote: true }).success).toBe(true);
  });
  it('rejects forged codes', () => {
    expect(step1Schema.safeParse({ ...step1, work_states: ['ZZ'] }).success).toBe(false);
    expect(step1Schema.safeParse({ ...step1, home_state: 'ZZ' }).success).toBe(false);
    const us = step1Schema.safeParse({ ...step1, work_countries: ['US'] });
    expect(us.success).toBe(false);
    expect(us.error?.issues).toEqual([
      expect.objectContaining({ path: ['work_countries'], message: 'Pick countries from the list' }),
    ]);
  });
  it('dedupes and orders states and countries', () => {
    expect(step1Schema.parse({ ...step1, work_states: ['TX', 'GA', 'TX'] }).work_states).toEqual(['GA', 'TX']);
    expect(step1Schema.parse({ ...step1, work_countries: ['CA', 'CA', 'MX'] }).work_countries).toEqual(['CA', 'MX']);
    const tooMany = Array.from({ length: 21 }, (_, i) => ['CA', 'MX', 'GB', 'DE', 'FR', 'IN', 'JP', 'CN', 'BR', 'AU',
      'IE', 'NL', 'SE', 'NO', 'DK', 'FI', 'ES', 'IT', 'PT', 'CH', 'AT'][i]);
    expect(step1Schema.safeParse({ ...step1, work_countries: tooMany }).success).toBe(false);
  });
  it('open_to_remote is required', () => {
    const r = step1Schema.safeParse({ ...step1, open_to_remote: null });
    expect(r.success).toBe(false);
    expect(r.error?.issues).toEqual([
      expect.objectContaining({ path: ['open_to_remote'], message: 'Choose one' }),
    ]);
  });
  it('no longer accepts relocate or in_state_school as input', () => {
    const out = step1Schema.parse({ ...step1, relocate: 'anywhere', in_state_school: false } as typeof step1);
    expect(out).not.toHaveProperty('relocate');
    expect(out.in_state_school).toBe(true);
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
