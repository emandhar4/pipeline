import { describe, expect, it } from 'vitest';
import {
  TITLE_FIELD_KEYWORDS,
  canonicalJobKey,
  classifyLevel,
  dedupeKey,
  fieldSlugsFromTitle,
  normalizeCompany,
  normalizeTitle,
  parseLocation,
  parseLocations,
  termsFromText,
} from '../../src/finder/classify';

const SLUGS = [
  'software-engineering', 'data-analysis', 'machine-learning-and-ai', 'product-management',
  'accounting-and-finance', 'engineering-and-development', 'business-analyst', 'marketing',
  'cybersecurity', 'consulting', 'creatives-and-design', 'management-and-executive',
  'public-sector-and-government', 'legal-and-compliance', 'human-resources', 'arts-and-entertainment',
  'sales', 'customer-service-and-support', 'education-and-training', 'healthcare', 'supply-chain',
];

describe('parseLocation', () => {
  it.each([
    ['San Francisco, CA', { state: 'CA', country: 'US', remote: false }],
    ['Remote in USA', { state: null, country: 'US', remote: true }],
    ['Hybrid - Austin, TX', { state: 'TX', country: 'US', remote: false }],
    ['London, UK', { state: null, country: 'GB', remote: false }],
    ['Toronto, ON, Canada', { state: null, country: 'CA', remote: false }],
    ['Austin, TX, United States', { state: 'TX', country: 'US', remote: false }],
    ['US', { state: null, country: 'US', remote: false }],
    ['Multiple Locations', { state: null, country: null, remote: false }],
    ['', { state: null, country: null, remote: false }],
  ])('%s', (text, expected) => {
    expect(parseLocation(text)).toEqual(expected);
  });
});

describe('parseLocations', () => {
  it('splits and sorts states', () => {
    const r = parseLocations(['New York, NY / San Francisco, CA']);
    expect(r.states).toEqual(['CA', 'NY']);
    expect(r.countries).toEqual(['US']);
    expect(r.remote).toBe('onsite');
    expect(r.unknown).toBe(false);
  });
  it('splits on semicolons and " or "', () => {
    expect(parseLocations(['Austin, TX; Denver, CO or Boston, MA']).states).toEqual(['CO', 'MA', 'TX']);
  });
  it('hybrid', () => {
    expect(parseLocations(['Hybrid - Austin, TX']).remote).toBe('hybrid');
  });
  it('remote', () => {
    const r = parseLocations(['Remote in USA']);
    expect(r.remote).toBe('remote');
    expect(r.unknown).toBe(false);
  });
  it('empty is unknown', () => {
    expect(parseLocations([])).toEqual({ states: [], countries: [], remote: 'unknown', unknown: true });
    expect(parseLocations(['Multiple Locations']).unknown).toBe(true);
  });
});

describe('classifyLevel', () => {
  it.each([
    ['Software Engineer Intern', 'internship'],
    ['Co-op, Finance (Fall 2027)', 'internship'],
    ['Product Manager Intern', 'internship'],
    ['New Grad Software Engineer 2027', 'new_grad'],
    ['Analyst, Early Careers Program', 'new_grad'],
    ['University Graduate - Data Scientist', 'new_grad'],
    ['Senior Product Manager', 'experienced'],
    ['Internal Audit Manager', 'experienced'],
    ['Business Analyst', 'unknown'],
  ])('%s', (title, level) => {
    expect(classifyLevel(title)).toBe(level);
  });
  it('uses hints', () => {
    expect(classifyLevel('Business Analyst', { employmentType: 'Intern' })).toBe('internship');
    expect(classifyLevel('Business Analyst', { commitment: 'Internship' })).toBe('internship');
    expect(classifyLevel('Business Analyst', { simplify: 'newgrad' })).toBe('new_grad');
    expect(classifyLevel('Business Analyst', { simplify: 'intern' })).toBe('internship');
  });
});

describe('termsFromText', () => {
  it.each([
    ['Summer 2027 Intern', ['Summer 2027']],
    ['Intern (2027 Summer)', ['Summer 2027']],
    ['Fall/Winter 2026 Co-op', ['Fall 2026', 'Winter 2026']],
    ['Autumn 2026 Co-op', ['Fall 2026']],
    ['Intern', []],
  ])('%s', (text, expected) => {
    expect(termsFromText(text)).toEqual(expected);
  });
});

describe('fieldSlugsFromTitle', () => {
  it('maps titles', () => {
    expect(fieldSlugsFromTitle('Accounting Intern')).toContain('accounting-and-finance');
    expect(fieldSlugsFromTitle('Business Analyst Intern')).toContain('business-analyst');
    expect(fieldSlugsFromTitle('Supply Chain Analyst, New Grad')).toContain('supply-chain');
    expect(fieldSlugsFromTitle('Software Engineer Intern')).toContain('software-engineering');
    expect(fieldSlugsFromTitle('Technical Recruiter Intern')).toContain('human-resources');
    expect(fieldSlugsFromTitle('Career Fair Coordinator')).not.toContain('healthcare');
    expect(fieldSlugsFromTitle('Intern')).toEqual([]);
  });
  it('maps Simplify categories', () => {
    expect(fieldSlugsFromTitle('Intern', 'AI/ML/Data')).toEqual(
      expect.arrayContaining(['machine-learning-and-ai', 'data-analysis']),
    );
    expect(fieldSlugsFromTitle('Intern', 'Hardware Engineering')).toContain('engineering-and-development');
    expect(fieldSlugsFromTitle('Intern', 'Quant')).toContain('accounting-and-finance');
    expect(fieldSlugsFromTitle('Intern', 'Product Management')).toContain('product-management');
    expect(fieldSlugsFromTitle('Intern', 'Something Else')).toEqual([]);
  });
  it('keyword map covers exactly the 21 slugs', () => {
    expect(Object.keys(TITLE_FIELD_KEYWORDS).sort()).toEqual([...SLUGS].sort());
  });
});

describe('normalizeCompany / normalizeTitle', () => {
  it('normalizes', () => {
    expect(normalizeCompany('Acme, Inc.')).toBe('acme');
    expect(normalizeCompany('ACME Corporation')).toBe('acme');
    expect(normalizeCompany('Acme Group Holdings Inc')).toBe('acme');
    expect(normalizeCompany('Johnson & Johnson')).toBe('johnson and johnson');
    expect(normalizeCompany('Company')).toBe('company');
  });
  it('normalizes titles', () => {
    expect(normalizeTitle('  Software Engineer, Intern (Summer) ')).toBe('software engineer intern summer');
  });
});

describe('canonicalJobKey', () => {
  const uuid = '1a2b3c4d-1111-2222-3333-444455556666';
  it.each([
    ['https://job-boards.greenhouse.io/acme/jobs/123?gh_src=x', 'greenhouse:acme:123'],
    ['https://boards.greenhouse.io/acme/jobs/123', 'greenhouse:acme:123'],
    [`https://jobs.lever.co/acme/${uuid}/apply`, `lever:acme:${uuid}`],
    [`https://jobs.ashbyhq.com/acme/${uuid}`, `ashby:acme:${uuid}`],
    [
      'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Austin-TX/Intern_R123',
      'workday:acme.wd5:external/job/austin-tx/intern_r123',
    ],
    ['https://example.test/careers', null],
    ['not a url', null],
  ])('%s', (url, expected) => {
    expect(canonicalJobKey(url)).toBe(expected);
  });
});

describe('dedupeKey', () => {
  const base = { applyUrl: null, title: 'Software Engineer Intern', states: ['CA'], remote: 'onsite' as const };
  it('is stable across company spelling', () => {
    const a = dedupeKey({ ...base, company: 'Acme, Inc.' });
    const b = dedupeKey({ ...base, company: 'ACME Corporation' });
    expect(a).toBe(b);
    expect(a.startsWith('h:')).toBe(true);
  });
  it('differs by state', () => {
    expect(dedupeKey({ ...base, company: 'Acme' })).not.toBe(dedupeKey({ ...base, company: 'Acme', states: ['NY'] }));
  });
  it('ignores state order', () => {
    expect(dedupeKey({ ...base, company: 'Acme', states: ['NY', 'CA'] })).toBe(
      dedupeKey({ ...base, company: 'Acme', states: ['CA', 'NY'] }),
    );
  });
  it('uses the ATS key when recognizable', () => {
    expect(dedupeKey({ ...base, company: 'Acme', applyUrl: 'https://boards.greenhouse.io/acme/jobs/9' })).toBe(
      'greenhouse:acme:9',
    );
  });
  it('falls back to hash for unrecognized URLs', () => {
    expect(dedupeKey({ ...base, company: 'Acme', applyUrl: 'https://example.test/x' }).startsWith('h:')).toBe(true);
  });
});
