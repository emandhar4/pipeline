import { z } from 'zod'
import type { BoardCompany, NormalizedPosting } from '../types'
import type { Parsed } from './build'
import { buildPosting, cents, num, periodFrom, rec, str, toDate } from './build'

export const shape = z.looseObject({ jobs: z.array(z.unknown()) })

export const url = (c: BoardCompany) =>
  `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.token)}?includeCompensation=true`

export function parse(c: BoardCompany, data: z.infer<typeof shape>): Parsed {
  const out: NormalizedPosting[] = []
  let rejected = 0
  for (const item of data.jobs) {
    const r = rec(item)
    if (r.isListed === false) continue
    const id = str(r.id)
    const title = str(r.title)
    if (!id || !title) {
      rejected++
      continue
    }
    const secondary = Array.isArray(r.secondaryLocations)
      ? r.secondaryLocations.map((s) => str(s) ?? str(rec(s).location))
      : []
    const locations = [...new Set([str(r.location), ...secondary].filter((x): x is string => !!x))]
    const wt = str(r.workplaceType)?.toLowerCase()
    const remoteFlag = r.isRemote === true || wt === 'remote' ? 'remote' : wt === 'hybrid' ? 'hybrid' : null
    const comps = Array.isArray(rec(r.compensation).summaryComponents) ? (rec(r.compensation).summaryComponents as unknown[]) : []
    const salary = comps.map(rec).find((x) => str(x.compensationType)?.toLowerCase() === 'salary' && (!str(x.currencyCode) || str(x.currencyCode) === 'USD'))
    out.push(
      buildPosting({
        externalId: id,
        company: c.name,
        title,
        locations,
        remoteFlag,
        applyUrl: str(r.applyUrl) ?? str(r.jobUrl),
        sourceUrl: str(r.jobUrl),
        postedDate: toDate(r.publishedAt, 'iso'),
        pay: salary
          ? { min: cents(num(salary.minValue)), max: cents(num(salary.maxValue)), period: periodFrom(str(salary.interval)) }
          : undefined,
        levelHints: { employmentType: str(r.employmentType) },
      }),
    )
  }
  return { postings: out, rejected }
}
