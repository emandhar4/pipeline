import { classifyLevel, fieldSlugsFromTitle, parseLocations, termsFromText } from '../classify'
import type { RemoteKind } from '../classify'
import type { NormalizedPosting, ScopeResult } from '../types'

export const SHAPE_ERROR = 'unexpected response shape'

/** Loose per-row coercion helpers: a malformed field becomes undefined instead of failing the scope. */
export const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
export const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}
export const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
export const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((x): x is string => !!x) : [])

/** Unix seconds, ms or an ISO string to YYYY-MM-DD (UTC). */
export function toDate(v: unknown, unit: 's' | 'ms' | 'iso'): string | null {
  let ms: number | undefined
  if (unit === 'iso') {
    const s = str(v)
    ms = s ? Date.parse(s) : undefined
  } else {
    const n = num(v)
    ms = n === undefined ? undefined : unit === 's' ? n * 1000 : n
  }
  if (ms === undefined || Number.isNaN(ms)) return null
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export function cents(v: unknown): number | null {
  const n = num(v)
  return n === undefined || n < 0 ? null : Math.round(n * 100)
}

export function periodFrom(text: string | undefined): 'hour' | 'year' | null {
  if (!text) return null
  if (/hour|hr/i.test(text)) return 'hour'
  if (/year|annual|yr/i.test(text)) return 'year'
  return null
}

export type PostingInput = {
  externalId: string
  company: string
  title: string
  locations: string[]
  /** An explicit flag from the API; 'remote' means a remote option exists. */
  remoteFlag?: 'remote' | 'hybrid' | null
  applyUrl?: string | null
  sourceUrl?: string | null
  postedDate?: string | null
  pay?: { min: number | null; max: number | null; period: 'hour' | 'year' | null }
  terms?: string[]
  levelHints?: { commitment?: string; employmentType?: string; simplify?: 'intern' | 'newgrad' }
  category?: string
  active?: boolean
  sponsorship?: NormalizedPosting['sponsorship']
}

export function buildPosting(i: PostingInput): NormalizedPosting {
  const loc = parseLocations(i.locations)
  let remote: RemoteKind = loc.remote
  if (i.remoteFlag === 'hybrid') remote = 'hybrid'
  else if (i.remoteFlag === 'remote' && remote !== 'hybrid') remote = 'remote'
  const pay = i.pay
  // No period means we cannot say what the numbers mean, so store no pay at all.
  const hasPay = pay && pay.period !== null && (pay.min !== null || pay.max !== null)
  return {
    externalId: i.externalId,
    company: i.company,
    title: i.title,
    locations: i.locations,
    states: loc.states,
    countries: loc.countries,
    remote,
    locationUnknown: remote === 'remote' ? false : loc.unknown,
    applyUrl: i.applyUrl ?? null,
    sourceUrl: i.sourceUrl ?? null,
    postedDate: i.postedDate ?? null,
    payMinCents: hasPay ? pay.min : null,
    payMaxCents: hasPay ? pay.max : null,
    payPeriod: hasPay ? pay.period : null,
    terms: i.terms ?? termsFromText(i.title),
    level: classifyLevel(i.title, i.levelHints),
    fieldSlugs: fieldSlugsFromTitle(i.title, i.category),
    active: i.active ?? true,
    sponsorship: i.sponsorship ?? null,
  }
}

export function scopeOk(
  scope: string,
  source: string,
  companyId: string | null,
  fetched: number,
  postings: NormalizedPosting[],
  complete = true,
): ScopeResult {
  return { scope, source, companyId, status: 'ok', fetched, complete, postings }
}

/** True when rejected rows (missing required fields) mean the response is not the shape we expect. */
export function tooManyRejected(valid: number, rejected: number): boolean {
  return rejected > 0 && (valid === 0 || rejected / (valid + rejected) > 0.2)
}

export type Parsed = { postings: NormalizedPosting[]; rejected: number }

export function scopeFailed(scope: string, source: string, companyId: string | null, reason: string): ScopeResult {
  return { scope, source, companyId, status: 'failed', reason, fetched: 0, complete: false, postings: [] }
}
