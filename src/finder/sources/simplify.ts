import { z } from 'zod'
import { termsFromText } from '../classify'
import type { Http } from '../http'
import type { ScopeResult } from '../types'
import { SHAPE_ERROR, buildPosting, num, rec, scopeFailed, scopeOk, str, strs, toDate } from './build'
import type { PostingInput } from './build'

const REPOS = {
  intern: 'SimplifyJobs/Summer2027-Internships',
  newgrad: 'SimplifyJobs/New-Grad-Positions',
} as const

export const simplifyUrl = (kind: 'intern' | 'newgrad') =>
  `https://raw.githubusercontent.com/${REPOS[kind]}/dev/.github/scripts/listings.json`

const shape = z.array(z.unknown())

function normalizeTerms(raw: string[], title: string): string[] {
  const out = new Set<string>()
  for (const t of raw) {
    const parsed = termsFromText(t)
    if (parsed.length) parsed.forEach((p) => out.add(p))
    else if (!/^n\/?a$/i.test(t)) out.add(t)
  }
  if (out.size === 0) termsFromText(title).forEach((p) => out.add(p))
  return [...out]
}

export async function fetchSimplify(http: Http, kind: 'intern' | 'newgrad'): Promise<ScopeResult> {
  const scope = `simplify:${kind}`
  const res = await http.getJson<unknown>(simplifyUrl(kind))
  if (!res.ok) return scopeFailed(scope, 'simplify', null, res.reason)
  const parsed = shape.safeParse(res.data)
  if (!parsed.success) return scopeFailed(scope, 'simplify', null, SHAPE_ERROR)

  const postings = []
  for (const item of parsed.data) {
    const r = rec(item)
    const id = str(r.id)
    const title = str(r.title)
    const company = str(r.company_name)
    if (!id || !title || !company) continue
    const live = r.active !== false && r.is_visible !== false
    const input: PostingInput = {
      externalId: id,
      company,
      title,
      locations: strs(r.locations),
      applyUrl: str(r.url) ?? null,
      postedDate: toDate(num(r.date_posted), 's'),
      terms: normalizeTerms(strs(r.terms), title),
      levelHints: { simplify: kind },
      category: str(r.category),
      active: live,
    }
    postings.push(buildPosting(input))
  }
  return scopeOk(scope, 'simplify', null, parsed.data.length, postings)
}
