import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'

type Db = SupabaseClient<Database>

/** Most score_fit jobs a user can have queued or claimed at once, and the top-N window they come from. */
export const AI_QUEUE_CAP = 15
const PAGE = 100

type Res = { data: unknown; error: { message: string } | null }
/** Throws on a query error, else returns the data (null when a maybeSingle finds no row). */
function must<R extends Res>(res: R, what: string): R['data'] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

/**
 * Queues score_fit jobs for a user whose ai_mode is 'queue'. Candidates are the user's top 15 by
 * base_score among passing, non-hidden, non-gone matches with no ai_score and no job yet; the user
 * never has more than 15 queued or claimed jobs. Returns how many jobs it added.
 */
export async function enqueueScoreFit(db: Db, userId: string): Promise<number> {
  const profile = must(await db.from('profiles').select('ai_mode').eq('user_id', userId).maybeSingle(), 'read ai_mode')
  if (profile?.ai_mode !== 'queue') return 0

  const open = await db
    .from('ai_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'score_fit')
    .in('status', ['queued', 'claimed'])
  if (open.error) throw new Error(`count open jobs: ${open.error.message}`)
  const slots = AI_QUEUE_CAP - (open.count ?? 0)
  if (slots <= 0) return 0

  const jobbed = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const rows = must(
      await db
        .from('ai_jobs')
        .select('posting_id')
        .eq('user_id', userId)
        .eq('kind', 'score_fit')
        .not('posting_id', 'is', null)
        .order('id')
        .range(from, from + 999),
      'read jobs',
    ) ?? []
    for (const r of rows) jobbed.add(r.posting_id!)
    if (rows.length < 1000) break
  }

  // Walk the ranking until 15 candidates are found (postings with a job are skipped, not counted).
  const candidates: string[] = []
  for (let from = 0; candidates.length < AI_QUEUE_CAP; from += PAGE) {
    const rows = must(
      await db
        .from('posting_matches')
        .select('posting_id, postings!inner(status)')
        .eq('user_id', userId)
        .eq('passed_filter', true)
        .neq('state', 'hidden')
        .neq('bar_verdict', 'does_not_beat')
        .is('ai_score', null)
        .neq('postings.status', 'gone')
        .order('base_score', { ascending: false, nullsFirst: false })
        .order('posting_id')
        .range(from, from + PAGE - 1),
      'read matches',
    ) ?? []
    for (const r of rows) {
      if (!jobbed.has(r.posting_id) && candidates.length < AI_QUEUE_CAP) candidates.push(r.posting_id)
    }
    if (rows.length < PAGE) break
  }

  const picked = candidates.slice(0, slots)
  if (!picked.length) return 0
  const inserted = must(
    await db
      .from('ai_jobs')
      .upsert(
        picked.map((posting_id) => ({ user_id: userId, kind: 'score_fit' as const, posting_id })),
        { onConflict: 'user_id,kind,posting_id', ignoreDuplicates: true },
      )
      .select('id'),
    'queue jobs',
  ) ?? []
  return inserted.length
}
