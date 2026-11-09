import { countryName, COUNTRIES, stateFromLocation, type UsState } from '../../lib/onboarding/regions';
import type { RemoteKind } from './types';

export type ParsedLocation = { state: UsState | null; country: string | null; remote: boolean };

const COUNTRY_BY_NAME = new Map<string, string>();
for (const code of COUNTRIES) COUNTRY_BY_NAME.set(countryName(code).toLowerCase(), code);
for (const [alias, code] of Object.entries({
  us: 'US', usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', 'united states': 'US', 'united states of america': 'US',
  uk: 'GB', 'u.k.': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'great britain': 'GB',
  'south korea': 'KR', korea: 'KR', russia: 'RU', 'czech republic': 'CZ', vietnam: 'VN', uae: 'AE',
})) {
  COUNTRY_BY_NAME.set(alias, code);
}

const REMOTE_RE = /\bremote(ly)?\b|\bwork from home\b|\bwfh\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const MODE_PREFIX_RE = /^\s*(?:(?:fully\s+)?remote|hybrid|on-?site|in[- ]office)\s*(?:[-–—:|]|\bin\b|\bwithin\b|\(|\bor\b)?\s*/i;

function stripModes(text: string): string {
  let s = text.replace(/[()]/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    const next = s.replace(MODE_PREFIX_RE, '').trim();
    if (next === s) break;
    s = next;
  }
  for (let i = 0; i < 3; i++) {
    const next = s
      .replace(/\s*[-–—|:]\s*(?:remote|hybrid|on-?site)\s*$/i, '')
      .replace(/\s+(?:remote|hybrid)\s*$/i, '')
      .trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

export function parseLocation(text: string): ParsedLocation {
  const remote = REMOTE_RE.test(text);
  const segments = stripModes(text)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  let country: string | null = null;
  const last = segments[segments.length - 1];
  // "Atlanta, Georgia": a trailing US state name beats a same-named country.
  const lastIsState = segments.length > 1 && last !== undefined && stateFromLocation(last) !== null;
  if (last !== undefined && !lastIsState) {
    const code = COUNTRY_BY_NAME.get(last.toLowerCase());
    if (code) {
      country = code;
      segments.pop();
    }
  }
  const state = segments.length > 0 ? stateFromLocation(segments.join(', ')) : null;
  if (state) country = 'US';
  return { state, country, remote };
}

/** Splits on " / ", ";", "|", " or ", and on a bare "/" when every side has a comma ("Austin, TX/Denver, CO"). */
function splitPlaces(text: string): string[] {
  const out: string[] = [];
  for (const piece of text.split(/\s+\/\s+|;|\||\s+or\s+/i)) {
    const sub = piece.split('/');
    if (sub.length > 1 && sub.every((x) => x.includes(','))) out.push(...sub);
    else out.push(piece);
  }
  return out;
}

/** A posting's raw location strings, split into places. Splits on " / ", ";", "|" and " or ". */
export function parseLocations(texts: string[]): {
  states: UsState[];
  countries: string[];
  remote: RemoteKind;
  unknown: boolean;
} {
  const states = new Set<UsState>();
  const countries = new Set<string>();
  let anyHybrid = false;
  let anyRemote = false;
  let anyPlaced = false;
  for (const text of texts) {
    if (HYBRID_RE.test(text)) anyHybrid = true;
    for (const part of splitPlaces(text)) {
      const p = parseLocation(part);
      if (p.state) states.add(p.state);
      if (p.country) countries.add(p.country);
      if (p.remote) anyRemote = true;
      else if (p.state || p.country) anyPlaced = true;
    }
  }
  const unknown = states.size === 0 && countries.size === 0 && !anyRemote;
  let remote: RemoteKind;
  // 'remote' means a remote option exists (even alongside fixed offices); 'hybrid' only when the text says so.
  if (anyHybrid) remote = 'hybrid';
  else if (anyRemote) remote = 'remote';
  else if (anyPlaced) remote = 'onsite';
  else remote = 'unknown';
  return { states: [...states].sort(), countries: [...countries].sort(), remote, unknown };
}
