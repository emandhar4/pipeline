import type { Http } from '../http'
import type { BoardCompany, ScopeResult } from '../types'
import * as ashby from './ashby'
import { SHAPE_ERROR, scopeFailed, scopeOk, tooManyRejected } from './build'
import type { Parsed } from './build'
import * as greenhouse from './greenhouse'
import * as lever from './lever'
import * as recruitee from './recruitee'
import { fetchSmartRecruiters, url as smartrecruitersUrl } from './smartrecruiters'
import * as workable from './workable'
import { fetchWorkday, url as workdayUrl } from './workday'

export { fetchSimplify, simplifyUrl } from './simplify'
export type { BoardCompany, NormalizedPosting, ScopeResult } from '../types'

export const BOARD_URLS = {
  greenhouse: greenhouse.url,
  lever: lever.url,
  ashby: ashby.url,
  smartrecruiters: smartrecruitersUrl,
  recruitee: recruitee.url,
  workable: workable.url,
  workday: (c: BoardCompany) => workdayUrl(String(c.meta.host), String(c.meta.tenant), String(c.meta.site)),
} as const

interface Adapter<S> {
  shape: { safeParse(v: unknown): { success: true; data: S } | { success: false } }
  url: (c: BoardCompany) => string
  parse: (c: BoardCompany, data: S) => Parsed
}

async function simple<S>(http: Http, c: BoardCompany, scope: string, a: Adapter<S>): Promise<ScopeResult> {
  const res = await http.getJson<unknown>(a.url(c))
  if (!res.ok) return scopeFailed(scope, c.ats, c.id, res.reason)
  const parsed = a.shape.safeParse(res.data)
  if (!parsed.success) return scopeFailed(scope, c.ats, c.id, SHAPE_ERROR)
  const { postings, rejected } = a.parse(c, parsed.data)
  if (tooManyRejected(postings.length, rejected)) return scopeFailed(scope, c.ats, c.id, SHAPE_ERROR)
  const raw = parsed.data as unknown
  const fetched = Array.isArray(raw)
    ? raw.length
    : ((raw as { jobs?: unknown[]; offers?: unknown[] }).jobs ?? (raw as { offers?: unknown[] }).offers ?? []).length
  return scopeOk(scope, c.ats, c.id, fetched, postings)
}

export async function fetchBoard(http: Http, company: BoardCompany): Promise<ScopeResult> {
  const scope = `${company.ats}:${company.token}`
  switch (company.ats) {
    case 'greenhouse':
      return simple(http, company, scope, greenhouse)
    case 'lever':
      return simple(http, company, scope, lever)
    case 'ashby':
      return simple(http, company, scope, ashby)
    case 'recruitee':
      return simple(http, company, scope, recruitee)
    case 'workable':
      return simple(http, company, scope, workable)
    case 'smartrecruiters':
      return fetchSmartRecruiters(http, company, scope)
    case 'workday':
      return fetchWorkday(http, company, scope)
    default:
      return {
        scope,
        source: company.ats,
        companyId: company.id,
        status: 'skipped',
        reason: `no adapter for ${company.ats}`,
        fetched: 0,
        complete: false,
        postings: [],
      }
  }
}
