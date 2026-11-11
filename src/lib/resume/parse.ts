import { stateFromLocation, type UsState } from '@/lib/onboarding/regions';
import type { ResumeSuggestions } from './types';

// Pure text heuristics over extracted resume text. No I/O.

const MONTHS: [RegExp, number][] = [
  [/^jan/i, 1], [/^feb/i, 2], [/^mar/i, 3], [/^apr/i, 4], [/^may/i, 5], [/^jun/i, 6],
  [/^jul/i, 7], [/^aug/i, 8], [/^sep/i, 9], [/^oct/i, 10], [/^nov/i, 11], [/^dec/i, 12],
];
const MONTH_WORD =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const SEASON_MONTH: Record<string, number> = { spring: 5, summer: 8, fall: 12, autumn: 12, winter: 12 };

// Abbreviated degrees use word boundaries so "jobs" or "database" do not count.
const EDUCATION_LINE =
  /universit|college|institute|bachelor|master|associate|\bb\.?s\b|\bb\.?a\b|expected|graduat|class of/i;

function lines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim());
}

function monthOf(word: string): number {
  return MONTHS.find(([re]) => re.test(word))![1];
}

function dateKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Month-year dates written on one line, as [year, month] pairs. */
function datesOnLine(line: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of line.matchAll(new RegExp(`\\b(${MONTH_WORD})\\.?,?\\s+(\\d{4})\\b`, 'gi'))) {
    out.push([Number(m[2]), monthOf(m[1])]);
  }
  for (const m of line.matchAll(/\b(0?[1-9]|1[0-2])\s*\/\s*(\d{4})\b/g)) {
    out.push([Number(m[2]), Number(m[1])]);
  }
  for (const m of line.matchAll(/\b(spring|summer|fall|autumn|winter)\s+(\d{4})\b/gi)) {
    out.push([Number(m[2]), SEASON_MONTH[m[1].toLowerCase()]]);
  }
  for (const m of line.matchAll(/\bclass\s+of\s+(\d{4})\b/gi)) {
    out.push([Number(m[1]), 5]);
  }
  return out;
}

/**
 * The latest month-year (YYYY-MM) on an education line, within [today - 10y, today + 6y].
 * Seasons: Spring = May, Summer = August, Fall/Winter = December. "Class of" = May.
 */
export function findGradDate(text: string, today: Date): string | null {
  const now = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const min = now - 120;
  const max = now + 72;
  let best: number | null = null;
  for (const line of lines(text)) {
    if (!EDUCATION_LINE.test(line)) continue;
    for (const [year, month] of datesOnLine(line)) {
      const idx = year * 12 + (month - 1);
      if (idx < min || idx > max) continue;
      if (best === null || idx > best) best = idx;
    }
  }
  return best === null ? null : dateKey(Math.floor(best / 12), (best % 12) + 1);
}

const SEGMENT_SPLIT = /[|•·]/;
const CITY_STATE = /^([A-Za-z][A-Za-z .'-]{0,40}),\s*([A-Za-z][A-Za-z ]{1,24})$/;

/** `City, ST` or `City, Statename` in the first 8 non-blank lines (split on |, • and ·). */
export function findHomeLocation(text: string): { location: string; state: UsState } | null {
  const head = lines(text).filter(Boolean).slice(0, 8);
  for (const line of head) {
    for (const raw of line.split(SEGMENT_SPLIT)) {
      const seg = raw.trim().replace(/\s+/g, ' ');
      const m = CITY_STATE.exec(seg);
      if (!m) continue;
      const state = stateFromLocation(seg);
      if (state) return { location: `${m[1].trim()}, ${m[2].trim()}`, state };
    }
  }
  return null;
}

const SCHOOL_WORD = /universit|college|institute|polytechnic|school of/i;
const SCHOOL_CUT = new RegExp(`\\s-\\s|\\s–\\s|\\||,\\s*\\d|\\b(?:${MONTH_WORD})\\b`, 'i');

/** Up to 3 school-like phrases (at most 120 chars), each cut before a dash, date or comma + digit. */
export function findSchoolPhrases(text: string): string[] {
  const out: string[] = [];
  for (const line of lines(text)) {
    for (const seg of line.split(SEGMENT_SPLIT)) {
      if (!SCHOOL_WORD.test(seg)) continue;
      const cut = SCHOOL_CUT.exec(seg);
      const phrase = (cut ? seg.slice(0, cut.index) : seg).trim().replace(/[,;:]+$/, '').trim();
      if (!phrase || phrase.length > 120 || !SCHOOL_WORD.test(phrase) || out.includes(phrase)) continue;
      out.push(phrase);
      if (out.length === 3) return out;
    }
  }
  return out;
}

const MAJOR_START = [
  /\b(?:bachelor|master|associate)(?:'?s)?\s+of\s+(?:science|arts|business administration|engineering|fine arts)\s+in\s+/gi,
  /(?:^|[^a-z])(?:b\.?s|b\.?a|bba|b\.b\.a|m\.?s)\.?\s+in\s+/gi,
  /\bmajor:\s*/gi,
];
const MAJOR_CUT = /\||,|\s-\s|\s–\s|\bminor\b|\bgpa\b/i;

/** Majors written after a degree name ("Bachelor of Science in ...", "B.A. in ...") or "Major:". */
export function findMajorPhrases(text: string): string[] {
  const out: string[] = [];
  for (const line of lines(text)) {
    for (const start of MAJOR_START) {
      for (const m of line.matchAll(start)) {
        const rest = line.slice(m.index + m[0].length);
        const cut = MAJOR_CUT.exec(rest);
        const phrase = (cut ? rest.slice(0, cut.index) : rest).trim();
        if (phrase.length >= 3 && !out.includes(phrase)) out.push(phrase);
      }
    }
  }
  return out;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive, whole-word (letters and digits) match; works for "c++" and "power bi". */
function hasKeyword(text: string, keyword: string): boolean {
  const body = escape(keyword).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, 'i').test(text);
}

/**
 * Field suggestions by distinct keyword hits. Primary: the top category if it has 3+.
 * Secondary: up to 2 next with 3+. A flat floor, not a share of the primary score, so a
 * tool-heavy skills line in one field does not hide real experience in another.
 * Ties follow `order`.
 */
export function suggestFields(
  text: string,
  keywords: Record<string, string[]>,
  order: string[],
): ResumeSuggestions['fields'] {
  const rank = (slug: string) => {
    const i = order.indexOf(slug);
    return i === -1 ? order.length : i;
  };
  const scored = Object.entries(keywords)
    .map(([slug, words]) => ({ slug, matched: words.filter((w) => hasKeyword(text, w)) }))
    .filter((s) => s.matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length || rank(a.slug) - rank(b.slug));

  const [top, ...rest] = scored;
  if (!top || top.matched.length < 3) return [];
  const secondary = rest.filter((s) => s.matched.length >= 3).slice(0, 2);
  return [
    { slug: top.slug, weight: 'primary', matched: top.matched },
    ...secondary.map((s) => ({ slug: s.slug, weight: 'secondary' as const, matched: s.matched })),
  ];
}
