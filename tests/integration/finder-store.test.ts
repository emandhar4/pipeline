import { afterAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { UNCHECKED } from '@/finder/resolve'
import { createSupabaseStore, type Run } from '@/finder/store'
import type { NormalizedPosting, ScopeResult } from '@/finder/types'
import { adminClient } from './helpers'

// Test rows only: dedupe keys get the 'test:' prefix from the store option, source rows use
// source 'test', runs use trigger 'test'. Everything created here is deleted in afterAll.
describe('finder store', () => {
  const admin = adminClient()
  const store = createSupabaseStore(admin, { keyPrefix: 'test:' })
  const suffix = randomBytes(4).toString('hex')
  const board = `teststore${suffix}`
  const runIds: string[] = []
  const companyIds: string[] = []
  let run: Run

  afterAll(async () => {
    // posting_sources cascade from postings; run items from runs.
    await admin.from('postings').delete().like('dedupe_key', `test:%${suffix}%`)
    if (runIds.length) await admin.from('finder_runs').delete().in('id', runIds)
    if (companyIds.length) await admin.from('companies').delete().in('id', companyIds)
  })

  function posting(over: Partial<NormalizedPosting>): NormalizedPosting {
    return {
      externalId: `x-${suffix}`,
      company: 'Test Store Co',
      title: 'Software Engineering Intern',
      locations: ['Boston, MA'],
      states: ['MA'],
      countries: ['US'],
      remote: 'onsite',
      locationUnknown: false,
      applyUrl: null,
      sourceUrl: null,
      postedDate: '2026-11-01',
      payMinCents: null,
      payMaxCents: null,
      payPeriod: null,
      terms: ['Summer 2027'],
      level: 'internship',
      fieldSlugs: ['software-engineering'],
      active: true,
      ...over,
    }
  }

  function scope(name: string, postings: NormalizedPosting[]): ScopeResult {
    return { scope: name, source: 'test', companyId: null, status: 'ok', fetched: postings.length, complete: true, postings }
  }

  async function sourcesFor(key: string) {
    const p = await admin.from('postings').select('id, status, first_seen, last_seen').eq('dedupe_key', key).maybeSingle()
    expect(p.error).toBeNull()
    if (!p.data) return { posting: null, sources: [] }
    const s = await admin.from('posting_sources').select('scope, source, external_id, gone_at').eq('posting_id', p.data.id)
    expect(s.error).toBeNull()
    return { posting: p.data, sources: s.data! }
  }

  it('starts a test run stamped by the database', async () => {
    run = await store.startRun('test')
    runIds.push(run.id)
    expect(run.id).toMatch(/[0-9a-f-]{36}/)
    expect(Number.isNaN(Date.parse(run.startedAt))).toBe(false)
  })

  it('the same job from Simplify and its Greenhouse board is one posting with two source rows', async () => {
    const fromSimplify = posting({
      externalId: `simplify-1-${suffix}`,
      applyUrl: `https://boards.greenhouse.io/${board}/jobs/4001?gh_src=simplify&utm_source=x`,
    })
    const fromBoard = posting({
      externalId: `gh-4001-${suffix}`,
      applyUrl: `https://job-boards.greenhouse.io/${board}/jobs/4001`,
    })
    const a = await store.savePostings(run, scope('test:simplify', [fromSimplify]), false)
    const b = await store.savePostings(run, scope('test:greenhouse', [fromBoard]), false)
    expect(a).toEqual({ found: 1, new: 1, gone: 0 })
    expect(b).toEqual({ found: 1, new: 0, gone: 0 })

    const { posting: row, sources } = await sourcesFor(`test:greenhouse:${board}:4001`)
    expect(row).not.toBeNull()
    expect(row!.status).toBe('new')
    expect(Date.parse(row!.last_seen)).toBeGreaterThanOrEqual(Date.parse(run.startedAt))
    expect(sources.map((s) => s.scope).sort()).toEqual(['test:greenhouse', 'test:simplify'])
    expect(sources.every((s) => s.gone_at === null)).toBe(true)
  })

  it('an experienced posting is dropped unless the company is watched', async () => {
    const exp = posting({
      externalId: `exp-1-${suffix}`,
      title: 'Senior Software Engineer',
      level: 'experienced',
      applyUrl: `https://boards.greenhouse.io/${board}/jobs/5001`,
    })
    const key = `test:greenhouse:${board}:5001`
    expect(await store.savePostings(run, scope('test:greenhouse', [exp]), false)).toEqual({ found: 0, new: 0, gone: 0 })
    expect((await sourcesFor(key)).posting).toBeNull()

    expect(await store.savePostings(run, scope('test:greenhouse', [exp]), true)).toEqual({ found: 1, new: 1, gone: 0 })
    expect((await sourcesFor(key)).posting).not.toBeNull()
  })

  it('a second save of a gone posting brings it back to seen', async () => {
    const p = posting({ externalId: `back-1-${suffix}`, applyUrl: `https://boards.greenhouse.io/${board}/jobs/6001` })
    const key = `test:greenhouse:${board}:6001`
    await store.savePostings(run, scope('test:greenhouse', [p]), false)
    const before = await sourcesFor(key)
    const gone = await admin.from('postings').update({ status: 'gone' }).eq('id', before.posting!.id)
    expect(gone.error).toBeNull()
    const src = await admin
      .from('posting_sources')
      .update({ gone_at: new Date().toISOString() })
      .eq('source', 'test')
      .eq('external_id', p.externalId)
    expect(src.error).toBeNull()

    expect(await store.savePostings(run, scope('test:greenhouse', [p]), false)).toEqual({ found: 1, new: 0, gone: 0 })
    const after = await sourcesFor(key)
    expect(after.posting!.status).toBe('seen')
    expect(after.posting!.first_seen).toBe(before.posting!.first_seen)
    expect(after.sources[0].gone_at).toBeNull()
  })

  it('an inactive row is never inserted, and an existing one only goes gone', async () => {
    const fresh = posting({ externalId: `inactive-new-${suffix}`, applyUrl: `https://boards.greenhouse.io/${board}/jobs/7001`, active: false })
    expect(await store.savePostings(run, scope('test:simplify', [fresh]), false)).toEqual({ found: 0, new: 0, gone: 0 })
    expect((await sourcesFor(`test:greenhouse:${board}:7001`)).posting).toBeNull()

    const live = posting({ externalId: `inactive-old-${suffix}`, applyUrl: `https://boards.greenhouse.io/${board}/jobs/7002` })
    await store.savePostings(run, scope('test:simplify', [live]), false)
    expect(await store.savePostings(run, scope('test:simplify', [{ ...live, active: false }]), false)).toEqual({ found: 0, new: 0, gone: 1 })
    const after = await sourcesFor(`test:greenhouse:${board}:7002`)
    expect(after.sources).toHaveLength(1)
    expect(after.sources[0].gone_at).not.toBeNull()
    expect(after.posting!.status).toBe('gone')
  })

  it('an inactive row in another scope of the same source leaves a live row alone', async () => {
    const live = posting({ externalId: `cross-scope-${suffix}`, applyUrl: `https://boards.greenhouse.io/${board}/jobs/7101` })
    await store.savePostings(run, scope('test:simplify-intern', [live]), false)
    expect(await store.savePostings(run, scope('test:simplify-newgrad', [{ ...live, active: false }]), false)).toEqual({
      found: 0,
      new: 0,
      gone: 0,
    })
    const after = await sourcesFor(`test:greenhouse:${board}:7101`)
    expect(after.sources).toEqual([{ scope: 'test:simplify-intern', source: 'test', external_id: live.externalId, gone_at: null }])
    expect(after.posting!.status).toBe('new')
  })

  it('records run items, a partial scope as skipped', async () => {
    const r: ScopeResult = { ...scope('test:partial', []), fetched: 1000, complete: false }
    await store.recordItem(run.id, r, { found: 3, new: 1, gone: 0 })
    const items = await admin.from('finder_run_items').select('scope, status, error, found, new').eq('run_id', run.id)
    expect(items.error).toBeNull()
    expect(items.data).toEqual([{ scope: 'test:partial', status: 'skipped', error: 'partial: stopped at 1000 rows', found: 3, new: 1 }])
  })

  it('a board that got HTTP 404 resets its company to unknown', async () => {
    const co = await admin
      .from('companies')
      .insert({
        name: `Test Gone Board ${suffix}`,
        normalized_name: `test-gone-board-${suffix}`,
        ats: 'greenhouse',
        ats_token: `testgone${suffix}`,
        ats_meta: { a: 1 },
        coverage: 'covered',
        resolved_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(co.error).toBeNull()
    companyIds.push(co.data!.id)
    const r: ScopeResult = {
      ...scope(`greenhouse:testgone${suffix}`, []),
      source: 'greenhouse',
      companyId: co.data!.id,
      status: 'failed',
      reason: 'HTTP 404',
      complete: false,
    }
    await store.recordItem(run.id, r, { found: 0, new: 0, gone: 0 })
    const row = await admin
      .from('companies')
      .select('ats, ats_token, ats_meta, coverage, coverage_reason, resolved_at')
      .eq('id', co.data!.id)
      .single()
    expect(row.data).toEqual({ ats: 'unknown', ats_token: null, ats_meta: {}, coverage: 'unknown', coverage_reason: null, resolved_at: null })
    const item = await admin.from('finder_run_items').select('status, error').eq('run_id', run.id).eq('company_id', co.data!.id).single()
    expect(item.data).toEqual({ status: 'failed', error: 'HTTP 404' })
  })

  it('a transient resolve result keeps the company unknown and moves its updated_at forward', async () => {
    const old = '2026-01-01T00:00:00+00:00'
    const co = await admin
      .from('companies')
      .insert({ name: `Test Transient ${suffix}`, normalized_name: `test-transient-${suffix}`, updated_at: old })
      .select('id, updated_at')
      .single()
    expect(co.error).toBeNull()
    companyIds.push(co.data!.id)
    expect(Date.parse(co.data!.updated_at)).toBe(Date.parse(old))

    await store.saveResolution(co.data!.id, { notCovered: UNCHECKED })
    const row = await admin.from('companies').select('coverage, coverage_reason, resolved_at, updated_at').eq('id', co.data!.id).single()
    expect(row.data).toMatchObject({ coverage: 'unknown', coverage_reason: null, resolved_at: null })
    expect(Date.parse(row.data!.updated_at)).toBeGreaterThan(Date.parse(old))
  })

  it('failRun marks a running run failed', async () => {
    const r2 = await store.startRun('test')
    runIds.push(r2.id)
    await store.failRun(r2.id)
    const row = await admin.from('finder_runs').select('status, finished_at').eq('id', r2.id).single()
    expect(row.data).toMatchObject({ status: 'failed' })
    expect(row.data!.finished_at).not.toBeNull()
  })
})
