import { z } from 'zod'
import type { BoardCompany, NormalizedPosting } from '../types'
import { buildPosting, num, periodFrom, rec, str, toDate } from './build'

export const shape = z.looseObject({ jobs: z.array(z.unknown()) })

export const url = (c: BoardCompany) =>
  `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.token)}/jobs?pay_transparency=true`

export function parse(c: BoardCompany, data: z.infer<typeof shape>): NormalizedPosting[] {
  const out: NormalizedPosting[] = []
  for (const item of data.jobs) {
    const r = rec(item)
    const id = r.id !== undefined ? String(r.id) : undefined
    const title = str(r.title)
    if (!id || !title) continue
    const range = rec(Array.isArray(r.pay_input_ranges) ? r.pay_input_ranges[0] : undefined)
    const min = num(range.min_cents) ?? null
    const max = num(range.max_cents) ?? null
    // The API has no reliable unit field on every board; fall back on magnitude (under $500 is hourly).
    const top = max ?? min
    const period = periodFrom(str(range.unit)) ?? (top === null ? null : top < 50_000 ? 'hour' : 'year')
    out.push(
      buildPosting({
        externalId: id,
        company: c.name,
        title,
        locations: str(rec(r.location).name) ? [str(rec(r.location).name)!] : [],
        applyUrl: str(r.absolute_url),
        sourceUrl: str(r.absolute_url),
        postedDate: toDate(r.first_published, 'iso'),
        pay: { min, max, period },
      }),
    )
  }
  return out
}
