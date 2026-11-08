import type { Database } from '../database.types'
import { normalizeCompany } from './normalize'

type AtsKind = Database['public']['Enums']['ats_kind']

export type ParsedBoard = { ats: AtsKind; token: string; meta: Record<string, unknown> }

const TOKEN_RE = /^[A-Za-z0-9_.-]+$/
const LOCALE_RE = /^[a-z]{2}(-[a-z]{2})?$/i
const WORKDAY_HOST_RE = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/i

const board = (ats: AtsKind, token: string | undefined, meta: Record<string, unknown> = {}): ParsedBoard | null =>
  token && TOKEN_RE.test(token) ? { ats, token, meta } : null

/** Recognizes careers BOARD urls of the supported ATSs (not individual job urls). Pure; https only. */
export function parseCareersUrl(url: string): ParsedBoard | null {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  const seg = u.pathname.split('/').filter(Boolean)

  switch (host) {
    case 'boards.greenhouse.io':
    case 'job-boards.greenhouse.io':
      return board('greenhouse', seg[0])
    case 'jobs.lever.co':
      return board('lever', seg[0])
    case 'jobs.eu.lever.co':
      return board('lever', seg[0], { region: 'eu' })
    case 'jobs.ashbyhq.com':
      return board('ashby', seg[0])
    case 'careers.smartrecruiters.com':
      return board('smartrecruiters', seg[0])
    case 'apply.workable.com':
      return board('workable', seg[0])
  }

  if (host.endsWith('.recruitee.com')) {
    const sub = host.slice(0, -'.recruitee.com'.length)
    return sub === 'www' || sub.includes('.') ? null : board('recruitee', sub)
  }

  const wd = WORKDAY_HOST_RE.exec(host)
  if (wd) {
    const rest = [...seg]
    if (rest[0] && LOCALE_RE.test(rest[0])) rest.shift()
    const tenant = wd[1]
    const site = rest[0]
    return site && TOKEN_RE.test(site) ? { ats: 'workday', token: tenant, meta: { host, tenant, site } } : null
  }
  return null
}

/** Up to 3 distinct board-slug guesses: compact, hyphenated, first word. */
export function slugCandidates(name: string): string[] {
  const words = normalizeCompany(name).split(' ').filter(Boolean)
  if (words.length === 0) return []
  return [...new Set([words.join(''), words.join('-'), words[0]])]
}
