import type { Database } from '../lib/database.types'
import type { JobLevel, RemoteKind } from './classify'

export type AtsKind = Database['public']['Enums']['ats_kind']

export type NormalizedPosting = {
  externalId: string
  company: string
  title: string
  locations: string[]
  states: string[]
  countries: string[]
  remote: RemoteKind
  locationUnknown: boolean
  applyUrl: string | null
  sourceUrl: string | null
  postedDate: string | null // YYYY-MM-DD
  payMinCents: number | null
  payMaxCents: number | null
  payPeriod: 'hour' | 'year' | null
  terms: string[]
  level: JobLevel
  fieldSlugs: string[]
  active: boolean
}

export type ScopeResult = {
  scope: string
  source: string
  companyId: string | null
  status: 'ok' | 'failed' | 'skipped'
  reason?: string
  fetched: number
  postings: NormalizedPosting[]
}

export type BoardCompany = {
  id: string
  name: string
  ats: AtsKind
  token: string
  meta: Record<string, unknown>
}
