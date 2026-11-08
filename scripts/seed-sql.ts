// Pure helpers for the lookup-seed generators. No I/O.
import { isUsState, type UsState } from '../src/lib/onboarding/regions';

export function sqlText(s: string | null): string {
  return s === null ? 'null' : `'${s.replace(/'/g, "''")}'`;
}

function sqlValue(v: string | number | null): string {
  if (v === null) return 'null';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`non-finite number in seed: ${v}`);
    return String(v);
  }
  return sqlText(v);
}

export function insertStatements(
  table: string,
  columns: string[],
  rows: Record<string, string | number | null>[],
  conflict: string,
  batch = 500,
): string {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += batch) {
    const values = rows
      .slice(i, i + batch)
      .map((r) => `(${columns.map((c) => sqlValue(r[c] ?? null)).join(', ')})`)
      .join(',\n');
    out.push(`insert into ${table} (${columns.join(', ')}) values\n${values}\n${conflict};\n`);
  }
  return out.join('\n');
}

const EXCLUDED_FAMILIES = new Set(['28', '32', '33', '34', '35', '36', '37', '53', '60', '61']);

function unwrap(s: string | undefined): string {
  const t = (s ?? '').trim();
  const m = /^="(.*)"$/.exec(t);
  return (m ? m[1] : t).trim();
}

export function toMajorRows(
  csv: Record<string, string>[],
): { cip_code: string; title: string; family: string }[] {
  const seen = new Set<string>();
  const out: { cip_code: string; title: string; family: string }[] = [];
  for (const r of csv) {
    const action = (r.Action ?? '').trim();
    if (action.startsWith('Deleted') || action.startsWith('Moved to')) continue;
    const code = unwrap(r.CIPCode);
    if (!/^\d{2}\.\d{4}$/.test(code)) continue;
    const family = unwrap(r.CIPFamily) || code.slice(0, 2);
    if (EXCLUDED_FAMILIES.has(family) || code.endsWith('99')) continue;
    const title = (r.CIPTitle ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\.$/, '')
      .replace(/, General$/, '')
      .trim();
    if (!title || title === 'Reserved') continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cip_code: code, title, family });
  }
  return out;
}

export type ScorecardResult = {
  id: number;
  'school.name': string;
  'school.city'?: string | null;
  'school.state'?: string | null;
  'school.alias'?: string | null;
};

export function toSchoolRows(
  results: ScorecardResult[],
): { unitid: number; name: string; city: string | null; state: UsState; alias: string | null }[] {
  const out: { unitid: number; name: string; city: string | null; state: UsState; alias: string | null }[] = [];
  for (const r of results) {
    const state = r['school.state'];
    if (!state || !isUsState(state)) continue;
    const name = (r['school.name'] ?? '').trim();
    if (!name || !Number.isInteger(r.id)) continue;
    const alias = (r['school.alias'] ?? '').trim();
    const city = (r['school.city'] ?? '').trim();
    out.push({ unitid: r.id, name, city: city || null, state, alias: alias || null });
  }
  return out;
}

/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF, BOM). Returns one object per data row. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => r.length > 1 || r[0] !== '');
  if (!header) return [];
  const names = header.map((h) => h.trim());
  return data.map((r) => Object.fromEntries(names.map((n, i) => [n, r[i] ?? ''])));
}
