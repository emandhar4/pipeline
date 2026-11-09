import { parseCareersUrl, slugCandidates, type ParsedBoard } from '../lib/companies/careers-url'
import type { Http } from './http'
import { fetchBoard } from './sources'
import type { AtsKind, BoardCompany } from './types'

export type Resolved = ParsedBoard
export type ResolveResult = Resolved | { notCovered: string }

const NO_BOARD = 'No public job board found from the name. Add its careers page link.'
const UNREADABLE = "That careers link uses a site Pipeline can't read yet."
export const UNCHECKED = 'Could not check its job board this run.'

const PROBE_ORDER: AtsKind[] = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'recruitee', 'workable']

type Probe = { kind: 'ok'; jobs: number } | { kind: 'absent' } | { kind: 'transient' }

/** One full board fetch. A client error or a non-board response means "absent"; timeouts, 5xx and 429 are transient. */
async function probe(http: Http, name: string, r: Resolved): Promise<Probe> {
  const company: BoardCompany = { id: 'resolve', name, ats: r.ats, token: r.token, meta: r.meta }
  try {
    const res = await fetchBoard(http, company)
    if (res.status === 'ok') return { kind: 'ok', jobs: res.postings.length }
    const reason = res.reason ?? ''
    if (res.status === 'skipped') return { kind: 'absent' }
    if (/^HTTP (403|408|429)\b/.test(reason)) return { kind: 'transient' } // bot blocks, timeouts, rate limits
    if (/^HTTP 4\d\d/.test(reason)) return { kind: 'absent' }
    if (/^HTTP \d{3}|timeout|network error/.test(reason)) return { kind: 'transient' }
    return { kind: 'absent' } // unexpected shape, invalid JSON, invalid URL: not a readable board
  } catch {
    return { kind: 'transient' }
  }
}

/**
 * Finds the ATS board for a company, from a careers link when given, else by probing slug guesses.
 * Never throws. Note: fetchBoard postings carry the company name we passed in, not one from the API,
 * so no API-name check is possible; a non-empty board is the evidence.
 */
export async function resolveCompany(
  http: Http,
  c: { name: string; careersUrl: string | null },
): Promise<ResolveResult> {
  if (c.careersUrl) {
    const parsed = parseCareersUrl(c.careersUrl)
    if (!parsed) return { notCovered: UNREADABLE }
    const p = await probe(http, c.name, parsed)
    if (p.kind === 'ok') return parsed // an empty board is valid when the user gave the link
    return { notCovered: p.kind === 'transient' ? UNCHECKED : UNREADABLE }
  }

  let transient = 0
  for (const token of slugCandidates(c.name)) {
    for (const ats of PROBE_ORDER) {
      const candidate: Resolved = { ats, token, meta: {} }
      const p = await probe(http, c.name, candidate)
      if (p.kind === 'ok' && p.jobs >= 1) return candidate
      if (p.kind === 'transient') transient++
    }
  }
  // Any transient failure without a hit means we can't say there is no board: leave it for the next run.
  if (transient > 0) return { notCovered: UNCHECKED }
  return { notCovered: NO_BOARD }
}
