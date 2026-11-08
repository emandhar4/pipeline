import { describe, expect, it } from 'vitest';
import { answersFilled, prefillStepOne, prefillStepTwo } from '@/app/(app)/onboarding/prefill';
import type { StepOneValues } from '@/app/(app)/onboarding/step-one-form';
import type { StepTwoValues } from '@/app/(app)/onboarding/step-two-form';
import type { ResumeSuggestions } from '@/lib/resume/types';

const EMPTY_ONE: StepOneValues = {
  career_stage: '',
  school: '',
  school_id: '',
  major: '',
  major_cip: '',
  grad_date: '',
  work_auth: '',
  home_location: '',
  home_state: '',
  school_location: '',
  school_state: '',
  work_anywhere_us: false,
  work_states: [],
  work_countries: [],
  work_style: '',
};

const EMPTY_TWO: StepTwoValues = {
  fields: [],
  industries: [],
  pay_amount: '',
  pay_period: 'hour',
  season: '',
};

// Fictional suggestions; the school id and CIP are made up.
const FULL: ResumeSuggestions = {
  version: 1,
  school: { id: 'school-123', name: 'Example State University', city: 'Springfield', state: 'IL' },
  major: { cip: '14.3501', title: 'Industrial Engineering' },
  grad_date: '2027-05',
  home_location: 'Columbus, OH',
  home_state: 'OH',
  fields: [
    { slug: 'supply-chain', weight: 'primary', matched: ['supply chain', 'logistics', 'procurement'] },
    { slug: 'data-analysis', weight: 'secondary', matched: ['sql', 'tableau'] },
  ],
};

const CATEGORIES = [
  { slug: 'data-analysis', name: 'Data Analysis' },
  { slug: 'supply-chain', name: 'Supply Chain' },
  { slug: 'marketing', name: 'Marketing' },
];

describe('prefillStepOne', () => {
  it('fills every empty target from full suggestions and names them', () => {
    const { values, fromResume } = prefillStepOne(EMPTY_ONE, FULL);
    expect(values).toEqual({
      ...EMPTY_ONE,
      school: 'Example State University',
      school_id: 'school-123',
      school_location: 'Springfield, IL',
      school_state: 'IL',
      major: 'Industrial Engineering',
      major_cip: '14.3501',
      grad_date: '2027-05',
      home_location: 'Columbus, OH',
      home_state: 'OH',
    });
    expect([...fromResume].sort()).toEqual(
      [
        'school',
        'school_id',
        'school_location',
        'school_state',
        'major',
        'major_cip',
        'grad_date',
        'home_location',
        'home_state',
      ].sort(),
    );
    // The hidden ids ride along with their text fields; they are not separate answers.
    expect(answersFilled(fromResume)).toBe(7);
  });

  it('keeps a school the user already has, with its id, location and state', () => {
    const mine: StepOneValues = {
      ...EMPTY_ONE,
      school: 'My College',
      school_id: '',
      school_location: '',
      school_state: '',
    };
    const { values, fromResume } = prefillStepOne(mine, FULL);
    expect(values.school).toBe('My College');
    expect(values.school_id).toBe('');
    expect(values.school_location).toBe('');
    expect(values.school_state).toBe('');
    expect(values.grad_date).toBe('2027-05');
    expect(fromResume).not.toContain('school');
    expect(fromResume).not.toContain('school_location');
    expect(fromResume).toContain('grad_date');
  });

  it('never overwrites an answer the user gave', () => {
    const mine: StepOneValues = { ...EMPTY_ONE, grad_date: '2026-12', home_state: 'TX', major: 'History' };
    const { values, fromResume } = prefillStepOne(mine, FULL);
    expect(values.grad_date).toBe('2026-12');
    expect(values.home_state).toBe('TX');
    expect(values.major).toBe('History');
    expect(values.major_cip).toBe('');
    expect(fromResume).not.toContain('grad_date');
    expect(fromResume).not.toContain('major_cip');
    expect(fromResume).toContain('home_location');
  });

  it('leaves fields alone when a suggestion part is missing', () => {
    const partial: ResumeSuggestions = {
      ...FULL,
      school: { id: null, name: 'Some Free-Text College', city: null, state: null },
      major: { cip: null, title: 'Basket Weaving' },
      home_location: null,
      home_state: null,
    };
    const { values, fromResume } = prefillStepOne(EMPTY_ONE, partial);
    expect(values.school).toBe('Some Free-Text College');
    expect(values.school_id).toBe('');
    expect(values.school_location).toBe('');
    expect(values.major_cip).toBe('');
    expect(values.home_location).toBe('');
    expect([...fromResume].sort()).toEqual(['grad_date', 'major', 'school'].sort());
  });

  it('fills nothing once step 1 has been saved, so a blank left on purpose stays blank', () => {
    const saved: StepOneValues = { ...EMPTY_ONE, school: 'My College', grad_date: '' };
    const { values, fromResume } = prefillStepOne(saved, FULL, 1);
    expect(values).toEqual(saved);
    expect(values.grad_date).toBe('');
    expect(fromResume).toEqual([]);
    expect(prefillStepOne(saved, FULL, 2)).toEqual({ values: saved, fromResume: [] });
    // Before the first save it still fills.
    expect(prefillStepOne(saved, FULL, 0).values.grad_date).toBe('2027-05');
  });

  it('returns the values unchanged for null suggestions', () => {
    const { values, fromResume } = prefillStepOne(EMPTY_ONE, null);
    expect(values).toEqual(EMPTY_ONE);
    expect(fromResume).toEqual([]);
  });

  it('does not touch work style or work places', () => {
    const mine: StepOneValues = {
      ...EMPTY_ONE,
      work_style: 'remote_only',
      work_states: ['GA'],
      work_countries: ['CA'],
    };
    const { values } = prefillStepOne(mine, FULL);
    expect(values.work_style).toBe('remote_only');
    expect(values.work_states).toEqual(['GA']);
    expect(values.work_countries).toEqual(['CA']);
    expect(values.work_anywhere_us).toBe(false);
  });
});

describe('prefillStepTwo', () => {
  it('sets supply chain primary and data analysis secondary when no field is picked', () => {
    const { values, suggested } = prefillStepTwo(EMPTY_TWO, FULL, CATEGORIES);
    expect(values.fields).toEqual([
      { category_slug: 'supply-chain', label: 'Supply Chain', weight: 'primary' },
      { category_slug: 'data-analysis', label: 'Data Analysis', weight: 'secondary' },
    ]);
    expect(suggested).toEqual(['supply-chain', 'data-analysis']);
    expect({ ...values, fields: [] }).toEqual(EMPTY_TWO);
  });

  it('changes nothing when the user already has a field', () => {
    const mine: StepTwoValues = {
      ...EMPTY_TWO,
      fields: [{ category_slug: 'marketing', label: 'Marketing', weight: 'primary' }],
    };
    const { values, suggested } = prefillStepTwo(mine, FULL, CATEGORIES);
    expect(values).toEqual(mine);
    expect(suggested).toEqual([]);
  });

  it('changes nothing for null suggestions or no suggested fields', () => {
    expect(prefillStepTwo(EMPTY_TWO, null, CATEGORIES)).toEqual({ values: EMPTY_TWO, suggested: [] });
    expect(prefillStepTwo(EMPTY_TWO, { ...FULL, fields: [] }, CATEGORIES)).toEqual({
      values: EMPTY_TWO,
      suggested: [],
    });
  });

  it('drops suggested slugs that are no longer categories', () => {
    const stale: ResumeSuggestions = {
      ...FULL,
      fields: [
        { slug: 'retired-category', weight: 'primary', matched: ['a', 'b', 'c'] },
        { slug: 'data-analysis', weight: 'secondary', matched: ['sql', 'tableau'] },
      ],
    };
    const { values, suggested } = prefillStepTwo(EMPTY_TWO, stale, CATEGORIES);
    expect(values.fields).toEqual([
      { category_slug: 'data-analysis', label: 'Data Analysis', weight: 'secondary' },
    ]);
    expect(suggested).toEqual(['data-analysis']);
    const allStale = { ...stale, fields: [stale.fields[0]] };
    expect(prefillStepTwo(EMPTY_TWO, allStale, CATEGORIES)).toEqual({ values: EMPTY_TWO, suggested: [] });
  });
});
