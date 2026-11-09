import type { Database } from '../lib/database.types'
import type { NormalizedPosting, ScopeResult } from './types'

type RunItemStatus = Database['public']['Enums']['run_item_status']

export type SaveCounts = { found: number; new: number }

/**
 * Splits a scope's postings into the active rows to keep and the inactive rows (which only ever
 * mark an existing source row gone). Early-career roles are kept from every company;
 * experienced/unknown-level roles only when some user watches the company.
 */
export function keptPostings(
  r: ScopeResult,
  keepExperienced: boolean,
): { active: NormalizedPosting[]; inactive: NormalizedPosting[] } {
  const active: NormalizedPosting[] = []
  const inactive: NormalizedPosting[] = []
  for (const p of r.postings) {
    if (!p.active) inactive.push(p)
    else if (keepExperienced || p.level === 'internship' || p.level === 'new_grad') active.push(p)
  }
  return { active, inactive }
}

/**
 * The finder_run_items row for a scope. A capped fetch (status ok, complete false) is recorded as
 * 'skipped' so finish_finder_run never marks its unseen postings gone.
 */
export function runItemRow(
  r: ScopeResult,
  counts: SaveCounts,
): { status: RunItemStatus; error: string | null; fetched: number; found: number; new: number } {
  const base = { fetched: r.fetched, found: counts.found, new: counts.new }
  if (r.status === 'ok' && !r.complete) return { ...base, status: 'skipped', error: `partial: stopped at ${r.fetched} rows` }
  if (r.status === 'ok') return { ...base, status: 'ok', error: null }
  return { ...base, status: r.status, error: r.reason ?? null }
}
