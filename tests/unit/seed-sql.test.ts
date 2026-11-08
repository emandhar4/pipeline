import { describe, expect, it } from 'vitest';
import { insertStatements, parseCsv, sqlText, toMajorRows, toSchoolRows } from '../../scripts/seed-sql';

describe('sqlText', () => {
  it('doubles single quotes', () => expect(sqlText("O'Brien")).toBe("'O''Brien'"));
  it('maps null to null', () => expect(sqlText(null)).toBe('null'));
});

describe('toMajorRows', () => {
  const row = (over: Record<string, string>) => ({
    CIPFamily: '="52"',
    CIPCode: '="52.0203"',
    Action: '',
    CIPTitle: 'Logistics, Materials, and Supply Chain Management.',
    ...over,
  });

  it('strips Excel wrappers and the trailing period', () => {
    expect(toMajorRows([row({})])).toEqual([
      { cip_code: '52.0203', title: 'Logistics, Materials, and Supply Chain Management', family: '52' },
    ]);
  });
  it('drops Other (99), excluded families and deleted/moved rows', () => {
    const out = toMajorRows([
      row({ CIPCode: '="52.0299"', CIPTitle: 'Other.' }),
      row({ CIPFamily: '="32"', CIPCode: '="32.0101"' }),
      row({ CIPCode: '="52.0204"', Action: 'Deleted' }),
      row({ CIPCode: '="52.0205"', Action: 'Moved to 52.0206' }),
      row({ CIPCode: '="52.02"' }),
    ]);
    expect(out).toEqual([]);
  });
  it('keeps Moved from rows, drops Reserved, collapses whitespace', () => {
    const out = toMajorRows([
      row({ CIPCode: '="43.0106"', Action: 'Moved from 43.0102', CIPTitle: 'Forensic Science.' }),
      row({ CIPCode: '="01.0480"', CIPTitle: 'Reserved.' }),
      row({ CIPCode: '="54.0102"', CIPTitle: 'American  History (United States).' }),
    ]);
    expect(out.map((r) => r.title)).toEqual(['Forensic Science', 'American History (United States)']);
  });
  it('strips ", General" and dedupes on lowercased title', () => {
    const out = toMajorRows([
      row({ CIPFamily: '="45"', CIPCode: '="45.0601"', CIPTitle: 'Economics, General.' }),
      row({ CIPFamily: '="45"', CIPCode: '="45.0602"', CIPTitle: 'economics' }),
    ]);
    expect(out).toEqual([{ cip_code: '45.0601', title: 'Economics', family: '45' }]);
  });
});

describe('toSchoolRows', () => {
  const r = (state: string, alias: string | null, id = 1) => ({
    id,
    'school.name': 'Test U',
    'school.city': 'Town',
    'school.state': state,
    'school.alias': alias,
  });
  it('drops non-US-state results, nulls blank aliases, keeps id as unitid', () => {
    expect(toSchoolRows([r('PR', null, 9), r('GA', '', 42)])).toEqual([
      { unitid: 42, name: 'Test U', city: 'Town', state: 'GA', alias: null },
    ]);
  });
});

describe('insertStatements', () => {
  it('batches rows', () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ a: i, b: `x${i}` }));
    const sql = insertStatements('public.t', ['a', 'b'], rows, 'on conflict (a) do update set b = excluded.b', 500);
    const stmts = sql.trim().split(/;\n/).filter(Boolean);
    expect(stmts).toHaveLength(3);
    expect(sql.match(/^insert into/gm)).toHaveLength(3);
    expect(sql.match(/on conflict \(a\) do update set b = excluded\.b;/g)).toHaveLength(3);
  });
});

describe('parseCsv', () => {
  it('handles Excel ="..." cells, quoted commas and doubled quotes', () => {
    const csv = 'A,B,C\r\n="01",\"x, y\",\"say \"\"hi\"\"\"\r\n';
    expect(parseCsv(csv)).toEqual([{ A: '="01"', B: 'x, y', C: 'say "hi"' }]);
  });
});
