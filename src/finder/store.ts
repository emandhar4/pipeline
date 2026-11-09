import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../lib/database.types'
import { dedupeKey } from './classify'
import { boardNotFound, keptPostings, runItemRow, stampFor, type SaveCounts } from './keep'
import { UNCHECKED, type ResolveResult } from './resolve'
import type { AtsKind, BoardCompany, NormalizedPosting, ScopeResult } from './types'

export type Totals = { found: number; new: number; seen: number; gone: number; failed_scopes: number }
export type Run = { id: string; startedAt: string }

export type Store = {
  /** Inserts a finder_runs row; startedAt is the row's database timestamp. */
  startRun(trigger: string): Promise<Run>
  /** Marks a still-running run failed (a crash). A finished run is left alone. */
  failRun(runId: string): Promise<void>
  companiesToFetch(): Promise<BoardCompany[]>
  companiesToResolve(limit: number): Promise<{ id: string; name: string; careersUrl: string | null }[]>
  saveResolution(id: string, r: ResolveResult): Promise<void>
  watchedCompanyIds(): Promise<Set<string>>
  savePostings(run: Run, r: ScopeResult, keepExperienced: boolean): Promise<SaveCounts>
  /** Inserts the scope's run item; a board that got HTTP 404 also resets its company to unknown and retires the scope's live source rows. */
  recordItem(runId: string, r: ScopeResult, counts: SaveCounts): Promise<void>
  finishRun(runId: string): Promise<Totals>
  userIdsToMatch(): Promise<string[]>
  refreshMatches(userId: string): Promise<void>
  prune(): Promise<void>
}

/** ATS kinds with a board adapter in src/finder/sources. */
export const FETCHABLE_ATS: AtsKind[] = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'recruitee', 'workable', 'workday']

const PAGE = 1000
const WRITE_BATCH = 500
const KEY_BATCH = 100 // `in` filters travel in the URL; dedupe keys and external ids can be long

type Db = SupabaseClient<Database>
type PostingInsert = Database['public']['Tables']['postings']['Insert']

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** Stored values first, then new ones, without duplicates. */
function union(stored: string[] | null, added: string[]): string[] {
  return [...new Set([...(stored ?? []), ...added])]
}

/** Throws on a query error, else returns the data (null for writes without `.select()`, which callers ignore). */
function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data as T
}

async function allPages<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const rows = must(await page(from, from + PAGE - 1), what) ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/** The posting columns derived from a normalized posting (refreshed on every sighting; terms, field_slugs and level are merged with stored values in upsertPostings). */
function postingColumns(p: NormalizedPosting, key: string, lastSeen: string) {
  return {
    dedupe_key: key,
    company_name: p.company,
    title: p.title,
    locations: p.locations,
    states: p.states,
    countries: p.countries,
    remote: p.remote,
    location_unknown: p.locationUnknown,
    apply_url: p.applyUrl,
    posted_date: p.postedDate,
    pay_min_cents: p.payMinCents,
    pay_max_cents: p.payMaxCents,
    pay_period: p.payPeriod,
    terms: p.terms,
    level: p.level,
    field_slugs: p.fieldSlugs,
    last_seen: lastSeen,
  } satisfies PostingInsert
}

/**
 * The Supabase-backed store (service-role client). `keyPrefix` is prepended to every dedupe key
 * and scopes prune(); production uses '', integration tests use 'test:' to stay in their rows.
 */
export function createSupabaseStore(client: Db, opts: { keyPrefix?: string } = {}): Store {
  const keyPrefix = opts.keyPrefix ?? ''
  // Saves run one at a time: a posting is looked up and then inserted, so two scopes saving
  // the same dedupe key concurrently could otherwise both try to insert it.
  let saveTail: Promise<unknown> = Promise.resolve()

  async function upsertPostings(r: ScopeResult, byKey: Map<string, NormalizedPosting>, lastSeen: string) {
    const ids = new Map<string, string>()
    let inserted = 0
    for (const keys of chunks([...byKey.keys()], KEY_BATCH)) {
      const existing = must(
        await client
          .from('postings')
          .select('id, dedupe_key, status, company_id, level, terms, field_slugs')
          .in('dedupe_key', keys),
        'read postings',
      )
      const known = new Map(existing.map((e) => [e.dedupe_key, e]))
      const fresh: PostingInsert[] = []
      const seenAgain: PostingInsert[] = []
      for (const key of keys) {
        const p = byKey.get(key)!
        const e = known.get(key)
        if (!e) {
          fresh.push({ ...postingColumns(p, key, lastSeen), company_id: r.companyId, first_seen: lastSeen, status: 'new' })
        } else {
          // A posting's facts from every source add up: no sighting erases another's fields, terms or level.
          seenAgain.push({
            ...postingColumns(p, key, lastSeen),
            terms: union(e.terms, p.terms),
            field_slugs: union(e.field_slugs, p.fieldSlugs),
            level: e.level === 'unknown' ? p.level : e.level,
            company_id: r.companyId ?? e.company_id,
            status: e.status === 'gone' ? 'seen' : e.status,
          })
        }
      }
      if (fresh.length) {
        const rows = must(await client.from('postings').insert(fresh).select('id, dedupe_key'), 'insert postings')
        inserted += rows.length
        rows.forEach((x) => ids.set(x.dedupe_key, x.id))
      }
      if (seenAgain.length) {
        const rows = must(
          await client.from('postings').upsert(seenAgain, { onConflict: 'dedupe_key' }).select('id, dedupe_key'),
          'update postings',
        )
        rows.forEach((x) => ids.set(x.dedupe_key, x.id))
      }
    }
    return { ids, inserted }
  }

  /**
   * Sets gone_at on the given live source rows, then marks gone each of their postings left with
   * no live source. Returns how many postings went gone.
   */
  async function retireSources(rows: { id: string; posting_id: string }[], goneAt: string): Promise<number> {
    const affected = new Set<string>()
    for (const batch of chunks(rows, KEY_BATCH)) {
      must(
        await client
          .from('posting_sources')
          .update({ gone_at: goneAt })
          .in(
            'id',
            batch.map((x) => x.id),
          ),
        'mark sources gone',
      )
      batch.forEach((x) => affected.add(x.posting_id))
    }
    let gone = 0
    for (const ids of chunks([...affected], KEY_BATCH)) {
      const live = must(
        await client.from('posting_sources').select('posting_id').in('posting_id', ids).is('gone_at', null),
        'read live sources',
      )
      const alive = new Set(live.map((x) => x.posting_id))
      const dead = ids.filter((id) => !alive.has(id))
      if (dead.length) {
        const flipped = must(
          await client.from('postings').update({ status: 'gone' }).in('id', dead).neq('status', 'gone').select('id'),
          'mark postings gone',
        )
        gone += flipped.length
      }
    }
    return gone
  }

  /**
   * Inactive rows never create anything: an existing live source row of the same scope goes gone,
   * and its posting with it when no live source is left. Returns how many postings went gone.
   * Keyed by scope, not just source: one Simplify id can be live in simplify:intern and inactive in
   * simplify:newgrad (both source 'simplify'), and the other list's flag must not end it.
   */
  async function markInactive(r: ScopeResult, externalIds: string[], goneAt: string): Promise<number> {
    const rows: { id: string; posting_id: string }[] = []
    for (const ext of chunks(externalIds, KEY_BATCH)) {
      rows.push(
        ...must(
          await client
            .from('posting_sources')
            .select('id, posting_id')
            .eq('source', r.source)
            .eq('scope', r.scope)
            .in('external_id', ext)
            .is('gone_at', null),
          'read inactive sources',
        ),
      )
    }
    return rows.length ? retireSources(rows, goneAt) : 0
  }

  /**
   * A board scope that got HTTP 404 is never fetched again (its company goes back to the resolver),
   * so finish_finder_run would never retire it: every live source row of the scope goes gone now,
   * and postings left with no live source with them. A re-resolve to the same token revives them.
   */
  async function retireScope(r: ScopeResult, goneAt: string): Promise<void> {
    const rows = await allPages('read scope sources', (from, to) =>
      client
        .from('posting_sources')
        .select('id, posting_id')
        .eq('source', r.source)
        .eq('scope', r.scope)
        .is('gone_at', null)
        .order('id')
        .range(from, to),
    )
    if (rows.length) await retireSources(rows, goneAt)
  }

  /** Runs `job` after every queued save, so posting/source writes never interleave. */
  function serially<T>(job: () => Promise<T>): Promise<T> {
    const next = saveTail.then(job)
    saveTail = next.catch(() => {})
    return next
  }

  async function savePostingsNow(run: Run, r: ScopeResult, keepExperienced: boolean): Promise<SaveCounts> {
    const { active, inactive } = keptPostings(r, keepExperienced)
    const lastSeen = stampFor(Date.now(), run.startedAt)

    // One source row per external id (last wins); one posting per dedupe key (first wins).
    const bySource = new Map<string, { p: NormalizedPosting; key: string }>()
    for (const p of active) bySource.set(p.externalId, { p, key: keyPrefix + dedupeKey(p) })
    const byKey = new Map<string, NormalizedPosting>()
    for (const { p, key } of bySource.values()) if (!byKey.has(key)) byKey.set(key, p)

    const { ids, inserted } = await upsertPostings(r, byKey, lastSeen)

    const sourceRows = [...bySource.values()].map(({ p, key }) => ({
      posting_id: ids.get(key)!,
      source: r.source,
      external_id: p.externalId,
      scope: r.scope,
      source_url: p.sourceUrl ?? p.applyUrl,
      last_seen: lastSeen,
      gone_at: null,
    }))
    for (const batch of chunks(sourceRows, WRITE_BATCH)) {
      must(
        await client.from('posting_sources').upsert(batch, { onConflict: 'source,external_id' }),
        'upsert posting sources',
      )
    }

    // Inactive ids that are also live in this scope are not gone.
    const liveIds = new Set(bySource.keys())
    const goneIds = [...new Set(inactive.map((p) => p.externalId))].filter((id) => !liveIds.has(id))
    const gone = goneIds.length ? await markInactive(r, goneIds, lastSeen) : 0

    return { found: bySource.size, new: inserted, gone }
  }

  return {
    async startRun(trigger) {
      const res = await client.from('finder_runs').insert({ trigger, status: 'running' }).select('id, started_at').single()
      if (res.error) throw new Error(`start run: ${res.error.message}`)
      return { id: res.data.id, startedAt: res.data.started_at }
    },

    async failRun(runId) {
      must(
        await client
          .from('finder_runs')
          .update({ status: 'failed', finished_at: new Date().toISOString() })
          .eq('id', runId)
          .eq('status', 'running'),
        'fail run',
      )
    },

    async companiesToFetch() {
      const rows = await allPages('read companies', (from, to) =>
        client
          .from('companies')
          .select('id, name, ats, ats_token, ats_meta')
          .eq('coverage', 'covered')
          .in('ats', FETCHABLE_ATS)
          .not('ats_token', 'is', null)
          .order('id')
          .range(from, to),
      )
      const out: BoardCompany[] = []
      for (const c of rows) {
        const meta = (c.ats_meta && typeof c.ats_meta === 'object' && !Array.isArray(c.ats_meta) ? c.ats_meta : {}) as Record<
          string,
          unknown
        >
        if (c.ats === 'workday' && !(meta.host && meta.tenant && meta.site)) continue
        out.push({ id: c.id, name: c.name, ats: c.ats, token: c.ats_token!, meta })
      }
      return out
    },

    async companiesToResolve(limit) {
      if (limit <= 0) return []
      const pick = (watched: boolean, n: number) => {
        const q = client.from('companies').select('id, name, careers_url').eq('coverage', 'unknown')
        return (watched ? q.gt('watchers', 0) : q.eq('watchers', 0)).order('updated_at', { ascending: true }).limit(n)
      }
      const watched = must(await pick(true, limit), 'read companies to resolve')
      const rest = watched.length < limit ? must(await pick(false, limit - watched.length), 'read companies to resolve') : []
      return [...watched, ...rest].map((c) => ({ id: c.id, name: c.name, careersUrl: c.careers_url }))
    },

    async saveResolution(id, r) {
      const now = new Date().toISOString()
      if ('notCovered' in r && r.notCovered === UNCHECKED) {
        // Transient: coverage stays unknown so it is retried, but companiesToResolve orders by
        // updated_at, so touching it (the set_updated_at trigger also sets now()) sends it to the
        // back of the queue instead of letting the same stuck companies fill every run's limit.
        must(
          await client.from('companies').update({ updated_at: now }).eq('id', id).eq('coverage', 'unknown'),
          'touch unresolved company',
        )
        return
      }
      const patch =
        'notCovered' in r
          ? { coverage: 'not_covered' as const, coverage_reason: r.notCovered, resolved_at: now }
          : {
              ats: r.ats,
              ats_token: r.token,
              ats_meta: r.meta as Json,
              coverage: 'covered' as const,
              coverage_reason: null,
              resolved_at: now,
            }
      must(await client.from('companies').update(patch).eq('id', id), 'save resolution')
    },

    async watchedCompanyIds() {
      const rows = await allPages('read watched companies', (from, to) =>
        client.from('companies').select('id').gt('watchers', 0).order('id').range(from, to),
      )
      return new Set(rows.map((r) => r.id))
    },

    savePostings(run, r, keepExperienced) {
      return serially(() => savePostingsNow(run, r, keepExperienced))
    },

    async recordItem(runId, r, counts) {
      must(
        await client.from('finder_run_items').insert({
          run_id: runId,
          source: r.source,
          scope: r.scope,
          company_id: r.companyId,
          ...runItemRow(r, counts),
        }),
        'record run item',
      )
      if (boardNotFound(r)) {
        // The run item stays failed 'HTTP 404'; the resolver re-probes the company by name or careers link.
        // Guarded by ats and token: a company already moved to another board is left alone.
        must(
          await client
            .from('companies')
            .update({
              ats: 'unknown',
              ats_token: null,
              ats_meta: {},
              coverage: 'unknown',
              coverage_reason: null,
              resolved_at: null,
            })
            .eq('id', r.companyId!)
            .eq('ats', r.source as AtsKind)
            .eq('ats_token', r.scope.slice(r.source.length + 1)),
          'reset company',
        )
        await serially(() => retireScope(r, new Date().toISOString()))
      }
    },

    async finishRun(runId) {
      const totals = must(await client.rpc('finish_finder_run', { p_run: runId }), 'finish run')
      return totals as unknown as Totals
    },

    async userIdsToMatch() {
      const rows = await allPages('read profiles', (from, to) =>
        client.from('profiles').select('user_id').order('user_id').range(from, to),
      )
      return rows.map((r) => r.user_id)
    },

    async refreshMatches(userId) {
      // refresh_matches arrives with Task 8's migration; until then the generated types lack it.
      const untyped = client as unknown as SupabaseClient
      must(await untyped.rpc('refresh_matches', { p_user: userId }), 'refresh matches')
    },

    async prune() {
      must(await client.rpc('prune_finder_data', { p_key_prefix: keyPrefix }), 'prune')
    },
  }
}
