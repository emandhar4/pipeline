import { describe, expect, it } from 'vitest';
import { stepOneHints, stepTwoHint } from '@/app/(app)/onboarding/prefill';
import { stepHref } from '@/app/(app)/onboarding/steps';
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
    { slug: 'data-analysis', weight: 'secondary', matched: ['sql', 'tableau'] },
    { slug: 'supply-chain', weight: 'primary', matched: ['supply chain', 'logistics', 'procurement'] },
  ],
};

const CATEGORIES = [
  { slug: 'data-analysis', name: 'Data Analysis' },
  { slug: 'supply-chain', name: 'Supply Chain' },
  { slug: 'marketing', name: 'Marketing' },
];

/** Saved answers that match FULL exactly. */
const MATCHING: StepOneValues = {
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
};

describe('stepOneHints', () => {
  it('gives no hints before step 1 is first saved (prefill applies then) or without suggestions', () => {
    expect(stepOneHints(EMPTY_ONE, FULL, 0)).toEqual({});
    expect(stepOneHints(EMPTY_ONE, null, 1)).toEqual({});
  });

  it('hints every field whose suggestion differs, with the values "Use this" sets', () => {
    const mine: StepOneValues = {
      ...EMPTY_ONE,
      school: 'My College',
      school_location: 'Elsewhere, TX',
      school_state: 'TX',
      major: 'History',
      grad_date: '2026-12',
      home_location: 'Austin, TX',
      home_state: 'TX',
    };
    expect(stepOneHints(mine, FULL, 1)).toEqual({
      school: {
        text: 'Example State University',
        set: {
          school: 'Example State University',
          school_id: 'school-123',
          school_location: 'Springfield, IL',
          school_state: 'IL',
        },
      },
      major: { text: 'Industrial Engineering', set: { major: 'Industrial Engineering', major_cip: '14.3501' } },
      grad_date: { text: 'May 2027', set: { grad_date: '2027-05' } },
      home_location: { text: 'Columbus, OH', set: { home_location: 'Columbus, OH', home_state: 'OH' } },
    });
  });

  it('gives no hint where the saved answer already matches (case and spaces ignored)', () => {
    expect(stepOneHints(MATCHING, FULL, 2)).toEqual({});
    const loose: StepOneValues = {
      ...MATCHING,
      school_id: '',
      school: '  example state UNIVERSITY ',
      major_cip: '',
      major: 'industrial engineering',
      home_location: 'columbus, oh ',
    };
    expect(stepOneHints(loose, FULL, 2)).toEqual({});
  });

  it('hints empty saved answers too, without filling them', () => {
    const hints = stepOneHints(EMPTY_ONE, FULL, 1);
    expect(Object.keys(hints).sort()).toEqual(['grad_date', 'home_location', 'major', 'school']);
  });

  it('compares school and major by id when both sides have one', () => {
    // Same id, different spelling: the same school, no hint.
    const sameId: StepOneValues = { ...MATCHING, school: 'Example State U', major: 'Ind. Eng.' };
    expect(stepOneHints(sameId, FULL, 2)).toEqual({});
    // Same name, different id: a different campus, hint.
    const otherId: StepOneValues = { ...MATCHING, school_id: 'school-999', major_cip: '14.9999' };
    expect(Object.keys(stepOneHints(otherId, FULL, 2)).sort()).toEqual(['major', 'school']);
  });

  it('only sets the parts the resume has', () => {
    const partial: ResumeSuggestions = {
      ...FULL,
      school: { id: null, name: 'Some Free-Text College', city: null, state: null },
      major: null,
      grad_date: null,
      home_location: null,
      home_state: 'GA',
    };
    expect(stepOneHints(MATCHING, partial, 2)).toEqual({
      school: { text: 'Some Free-Text College', set: { school: 'Some Free-Text College', school_id: '' } },
      home_location: { text: 'Georgia', set: { home_state: 'GA' } },
    });
  });
});

describe('stepTwoHint', () => {
  const saved = (fields: StepTwoValues['fields']): StepTwoValues => ({ ...EMPTY_TWO, fields });

  it('suggests the resume fields, primary first, when they differ from the saved ones', () => {
    const hint = stepTwoHint(
      saved([{ category_slug: 'marketing', label: 'Marketing', weight: 'primary' }]),
      FULL,
      CATEGORIES,
    );
    expect(hint).toEqual({
      text: 'Supply Chain (primary), Data Analysis (secondary)',
      fields: [
        { category_slug: 'supply-chain', label: 'Supply Chain', weight: 'primary' },
        { category_slug: 'data-analysis', label: 'Data Analysis', weight: 'secondary' },
      ],
    });
  });

  it('is null when the saved fields already match, or a weight is the only thing that matches', () => {
    const same = saved([
      { category_slug: 'data-analysis', label: 'Data Analysis', weight: 'secondary' },
      { category_slug: 'supply-chain', label: 'Supply Chain', weight: 'primary' },
      // A field the user added by hand does not count against the suggestion.
      { category_slug: null, label: 'Robotics', weight: 'secondary' },
    ]);
    expect(stepTwoHint(same, FULL, CATEGORIES)).toBeNull();
    const swapped = saved([
      { category_slug: 'data-analysis', label: 'Data Analysis', weight: 'primary' },
      { category_slug: 'supply-chain', label: 'Supply Chain', weight: 'secondary' },
    ]);
    expect(stepTwoHint(swapped, FULL, CATEGORIES)).not.toBeNull();
  });

  it('hints when nothing is saved and is null without suggestions', () => {
    expect(stepTwoHint(EMPTY_TWO, FULL, CATEGORIES)?.fields).toHaveLength(2);
    expect(stepTwoHint(EMPTY_TWO, null, CATEGORIES)).toBeNull();
    expect(stepTwoHint(EMPTY_TWO, { ...FULL, fields: [] }, CATEGORIES)).toBeNull();
  });

  it('drops slugs that are no longer categories', () => {
    const stale: ResumeSuggestions = {
      ...FULL,
      fields: [
        { slug: 'retired-category', weight: 'primary', matched: ['a', 'b', 'c'] },
        { slug: 'data-analysis', weight: 'secondary', matched: ['sql', 'tableau'] },
      ],
    };
    expect(stepTwoHint(EMPTY_TWO, stale, CATEGORIES)).toEqual({
      text: 'Data Analysis (secondary)',
      fields: [{ category_slug: 'data-analysis', label: 'Data Analysis', weight: 'secondary' }],
    });
    const onlyStale = { ...stale, fields: [stale.fields[0]] };
    expect(stepTwoHint(EMPTY_TWO, onlyStale, CATEGORIES)).toBeNull();
  });
});

describe('stepHref', () => {
  it('always links the resume step unless it is the current one', () => {
    expect(stepHref(0, 1, 0)).toBe('/onboarding?step=resume');
    expect(stepHref(0, 2, 1)).toBe('/onboarding?step=resume');
    expect(stepHref(0, 0, 1)).toBeNull();
  });

  it('links "Who you are" whenever it is not current', () => {
    expect(stepHref(1, 0, 0)).toBe('/onboarding?step=1');
    expect(stepHref(1, 2, 1)).toBe('/onboarding?step=1');
    expect(stepHref(1, 1, 1)).toBeNull();
  });

  it('links "What you want" only once step 1 is saved', () => {
    expect(stepHref(2, 0, 0)).toBeNull();
    expect(stepHref(2, 1, 0)).toBeNull();
    expect(stepHref(2, 0, 1)).toBe('/onboarding?step=2');
    expect(stepHref(2, 1, 2)).toBe('/onboarding?step=2');
    expect(stepHref(2, 2, 1)).toBeNull();
  });
});
