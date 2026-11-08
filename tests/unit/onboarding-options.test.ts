import { describe, expect, it } from 'vitest';
import { CAREER_STAGES, RELOCATE, WORK_AUTH, parsePayFloor, seasonOptions } from '@/lib/onboarding/options';

describe('seasonOptions', () => {
  it('lists the next six terms then Full-time', () => {
    expect(seasonOptions(new Date('2026-11-08'))).toEqual([
      'Spring 2027', 'Summer 2027', 'Fall 2027', 'Spring 2028', 'Summer 2028', 'Fall 2028', 'Full-time',
    ]);
  });
  it('skips a term that has already started', () => {
    expect(seasonOptions(new Date('2027-05-01'))[0]).toBe('Fall 2027');
    expect(seasonOptions(new Date('2027-04-30'))[0]).toBe('Summer 2027');
  });
});

describe('parsePayFloor', () => {
  it('treats blank as no floor', () => {
    expect(parsePayFloor('', 'year')).toEqual({ cents: null, period: null });
    expect(parsePayFloor('  ', 'hour')).toEqual({ cents: null, period: null });
  });
  it('parses zero, decimals and thousands separators', () => {
    expect(parsePayFloor('0', 'hour')).toEqual({ cents: 0, period: 'hour' });
    expect(parsePayFloor('22.50', 'hour')).toEqual({ cents: 2250, period: 'hour' });
    expect(parsePayFloor('85,000', 'year')).toEqual({ cents: 8500000, period: 'year' });
    expect(parsePayFloor('19.99', 'hour').cents).toBe(1999);
  });
  it('throws on non-numeric or over-precise input', () => {
    expect(() => parsePayFloor('abc', 'year')).toThrow();
    expect(() => parsePayFloor('1.234', 'hour')).toThrow();
    expect(() => parsePayFloor('-5', 'hour')).toThrow();
  });
});

describe('option lists', () => {
  it('match the DB enums and check', () => {
    expect(CAREER_STAGES.map((o) => o.value)).toEqual(['intern', 'new_grad', 'experienced', 'career_switcher']);
    expect(WORK_AUTH.map((o) => o.value)).toEqual(['citizen_or_pr', 'no_sponsorship_needed', 'needs_sponsorship']);
    expect(RELOCATE.map((o) => o.value)).toEqual(['no', 'within_region', 'anywhere']);
  });
});
