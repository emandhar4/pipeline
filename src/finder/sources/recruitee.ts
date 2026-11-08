import { z } from 'zod'
import type { BoardCompany, NormalizedPosting } from '../types'
import { buildPosting, cents, num, periodFrom, rec, str, toDate } from './build'

export const shape = z.looseObject({ offers: z.array(z.unknown()) })

export const url = (c: BoardCompany) => `https://${encodeURIComponent(c.token)}.recruitee.com/api/offers/`

export function parse(c: BoardCompany, data: z.infer<typeof shape>): NormalizedPosting[] {
  const out: NormalizedPosting[] = []
  for (const item of data.offers) {
    const r = rec(item)
    const status = str(r.status)
    if (status && status !== 'published') continue
    const id = r.id !== undefined ? String(r.id) : undefined
    const title = str(r.title)
    if (!id || !title) continue
    const locs = Array.isArray(r.locations) ? r.locations.map((l) => str(rec(l).location) ?? str(rec(l).name)) : []
    const locations = [...new Set([str(r.location), ...locs].filter((x): x is string => !!x))]
    const sal = rec(r.salary)
    const hasSal = num(sal.min) !== undefined || num(sal.max) !== undefined
    const usd = !str(sal.currency) || str(sal.currency)!.toUpperCase() === 'USD'
    out.push(
      buildPosting({
        externalId: id,
        company: c.name,
        title,
        locations,
        remoteFlag: r.hybrid === true ? 'hybrid' : r.remote === true ? 'remote' : null,
        applyUrl: str(r.careers_apply_url) ?? str(r.careers_url),
        sourceUrl: str(r.careers_url),
        postedDate: toDate(r.published_at ?? r.created_at, 'iso'),
        pay: hasSal && usd ? { min: cents(num(sal.min)), max: cents(num(sal.max)), period: periodFrom(str(sal.period)) } : undefined,
        levelHints: { employmentType: str(r.employment_type_code) },
      }),
    )
  }
  return out
}
