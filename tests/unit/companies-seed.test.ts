import { describe, expect, it } from 'vitest';
import { buildCompanyRows, buildIndustryRows } from '../../scripts/build-companies-seed';

const none = { greenhouse: [], lever: [], ashby: [], sp500: [] };

describe('buildCompanyRows', () => {
  it('keeps the first of duplicate names, in order greenhouse, lever, ashby', () => {
    const rows = buildCompanyRows({
      ...none,
      greenhouse: [{ name: 'Acme Inc.', token: 'acme-gh' }],
      lever: [{ name: 'ACME', token: 'acme-lv' }, { name: 'Beta', token: 'beta-lv' }],
      ashby: [{ name: 'Beta LLC', token: 'beta-ab' }],
    });
    expect(rows.map((r) => [r.normalized_name, r.ats, r.ats_token])).toEqual([
      ['acme', 'greenhouse', 'acme-gh'],
      ['beta', 'lever', 'beta-lv'],
    ]);
    expect(rows.every((r) => r.coverage === 'covered')).toBe(true);
  });

  it('adds an S&P HQ state to a matching ATS row instead of a new row', () => {
    const rows = buildCompanyRows({
      ...none,
      greenhouse: [{ name: 'Apple', token: 'apple' }],
      sp500: [{ name: 'Apple Inc.', hqState: 'CA' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].regions).toEqual(['CA']);
    expect(rows[0].ats).toBe('greenhouse');
  });

  it('adds unmatched S&P companies as unknown rows with the HQ region', () => {
    const rows = buildCompanyRows({ ...none, sp500: [{ name: 'Apple Inc.', hqState: 'CA' }, { name: 'Foo Corp', hqState: null }] });
    expect(rows).toEqual([
      { name: 'Apple Inc.', normalized_name: 'apple', ats: 'unknown', ats_token: null, ats_meta: {}, regions: ['CA'], coverage: 'unknown' },
      { name: 'Foo Corp', normalized_name: 'foo', ats: 'unknown', ats_token: null, ats_meta: {}, regions: [], coverage: 'unknown' },
    ]);
  });

  it('drops empty or whitespace tokens and empty names', () => {
    const rows = buildCompanyRows({
      ...none,
      greenhouse: [{ name: 'A', token: ' ' }, { name: 'B', token: '' }, { name: '!!!', token: 'x' }, { name: 'Ok', token: ' ok ' }],
    });
    expect(rows.map((r) => r.ats_token)).toEqual(['ok']);
  });

  it('marks EU lever boards in ats_meta', () => {
    const rows = buildCompanyRows({ ...none, lever: [{ name: 'Eu Co', token: 'euco', host: 'eu' }, { name: 'Us Co', token: 'usco' }] });
    expect(rows[0].ats_meta).toEqual({ region: 'eu' });
    expect(rows[1].ats_meta).toEqual({});
  });
});

describe('buildIndustryRows', () => {
  it('formats sector / sub-industry, drops empty sectors and dedupes by name', () => {
    const rows = buildIndustryRows([
      { name: 'Acme Corp', sector: 'Industrials', subIndustry: 'Aerospace & Defense' },
      { name: 'Acme Corp', sector: 'Financials', subIndustry: 'Banks' },
      { name: 'Nosector Inc', sector: '', subIndustry: 'Whatever' },
      { name: 'Beta Co', sector: 'Health Care', subIndustry: '' },
    ]);
    expect(rows).toEqual([
      { name: 'Acme Corp', industry: 'Industrials / Aerospace & Defense' },
      { name: 'Beta Co', industry: 'Health Care' },
    ]);
  });
});
