import { z } from 'zod'
import type { BoardCompany, NormalizedPosting } from '../types'
import type { Parsed } from './build'
import { buildPosting, cents, num, periodFrom, rec, str, strs, toDate } from './build'

export const shape = z.array(z.unknown())

export const url = (c: BoardCompany) =>
  `https://${c.meta.region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co'}/v0/postings/${encodeURIComponent(c.token)}?mode=json`

export function parse(c: BoardCompany, data: unknown[]): Parsed {
  const out: NormalizedPosting[] = []
  let rejected = 0
  for (const item of data) {
    const r = rec(item)
    const id = str(r.id)
    const title = str(r.text)
    if (!id || !title) {
      rejected++
      continue
    }
    const cat = rec(r.categories)
    const locations = [...new Set([str(cat.location), ...strs(cat.allLocations)].filter((x): x is string => !!x))]
    const wt = str(r.workplaceType)?.toLowerCase()
    const sal = rec(r.salaryRange)
    const hasSal = num(sal.min) !== undefined || num(sal.max) !== undefined
    const usd = !str(sal.currency) || str(sal.currency)!.toUpperCase() === 'USD'
    out.push(
      buildPosting({
        externalId: id,
        company: c.name,
        title,
        locations,
        remoteFlag: wt === 'remote' ? 'remote' : wt === 'hybrid' ? 'hybrid' : null,
        applyUrl: str(r.hostedUrl) ?? str(r.applyUrl),
        sourceUrl: str(r.hostedUrl),
        postedDate: toDate(num(r.createdAt), 'ms'),
        pay: hasSal && usd
          ? { min: cents(num(sal.min)), max: cents(num(sal.max)), period: periodFrom(str(sal.interval)) }
          : undefined,
        levelHints: { commitment: str(cat.commitment) },
      }),
    )
  }
  return { postings: out, rejected }
}
