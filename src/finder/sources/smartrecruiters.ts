import { z } from 'zod'
import { countryName } from '../../lib/onboarding/regions'
import type { Http } from '../http'
import type { BoardCompany, NormalizedPosting, ScopeResult } from '../types'
import { SHAPE_ERROR, buildPosting, num, rec, scopeFailed, scopeOk, str, toDate } from './build'

const shape = z.looseObject({ content: z.array(z.unknown()), totalFound: z.number().optional() })

const PAGE = 100
const MAX_PAGES = 10

export const url = (c: BoardCompany, offset = 0) =>
  `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(c.token)}/postings?limit=${PAGE}&offset=${offset}`

function toPosting(c: BoardCompany, item: unknown): NormalizedPosting | null {
  const r = rec(item)
  const id = str(r.id)
  const title = str(r.name)
  if (!id || !title) return null
  const loc = rec(r.location)
  const code = str(loc.country)?.toUpperCase()
  const country = code ? countryName(code) : undefined
  const place = [str(loc.city), str(loc.region), country].filter((x): x is string => !!x).join(', ')
  return buildPosting({
    externalId: id,
    company: c.name,
    title,
    locations: place ? [place] : [],
    remoteFlag: loc.hybrid === true ? 'hybrid' : loc.remote === true ? 'remote' : null,
    applyUrl: `https://jobs.smartrecruiters.com/${encodeURIComponent(c.token)}/${encodeURIComponent(id)}`,
    sourceUrl: null,
    postedDate: toDate(r.releasedDate, 'iso'),
    levelHints: { employmentType: str(rec(r.typeOfEmployment).label) },
  })
}

export async function fetchSmartRecruiters(http: Http, c: BoardCompany, scope: string): Promise<ScopeResult> {
  const postings: NormalizedPosting[] = []
  let fetched = 0
  let total = Infinity
  for (let page = 0; page < MAX_PAGES && fetched < total; page++) {
    const res = await http.getJson<unknown>(url(c, page * PAGE))
    if (!res.ok) return scopeFailed(scope, 'smartrecruiters', c.id, res.reason)
    const parsed = shape.safeParse(res.data)
    if (!parsed.success) return scopeFailed(scope, 'smartrecruiters', c.id, SHAPE_ERROR)
    total = num(parsed.data.totalFound) ?? parsed.data.content.length
    fetched += parsed.data.content.length
    for (const item of parsed.data.content) {
      const p = toPosting(c, item)
      if (p) postings.push(p)
    }
    if (parsed.data.content.length === 0) break
  }
  return scopeOk(scope, 'smartrecruiters', c.id, fetched, postings)
}
