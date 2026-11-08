import { describe, expect, it } from 'vitest';
import {
  AREAS,
  COUNTRIES,
  US_STATES,
  countryName,
  isUsState,
  stateFromLocation,
  toggleStates,
} from '@/lib/onboarding/regions';

describe('AREAS', () => {
  it('cover all 51 states exactly once', () => {
    const flat = AREAS.flatMap((a) => a.states).sort();
    expect(flat).toHaveLength(51);
    expect(flat).toEqual(US_STATES.map((s) => s.code).sort());
  });
  it('lists states alphabetically by name', () => {
    const names = US_STATES.map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
  it('isUsState recognises codes only', () => {
    expect(isUsState('GA')).toBe(true);
    expect(isUsState('PR')).toBe(false);
    expect(isUsState('ga')).toBe(false);
  });
});

describe('toggleStates', () => {
  it('adds then removes a group', () => {
    expect(toggleStates(['GA'], ['GA', 'FL'])).toEqual(['FL', 'GA']);
    expect(toggleStates(['FL', 'GA', 'TX'], ['GA', 'FL'])).toEqual(['TX']);
  });
});

describe('stateFromLocation', () => {
  it('reads the part after the last comma', () => {
    expect(stateFromLocation('Atlanta, GA')).toBe('GA');
    expect(stateFromLocation('austin, texas')).toBe('TX');
    expect(stateFromLocation('Washington, D.C.')).toBeNull();
    expect(stateFromLocation('Washington, DC')).toBe('DC');
    expect(stateFromLocation('Toronto, ON')).toBeNull();
    expect(stateFromLocation('')).toBeNull();
    expect(stateFromLocation('Georgia')).toBe('GA');
  });
});

describe('COUNTRIES', () => {
  it('is a clean list of non-US alpha-2 codes', () => {
    expect(COUNTRIES.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true);
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
    for (const c of ['CA', 'GB', 'IN']) expect(COUNTRIES).toContain(c);
    for (const c of ['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM']) expect(COUNTRIES).not.toContain(c);
  });
  it('names countries in English', () => {
    expect(countryName('DE')).toBe('Germany');
  });
});
