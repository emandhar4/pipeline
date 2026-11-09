import { z } from 'zod'
import type { BoardCompany, NormalizedPosting } from '../types'
import type { Parsed } from './build'
import { buildPosting, rec, str, toDate } from './build'

export const shape = z.looseObject({ jobs: z.array(z.unknown()) })

export const url = (c: BoardCompany) =>
  `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(c.token)}`

const place = (r: Record<string, unknown>) =>
  [str(r.city), str(r.state) ?? str(r.region), str(r.country)].filter((x): x is string => !!x).join(', ')

export function parse(c: BoardCompany, data: z.infer<typeof shape>): Parsed {
  const out: NormalizedPosting[] = []
  let rejected = 0
  for (const item of data.jobs) {
    const r = rec(item)
    const id = str(r.shortcode)
    const title = str(r.title)
    if (!id || !title) {
      rejected++
      continue
    }
    const many = Array.isArray(r.locations) ? r.locations.map((l) => place(rec(l))) : []
    const locations = [...new Set([place(r), ...many].filter(Boolean))]
    out.push(
      buildPosting({
        externalId: id,
        company: c.name,
        title,
        locations,
        remoteFlag: r.telecommuting === true ? 'remote' : null,
        applyUrl: str(r.application_url) ?? str(r.url),
        sourceUrl: str(r.url) ?? str(r.shortlink),
        postedDate: toDate(r.published_on ?? r.created_at, 'iso'),
        levelHints: { employmentType: str(r.employment_type) },
      }),
    )
  }
  return { postings: out, rejected }
}
