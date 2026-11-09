import type { Http } from './http'
import { keptPostings, runItemRow, type SaveCounts } from './keep'
import { UNCHECKED, resolveCompany } from './resolve'
import { fetchBoard, fetchSimplify } from './sources'
import type { Run, Store, Totals } from './store'
import type { BoardCompany, ScopeResult } from './types'

export type ScopeSummary = { scope: string; source: string; status: string; found: number; new: number; reason?: string }
export type RunSummary = { runId: string | null; totals: Totals; scopes: ScopeSummary[] }

export type RunOptions = {
  trigger: 'manual' | 'schedule' | 'test'
  /** Source names (`simplify`, `greenhouse`, …) or scopes (`simplify:intern`, `greenhouse:<token>`). */
  only?: string[]
  /** Fetch and count only: no run row, no writes, no resolving. */
  dryRun?: boolean
  resolveLimit?: number
}

export type RunDeps = { http: Http; store: Store; log: (line: string) => void }

const BOARD_CONCURRENCY = 6
const RESOLVE_CONCURRENCY = 6
const DEFAULT_RESOLVE_LIMIT = 150
const PROGRESS_EVERY = 250

/** The politeness group of a board: its ATS API host (Workday tenants each have their own host). */
function hostGroup(c: BoardCompany): string {
  return c.ats === 'workday' ? `workday:${String(c.meta.host ?? '')}` : c.ats
}

/** Round-robin across host groups, so no ATS is drained before the next one starts. */
export function interleaveByHost(companies: BoardCompany[]): BoardCompany[] {
  const groups = new Map<string, BoardCompany[]>()
  for (const c of companies) {
    const g = hostGroup(c)
    const list = groups.get(g)
    if (list) list.push(c)
    else groups.set(g, [c])
  }
  const lists = [...groups.values()]
  const out: BoardCompany[] = []
  for (let i = 0; out.length < companies.length; i++) {
    for (const list of lists) if (i < list.length) out.push(list[i])
  }
  return out
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await work(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

function crashed(scope: string, source: string, companyId: string | null, err: unknown): ScopeResult {
  return { scope, source, companyId, status: 'failed', reason: `crashed: ${message(err)}`, fetched: 0, complete: false, postings: [] }
}

type Progress = { done: number; total: number; ok: number; failed: number; skipped: number; found: number; new: number }

/**
 * One finder run: resolve unknown companies, fetch Simplify then every covered board, save,
 * close the run, refresh every user's matches, prune. Logs carry counts, sources, scopes and
 * company names only (the repo and its Actions logs are public).
 */
export async function runFinder(deps: RunDeps, opts: RunOptions): Promise<RunSummary> {
  const { http, store, log } = deps
  const dry = opts.dryRun === true
  const only = opts.only?.length ? new Set(opts.only) : null
  const wanted = (source: string, scope: string) => !only || only.has(source) || only.has(scope)
  const scopes: ScopeSummary[] = []
  const progress = new Map<string, Progress>()

  const run: Run | null = dry ? null : await store.startRun(opts.trigger)
  log(dry ? 'Dry run: nothing is written.' : `Run started (${opts.trigger}).`)

  async function handle(r: ScopeResult, keepExperienced: boolean): Promise<void> {
    let counts: SaveCounts = { found: 0, new: 0 }
    if (r.status === 'ok') {
      if (dry) {
        counts = { found: new Set(keptPostings(r, keepExperienced).active.map((p) => p.externalId)).size, new: 0 }
      } else {
        try {
          counts = await store.savePostings(run!, r, keepExperienced)
        } catch (err) {
          r = { ...r, status: 'failed', reason: `save failed: ${message(err)}`, complete: false, postings: [] }
        }
      }
    }
    if (!dry) await store.recordItem(run!.id, r, counts)
    const item = runItemRow(r, counts)
    scopes.push({ scope: r.scope, source: r.source, status: item.status, found: counts.found, new: counts.new, reason: item.error ?? undefined })

    const p = progress.get(r.source)
    if (p) {
      p.done++
      p[item.status]++
      p.found += counts.found
      p.new += counts.new
      if (p.done % PROGRESS_EVERY === 0 || p.done === p.total) {
        log(`${r.source}: ${p.done}/${p.total} scopes (ok ${p.ok}, failed ${p.failed}, skipped ${p.skipped}), found ${p.found}, new ${p.new}`)
      }
    }
  }

  try {
    if (!dry && !only) await resolvePhase(deps, opts.resolveLimit ?? DEFAULT_RESOLVE_LIMIT)

    for (const kind of ['intern', 'newgrad'] as const) {
      const scope = `simplify:${kind}`
      if (!wanted('simplify', scope)) continue
      const r = await fetchSimplify(http, kind).catch((err) => crashed(scope, 'simplify', null, err))
      await handle(r, false) // Simplify lists early-career roles only
      const s = scopes.at(-1)!
      log(`${scope}: ${s.status}, found ${s.found}, new ${s.new}${s.reason ? ` (${s.reason})` : ''}`)
    }

    const boards = (await store.companiesToFetch()).filter((c) => wanted(c.ats, `${c.ats}:${c.token}`))
    if (only) {
      for (const o of only) {
        if (o.includes(':') && !o.startsWith('simplify:') && !boards.some((c) => `${c.ats}:${c.token}` === o)) {
          log(`${o}: no covered company with that board`)
        }
      }
    }
    if (boards.length) {
      const watched = await store.watchedCompanyIds()
      for (const c of boards) {
        const p = progress.get(c.ats) ?? { done: 0, total: 0, ok: 0, failed: 0, skipped: 0, found: 0, new: 0 }
        p.total++
        progress.set(c.ats, p)
      }
      log(`Boards: ${boards.length} scopes across ${progress.size} sources.`)
      await pool(interleaveByHost(boards), BOARD_CONCURRENCY, async (c) => {
        const scope = `${c.ats}:${c.token}`
        const r = await fetchBoard(http, c).catch((err) => crashed(scope, c.ats, c.id, err))
        await handle(r, watched.has(c.id))
      })
    }

    if (dry) {
      const totals: Totals = {
        found: scopes.reduce((n, s) => n + s.found, 0),
        new: 0,
        seen: 0,
        gone: 0,
        failed_scopes: scopes.filter((s) => s.status === 'failed').length,
      }
      return { runId: null, totals, scopes }
    }

    const totals = await store.finishRun(run!.id)
    log(`Run finished: found ${totals.found}, new ${totals.new}, seen ${totals.seen}, gone ${totals.gone}, failed scopes ${totals.failed_scopes}.`)

    const users = await store.userIdsToMatch()
    let errors = 0
    for (const id of users) {
      try {
        await store.refreshMatches(id)
      } catch {
        errors++ // the error may name the user; log the count only
      }
    }
    log(`Matches refreshed for ${users.length - errors} of ${users.length} users${errors ? ` (${errors} errors)` : ''}.`)

    await store.prune()
    log('Pruned old data.')
    return { runId: run!.id, totals, scopes }
  } catch (err) {
    if (run) await store.failRun(run.id).catch(() => {})
    throw err
  }
}

async function resolvePhase({ http, store, log }: RunDeps, limit: number): Promise<void> {
  const list = await store.companiesToResolve(limit)
  if (!list.length) return
  const tally = { covered: 0, notCovered: 0, retry: 0 }
  await pool(list, RESOLVE_CONCURRENCY, async (c) => {
    const r = await resolveCompany(http, c)
    await store.saveResolution(c.id, r)
    if (!('notCovered' in r)) tally.covered++
    else if (r.notCovered === UNCHECKED) tally.retry++
    else tally.notCovered++
  })
  log(`Resolve: ${list.length} companies checked: covered ${tally.covered}, not covered ${tally.notCovered}, retry next run ${tally.retry}.`)
}
