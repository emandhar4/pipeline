import { describe, expect, it } from 'vitest';
import {
  findGradDate,
  findHomeLocation,
  findMajorPhrases,
  findSchoolPhrases,
  suggestFields,
} from '@/lib/resume/parse';
import { FIELD_KEYWORDS } from '@/lib/resume/field-keywords';
import { resumeSuggestionsSchema } from '@/lib/resume/types';
import { FICTIONAL_RESUME_LINES } from '../fixtures/resume-pdf';

const TODAY = new Date('2026-11-08T12:00:00Z');
const RESUME = FICTIONAL_RESUME_LINES.join('\n');

// field_categories.sort order (supabase/migrations/20261108000200_onboarding.sql).
const ORDER = [
  'software-engineering', 'data-analysis', 'machine-learning-and-ai', 'product-management',
  'accounting-and-finance', 'engineering-and-development', 'business-analyst', 'marketing',
  'cybersecurity', 'consulting', 'creatives-and-design', 'management-and-executive',
  'public-sector-and-government', 'legal-and-compliance', 'human-resources',
  'arts-and-entertainment', 'sales', 'customer-service-and-support', 'education-and-training',
  'healthcare', 'supply-chain',
];

describe('findGradDate', () => {
  it('reads the expected graduation from the fixture', () => {
    expect(findGradDate(RESUME, TODAY)).toBe('2027-05');
  });
  it('reads "Class of" as May', () => {
    expect(findGradDate('Class of 2028', TODAY)).toBe('2028-05');
  });
  it('reads seasons and numeric months on education lines', () => {
    expect(findGradDate('B.S. in Biology, Spring 2027', TODAY)).toBe('2027-05');
    expect(findGradDate('Ohio State University, Fall 2027', TODAY)).toBe('2027-12');
    expect(findGradDate('Expected graduation 05/2027', TODAY)).toBe('2027-05');
  });
  it('ignores dates on lines that are not about education', () => {
    expect(findGradDate('Intern, June 2025 – Aug 2025', TODAY)).toBeNull();
  });
  it('ignores dates out of range', () => {
    expect(findGradDate('Expected May 2040', TODAY)).toBeNull();
    expect(findGradDate('College of Arts, May 2010', TODAY)).toBeNull();
  });
  it('takes the latest education date', () => {
    expect(findGradDate('Associate of Arts, May 2024\nMaster of Science, Expected Dec 2028', TODAY)).toBe(
      '2028-12',
    );
  });
});

describe('findHomeLocation', () => {
  it('reads City, ST from the header', () => {
    expect(findHomeLocation(RESUME)).toEqual({ location: 'Columbus, OH', state: 'OH' });
  });
  it('reads a full state name', () => {
    expect(findHomeLocation('Sam Doe • Austin, Texas • sam@example.test')).toEqual({
      location: 'Austin, Texas',
      state: 'TX',
    });
  });
  it('returns null when the header has no location', () => {
    expect(findHomeLocation('Jordan Example | jordan@example.test | 555-0100')).toBeNull();
  });
  it('only looks at the first 8 non-blank lines', () => {
    const text = ['a', 'b', 'c', 'd', '', 'e', 'f', 'g', 'h', 'Denver, CO'].join('\n');
    expect(findHomeLocation(text)).toBeNull();
  });
});

describe('findSchoolPhrases', () => {
  it("returns the fixture's school first", () => {
    expect(findSchoolPhrases(RESUME)[0]).toBe('Georgia Institute of Technology');
  });
  it('cuts at a month name or a comma before a digit, and returns at most 3', () => {
    const text = [
      'University of Example May 2027',
      'Example College, 2019',
      'Example Institute | Somewhere',
      'Another University',
    ].join('\n');
    expect(findSchoolPhrases(text)).toEqual(['University of Example', 'Example College', 'Example Institute']);
  });
});

describe('findMajorPhrases', () => {
  it('reads the fixture major', () => {
    expect(findMajorPhrases(RESUME)).toEqual(['Industrial Engineering']);
  });
  it('reads an abbreviated degree and cuts at the bar', () => {
    expect(findMajorPhrases('B.A. in Economics | GPA 3.6')).toEqual(['Economics']);
  });
  it('reads "Major:" and cuts at Minor', () => {
    expect(findMajorPhrases('Major: Nursing Minor: Spanish')).toEqual(['Nursing']);
  });
});

describe('suggestFields', () => {
  it('suggests supply chain first and data analysis second for the fixture', () => {
    const fields = suggestFields(RESUME, FIELD_KEYWORDS, ORDER);
    expect(fields.map((f) => [f.slug, f.weight])).toEqual([
      ['supply-chain', 'primary'],
      ['data-analysis', 'secondary'],
    ]);
    expect(fields[0].matched).toEqual(
      expect.arrayContaining(['supply chain', 'logistics', 'procurement', 'inventory']),
    );
    expect(fields[1].matched).toEqual(expect.arrayContaining(['sql', 'tableau', 'excel', 'dashboard']));
  });
  it('returns nothing without a primary', () => {
    expect(suggestFields('Proficient in Excel', FIELD_KEYWORDS, ORDER)).toEqual([]);
  });
  it('breaks ties by category order', () => {
    const kw = { b: ['x1', 'x2', 'x3'], a: ['y1', 'y2', 'y3'] };
    expect(suggestFields('x1 x2 x3 y1 y2 y3', kw, ['a', 'b']).map((f) => f.slug)).toEqual(['a', 'b']);
  });
  it('matches multi-word and symbol keywords on word boundaries', () => {
    const kw = { s: ['c++', 'power bi', 'r'] };
    expect(suggestFields('C++, Power BI and R', kw, ['s'])[0].matched).toEqual(['c++', 'power bi', 'r']);
    expect(suggestFields('ruby', { s: ['r', 'ruby', 'rust'] }, ['s'])).toEqual([]);
  });
});

describe('FIELD_KEYWORDS', () => {
  it('covers exactly the 21 categories with 8-15 unique lowercase keywords each', () => {
    expect(Object.keys(FIELD_KEYWORDS).sort()).toEqual([...ORDER].sort());
    const seen = new Map<string, string>();
    for (const [slug, words] of Object.entries(FIELD_KEYWORDS)) {
      expect(words.length, slug).toBeGreaterThanOrEqual(8);
      expect(words.length, slug).toBeLessThanOrEqual(15);
      for (const w of words) {
        expect(w, slug).toBe(w.toLowerCase());
        expect(seen.get(w), `${w} in ${slug}`).toBeUndefined();
        seen.set(w, slug);
      }
    }
  });
});

describe('resumeSuggestionsSchema', () => {
  it('accepts a full suggestion and rejects a bad state', () => {
    const ok = {
      version: 1,
      school: { id: null, name: 'X University', city: null, state: 'OH' },
      major: { cip: null, title: 'Biology' },
      grad_date: '2027-05',
      home_location: 'Columbus, OH',
      home_state: 'OH',
      fields: [{ slug: 'healthcare', weight: 'primary', matched: ['clinical'] }],
    };
    expect(resumeSuggestionsSchema.safeParse(ok).success).toBe(true);
    expect(resumeSuggestionsSchema.safeParse({ ...ok, home_state: 'ZZ' }).success).toBe(false);
  });
});
