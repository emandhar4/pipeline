import { describe, expect, it } from 'vitest';
import { barSchema, roleFieldSlugs } from '@/lib/scoring/bar';

const EMPTY = 'Add the company, the role or the pay.';

describe('barSchema', () => {
  it('refuses an empty bar with the exact message', () => {
    const r = barSchema.safeParse({ company: '', role: ' ', pay: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe(EMPTY);
  });

  it('accepts pay only', () => {
    const r = barSchema.safeParse({ company: '', role: '', pay: '30', pay_period: 'hour' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ company: null, role: null, pay_cents: 3000, pay_period: 'hour' });
  });

  it('accepts $25/hr and reads the period from it', () => {
    const r = barSchema.safeParse({ company: 'Test- Bar Co', role: '', pay: '$25/hr' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ pay_cents: 2500, pay_period: 'hour' });
  });

  it('reads 85k/year', () => {
    const r = barSchema.safeParse({ company: '', role: '', pay: '85k/year' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ pay_cents: 8_500_000, pay_period: 'year' });
  });

  it('rejects bad pay, zero pay and long text', () => {
    expect(barSchema.safeParse({ company: 'A', role: '', pay: 'lots' }).success).toBe(false);
    expect(barSchema.safeParse({ company: 'A', role: '', pay: '0' }).success).toBe(false);
    expect(barSchema.safeParse({ company: 'x'.repeat(121), role: '', pay: '' }).success).toBe(false);
    expect(barSchema.safeParse({ company: '', role: 'y'.repeat(121), pay: '' }).success).toBe(false);
  });
});

describe('roleFieldSlugs', () => {
  it('finds the software field', () => {
    expect(roleFieldSlugs('Software Engineer Intern').length).toBeGreaterThan(0);
    expect(roleFieldSlugs('Software Engineer Intern')).toContain('software-engineering');
  });
  it('is empty for an empty role', () => {
    expect(roleFieldSlugs('')).toEqual([]);
    expect(roleFieldSlugs('   ')).toEqual([]);
  });
});
