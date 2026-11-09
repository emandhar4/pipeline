import { z } from 'zod'
import type { BoardCompany, NormalizedPosting } from '../types'
import type { Parsed } from './build'
import { buildPosting, num, rec, str, toDate } from './build'

export const shape = z.looseObject({ jobs: z.array(z.unknown()) })

export const url = (c: BoardCompany) =>
  `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.token)}/jobs?pay_transparency=true`

export function parse(c: BoardCompany, data: z.infer<typeof shape>): Parsed {
  const out: NormalizedPosting[] = []
  let rejected = 0
  for (const item of data.jobs) {
    const r = rec(item)
    const id = r.id !== undefined ? String(r.id) : undefined
    const title = str(r.title)
    if (!id || !title) {
      rejected++
      continue
    }
    const range = rec(Array.isArray(r.pay_input_ranges) ? r.pay_input_ranges[0] : undefined)
    const currency = str(range.currency_type)
    const usd = !currency || currency.toUpperCase() === 'USD'
    const min = usd ? (num(range.min_cents) ?? null) : null
    const max = usd ? (num(range.max_cents) ?? null) : null
    // The API gives no pay period. Guess from magnitude: a top value under $500 is hourly, else yearly.
    const top = max ?? min
    const period = top === null ? null : top < 50_000 ? 'hour' : 'year'
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
  return { postings: out, rejected }
}
