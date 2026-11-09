import { describe, expect, it } from 'vitest';
import { barLine, parseReasons, reasonsLine, FIT_SCORE_TITLE } from '@/lib/scoring/explain';
import type { MatchReasons } from '@/lib/scoring/types';

const base: MatchReasons = {
  fields: [],
  weight: null,
  location_unknown: false,
  age_days: null,
  dream: false,
  capped: false,
  preferred_industry: null,
  pay_ok: null,
  bar: null,
};
const r = (o: Partial<MatchReasons>): MatchReasons => ({ ...base, ...o });
const bar = (b: Partial<NonNullable<MatchReasons['bar']>>) =>
  r({ bar: { pay: null, pay_pct: null, brand: 'same', function: 'same', ...b } });

describe('reasonsLine', () => {
  it('primary only', () => {
    expect(reasonsLine(r({ fields: [{ label: 'Software Engineering', weight: 'primary' }] }))).toBe(
      'Primary field: Software Engineering',
    );
  });
  it('secondary plus posted today', () => {
    expect(
      reasonsLine(r({ fields: [{ label: 'Data', weight: 'secondary' }], age_days: 0 })),
    ).toBe('Secondary field: Data · posted today');
  });
  it('age singular, plural and cutoff', () => {
    expect(reasonsLine(r({ age_days: 1 }))).toBe('posted 1 day ago');
    expect(reasonsLine(r({ age_days: 30 }))).toBe('posted 30 days ago');
    expect(reasonsLine(r({ age_days: 31 }))).toBe('');
  });
  it('first primary wins over earlier secondary', () => {
    expect(
      reasonsLine(
        r({
          fields: [
            { label: 'A', weight: 'secondary' },
            { label: 'B', weight: 'primary' },
          ],
        }),
      ),
    ).toBe('Primary field: B');
  });
  it('dream, industry, capped', () => {
    expect(
      reasonsLine(
        r({
          fields: [{ label: 'Finance', weight: 'primary' }],
          age_days: 2,
          dream: true,
          preferred_industry: 'Aerospace',
          capped: true,
        }),
      ),
    ).toBe(
      'Primary field: Finance · posted 2 days ago · dream company · Aerospace industry · capped you this cycle',
    );
  });
});

describe('barLine', () => {
  it('null when no_bar', () => {
    expect(barLine(bar({ pay: 'better', pay_pct: 18 }), 'no_bar')).toBeNull();
  });
  it('beats lists better parts', () => {
    expect(barLine(bar({ pay: 'better', pay_pct: 17.6, brand: 'better' }), 'beats')).toBe(
      'Beats your offer: better pay (+18%), stronger brand.',
    );
  });
  it('function better with null pay', () => {
    expect(barLine(bar({ function: 'better' }), 'beats')).toBe(
      'Beats your offer: closer to your fields.',
    );
  });
  it('does not beat lists worse parts', () => {
    expect(barLine(bar({ pay: 'worse', brand: 'better' }), 'does_not_beat')).toBe(
      "Doesn't beat your offer: lower pay.",
    );
    expect(barLine(bar({ brand: 'worse', function: 'worse' }), 'does_not_beat')).toBe(
      "Doesn't beat your offer: weaker brand, further from your fields.",
    );
  });
  it('no clear edge', () => {
    expect(barLine(bar({}), 'does_not_beat')).toBe("Doesn't beat your offer: no clear edge.");
  });
  it('null when bar data missing', () => {
    expect(barLine(r({}), 'beats')).toBeNull();
  });
  it('exports the score title', () => {
    expect(FIT_SCORE_TITLE).toBe('Fit score out of 100');
  });
});

describe('parseReasons', () => {
  it('fills defaults for the Phase 3 shape', () => {
    expect(parseReasons({ fields: [], weight: 'primary', location_unknown: false })).toEqual({
      ...base,
      weight: 'primary',
    });
  });
  it('garbage never throws', () => {
    expect(parseReasons(null)).toEqual(base);
    expect(parseReasons('x')).toEqual(base);
  });
  it('keeps full shape and ai_reason', () => {
    const full = bar({ pay: 'better', pay_pct: 12 });
    const input = { ...full, dream: true, pay_ok: true, ai_reason: 'good' };
    expect(parseReasons(input)).toEqual(input);
  });
  it('bad individual keys fall back to defaults', () => {
    expect(parseReasons({ dream: 'yes', age_days: 3 })).toEqual({ ...base, age_days: 3 });
  });
});
