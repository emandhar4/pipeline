import { z } from 'zod'
import type { Http } from '../http'
import type { BoardCompany, NormalizedPosting, ScopeResult } from '../types'
import { SHAPE_ERROR, buildPosting, rec, scopeFailed, scopeOk, str } from './build'

const shape = z.looseObject({ jobPostings: z.array(z.unknown()) })

const PAGE = 20
const MAX_PAGES = 3
const SEARCHES = ['intern', 'graduate']
const DAY_MS = 86_400_000

const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.myworkdayjobs\.com$/i
const SEG_RE = /^[A-Za-z0-9_.-]+$/

export const url = (host: string, tenant: string, site: string) =>
  `https://${host}/wday/cxs/${tenant}/${site}/jobs`

/** "Posted Today", "Posted Yesterday", "Posted 26 Days Ago", "Posted 30+ Days Ago" to YYYY-MM-DD. */
export function postedOnToDate(text: string | undefined, nowMs: number): string | null {
  if (!text) return null
  let days: number | null = null
  if (/today/i.test(text)) days = 0
  else if (/yesterday/i.test(text)) days = 1
  else {
    const m = /(\d+)\+?\s*days?\s*ago/i.exec(text)
    if (m) days = /\+/.test(text) ? 30 : Number(m[1])
  }
  if (days === null) return null
  return new Date(nowMs - days * DAY_MS).toISOString().slice(0, 10)
}

export async function fetchWorkday(http: Http, c: BoardCompany, scope: string): Promise<ScopeResult> {
  const host = str(c.meta.host)
  const tenant = str(c.meta.tenant)
  const site = str(c.meta.site)
  if (!host || !tenant || !site || !HOST_RE.test(host) || !SEG_RE.test(tenant) || !SEG_RE.test(site)) {
    return scopeFailed(scope, 'workday', c.id, 'missing or invalid workday meta (host, tenant, site)')
  }
  const endpoint = url(host, tenant, site)
  if (!(await http.robotsAllows(endpoint))) {
    return { scope, source: 'workday', companyId: c.id, status: 'skipped', reason: 'robots.txt disallows', fetched: 0, postings: [] }
  }
  const seen = new Set<string>()
  const postings: NormalizedPosting[] = []
  let fetched = 0
  for (const searchText of SEARCHES) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await http.postJson<unknown>(endpoint, { appliedFacets: {}, limit: PAGE, offset: page * PAGE, searchText })
      if (!res.ok) return scopeFailed(scope, 'workday', c.id, res.reason)
      const parsed = shape.safeParse(res.data)
      if (!parsed.success) return scopeFailed(scope, 'workday', c.id, SHAPE_ERROR)
      const rows = parsed.data.jobPostings
      fetched += rows.length
      for (const item of rows) {
        const r = rec(item)
        const path = str(r.externalPath)
        const title = str(r.title)
        if (!path || !title || seen.has(path)) continue
        seen.add(path)
        const applyUrl = `https://${host}/en-US/${site}${path}`
        postings.push(
          buildPosting({
            externalId: path,
            company: c.name,
            title,
            locations: str(r.locationsText) ? [str(r.locationsText)!] : [],
            applyUrl,
            sourceUrl: applyUrl,
            postedDate: postedOnToDate(str(r.postedOn), http.now()),
          }),
        )
      }
      if (rows.length < PAGE) break
    }
  }
  return scopeOk(scope, 'workday', c.id, fetched, postings)
}
