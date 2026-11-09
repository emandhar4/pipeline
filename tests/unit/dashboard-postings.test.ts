import { describe, expect, it } from 'vitest';
import {
  finderStale,
  formatUtcDate,
  locationLabel,
  missingList,
  profileCompleteness,
} from '@/lib/dashboard/postings';

const OK = {
  career_stage: 'intern' as const,
  work_style: 'in_person',
  work_states: ['CA'],
  work_anywhere_us: false,
  work_countries: [] as string[],
  season: 'Summer 2027',
};
const PRIMARY = [{ weight: 'primary' }];

describe('profileCompleteness', () => {
  it('is complete for a full profile', () => {
    expect(profileCompleteness(OK, PRIMARY)).toEqual({ complete: true });
  });
  it('flags each missing item', () => {
    expect(profileCompleteness({ ...OK, career_stage: null }, PRIMARY)).toEqual({
      complete: false,
      missing: ['stage'],
    });
    expect(profileCompleteness({ ...OK, work_style: null }, PRIMARY)).toEqual({
      complete: false,
      missing: ['work_style'],
    });
    expect(profileCompleteness({ ...OK, work_states: [] }, PRIMARY)).toEqual({
      complete: false,
      missing: ['places'],
    });
    expect(profileCompleteness(OK, [{ weight: 'secondary' }])).toEqual({
      complete: false,
      missing: ['primary_field'],
    });
    expect(profileCompleteness(OK, [])).toEqual({ complete: false, missing: ['primary_field'] });
    expect(profileCompleteness({ ...OK, season: null }, PRIMARY)).toEqual({
      complete: false,
      missing: ['season'],
    });
    expect(profileCompleteness({ ...OK, season: '  ' }, PRIMARY)).toEqual({
      complete: false,
      missing: ['season'],
    });
  });
  it('lists several missing items in order', () => {
    expect(
      profileCompleteness(
        { ...OK, career_stage: null, work_states: [], season: null },
        [],
      ),
    ).toEqual({ complete: false, missing: ['stage', 'places', 'primary_field', 'season'] });
  });
  it('counts anywhere-in-US and countries as places', () => {
    expect(profileCompleteness({ ...OK, work_states: [], work_anywhere_us: true }, PRIMARY)).toEqual(
      { complete: true },
    );
    expect(
      profileCompleteness({ ...OK, work_states: [], work_countries: ['CA'] }, PRIMARY),
    ).toEqual({ complete: true });
  });
  it('remote_only with no places is complete', () => {
    expect(
      profileCompleteness({ ...OK, work_style: 'remote_only', work_states: [] }, PRIMARY),
    ).toEqual({ complete: true });
  });
});

describe('missingList', () => {
  it('joins readable labels', () => {
    expect(missingList(['stage', 'work_style', 'places', 'primary_field', 'season'])).toBe(
      'career stage, work style, where you can work, a primary field, season',
    );
  });
});

describe('locationLabel', () => {
  it('says when the location is not listed', () => {
    expect(locationLabel({ locations: [], remote: 'unknown', location_unknown: true })).toBe(
      'Location not listed',
    );
  });
  it('says Remote for remote postings without a listed office', () => {
    expect(locationLabel({ locations: [], remote: 'remote', location_unknown: false })).toBe(
      'Remote',
    );
  });
  it('shows the first location plus a count', () => {
    expect(
      locationLabel({ locations: ['Austin, TX'], remote: 'onsite', location_unknown: false }),
    ).toBe('Austin, TX');
    expect(
      locationLabel({
        locations: ['Austin, TX', 'Denver, CO', 'Remote'],
        remote: 'hybrid',
        location_unknown: false,
      }),
    ).toBe('Austin, TX +2');
  });
});

describe('finderStale', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  it('is stale when it never ran', () => expect(finderStale(null, now)).toBe(true));
  it('is fresh at 35 hours', () => expect(finderStale(ago(35), now)).toBe(false));
  it('is stale at 37 hours', () => expect(finderStale(ago(37), now)).toBe(true));
});

describe('formatUtcDate', () => {
  it('formats in UTC regardless of local zone', () => {
    expect(formatUtcDate('2026-11-08T23:30:00Z')).toBe('Nov 8, 2026');
  });
});
