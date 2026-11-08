import { createHash } from 'node:crypto';
import { normalizeCompany } from '../../lib/companies/normalize';
import type { RemoteKind } from './types';

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** `<ats>:<board>:<job id>` for recognizable ATS job URLs, else null. Query strings and trailing /apply are ignored. */
export function canonicalJobKey(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);

  if (/^(job-)?boards(\.[a-z]+)?\.greenhouse\.io$/.test(host)) {
    if (seg[1]?.toLowerCase() === 'jobs' && seg[0] && seg[2]) return `greenhouse:${seg[0].toLowerCase()}:${seg[2]}`;
    const board = u.searchParams.get('for');
    const id = u.searchParams.get('token');
    if (board && id) return `greenhouse:${board.toLowerCase()}:${id}`;
    return null;
  }
  if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') {
    return seg[0] && seg[1] ? `lever:${seg[0].toLowerCase()}:${seg[1].toLowerCase()}` : null;
  }
  if (host === 'jobs.ashbyhq.com') {
    return seg[0] && seg[1] ? `ashby:${seg[0].toLowerCase()}:${seg[1].toLowerCase()}` : null;
  }
  if (host === 'jobs.smartrecruiters.com') {
    const id = seg[1]?.match(/^\d+/)?.[0];
    return seg[0] && id ? `smartrecruiters:${seg[0].toLowerCase()}:${id}` : null;
  }
  if (host === 'apply.workable.com') {
    return seg[0] && seg[1]?.toLowerCase() === 'j' && seg[2] ? `workable:${seg[0].toLowerCase()}:${seg[2].toLowerCase()}` : null;
  }
  if (host.endsWith('.recruitee.com')) {
    return seg[0]?.toLowerCase() === 'o' && seg[1] ? `recruitee:${host.slice(0, -'.recruitee.com'.length)}:${seg[1].toLowerCase()}` : null;
  }
  if (host.endsWith('.myworkdayjobs.com')) {
    const rest = [...seg];
    if (rest[0] && /^[a-z]{2}(-[a-z]{2})?$/i.test(rest[0])) rest.shift();
    if (rest[rest.length - 1]?.toLowerCase() === 'apply') rest.pop();
    if (!rest.some((x) => ['job', 'details'].includes(x.toLowerCase()))) return null;
    return `workday:${host.slice(0, -'.myworkdayjobs.com'.length)}:${rest.join('/').toLowerCase()}`;
  }
  return null;
}

/** Canonical ATS key when the URL is recognizable, else `h:` + sha1 of company|title|states+remote. */
export function dedupeKey(p: {
  applyUrl: string | null;
  company: string;
  title: string;
  states: string[];
  countries: string[];
  remote: RemoteKind;
}): string {
  if (p.applyUrl) {
    const c = canonicalJobKey(p.applyUrl);
    if (c) return c;
  }
  const loc = `${[...new Set(p.states)].sort().join(',')}:${[...new Set(p.countries)].sort().join(',')}:${p.remote}`;
  const raw = `${normalizeCompany(p.company)}|${normalizeTitle(p.title)}|${loc}`;
  return `h:${createHash('sha1').update(raw).digest('hex')}`;
}
