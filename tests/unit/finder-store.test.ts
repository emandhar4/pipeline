import { describe, expect, it } from 'vitest'
import { createSupabaseStore, type Run } from '@/finder/store'
import type { NormalizedPosting, ScopeResult } from '@/finder/types'
import { fakeSupabase, type Tables } from './fake-supabase'

const RUN: Run = { id: 'run-1', startedAt: '2026-11-09T03:17:00.000Z' }

function posting(over: Partial<NormalizedPosting>): NormalizedPosting {
  return {
    externalId: 'x',
    company: 'Acme Robotics',
    title: 'Software Engineering Intern',
    locations: ['Boston, MA'],
    states: ['MA'],
    countries: ['US'],
    remote: 'onsite',
    locationUnknown: false,
    applyUrl: 'https://boards.greenhouse.io/acme/jobs/4001',
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

function simplify(kind: 'intern' | 'newgrad', postings: NormalizedPosting[]): ScopeResult {
  return { scope: `simplify:${kind}`, source: 'simplify', companyId: null, status: 'ok', fetched: postings.length, complete: true, postings }
}

describe('store: Simplify inactive rows', () => {
  it('a listing live in simplify:intern and inactive in simplify:newgrad does not end the run gone', async () => {
    // Run 1: 31 postings first seen in simplify:intern were turned gone by simplify:newgrad,
    // which lists the same Simplify id as inactive.
    const db: Tables = {}
    const store = createSupabaseStore(fakeSupabase(db))
    const live = posting({ externalId: 'shared-id' })

    expect(await store.savePostings(RUN, simplify('intern', [live]), false)).toEqual({ found: 1, new: 1, gone: 0 })
    expect(await store.savePostings(RUN, simplify('newgrad', [{ ...live, active: false }]), false)).toEqual({
      found: 0,
      new: 0,
      gone: 0,
    })

    expect(db.postings).toHaveLength(1)
    expect(db.postings[0].status).toBe('new')
    expect(db.posting_sources).toHaveLength(1)
    expect(db.posting_sources[0]).toMatchObject({ scope: 'simplify:intern', gone_at: null })
  })

  it('an inactive row still marks gone the source row of its own scope', async () => {
    const db: Tables = {}
    const store = createSupabaseStore(fakeSupabase(db))
    const live = posting({ externalId: 'own-id' })
    await store.savePostings(RUN, simplify('newgrad', [live]), false)
    expect(await store.savePostings(RUN, simplify('newgrad', [{ ...live, active: false }]), false)).toEqual({
      found: 0,
      new: 0,
      gone: 1,
    })
    expect(db.postings[0].status).toBe('gone')
    expect(db.posting_sources[0].gone_at).not.toBeNull()
  })

  it('next run revives a posting run 1 wrongly marked gone', async () => {
    // The state run 1 left: source row of simplify:intern gone, posting gone.
    const db: Tables = {}
    const store = createSupabaseStore(fakeSupabase(db))
    const live = posting({ externalId: 'shared-id' })
    await store.savePostings(RUN, simplify('intern', [live]), false)
    db.postings[0].status = 'gone'
    db.posting_sources[0].gone_at = RUN.startedAt

    const run2: Run = { id: 'run-2', startedAt: '2026-11-10T03:17:00.000Z' }
    await store.savePostings(run2, simplify('intern', [live]), false)
    await store.savePostings(run2, simplify('newgrad', [{ ...live, active: false }]), false)

    expect(db.postings[0].status).toBe('seen')
    expect(db.posting_sources[0].gone_at).toBeNull()
  })
})

describe('store: a board that returns HTTP 404', () => {
  const COMPANY = {
    id: 'co-1',
    name: 'Doctolib',
    ats: 'greenhouse',
    ats_token: 'doctolib',
    ats_meta: { x: 1 },
    coverage: 'covered',
    coverage_reason: null,
    resolved_at: '2026-11-01T00:00:00.000Z',
  }

  function board(status: ScopeResult['status'], reason?: string): ScopeResult {
    return { scope: 'greenhouse:doctolib', source: 'greenhouse', companyId: 'co-1', status, reason, fetched: 0, complete: false, postings: [] }
  }

  it('resets the company to unknown so the resolver re-probes it, and records the item failed', async () => {
    const db: Tables = { companies: [{ ...COMPANY }] }
    const store = createSupabaseStore(fakeSupabase(db))
    await store.recordItem('run-1', board('failed', 'HTTP 404'), { found: 0, new: 0, gone: 0 })

    expect(db.companies[0]).toEqual({
      ...COMPANY,
      ats: 'unknown',
      ats_token: null,
      ats_meta: {},
      coverage: 'unknown',
      coverage_reason: null,
      resolved_at: null,
    })
    expect(db.finder_run_items).toEqual([
      expect.objectContaining({ scope: 'greenhouse:doctolib', company_id: 'co-1', status: 'failed', error: 'HTTP 404' }),
    ])
  })

  it.each(['HTTP 403', 'HTTP 410', 'HTTP 503 after 3 retries', 'timeout', 'network error: ECONNRESET', 'unexpected response shape'])(
    'leaves the company alone on %s',
    async (reason) => {
      const db: Tables = { companies: [{ ...COMPANY }] }
      const store = createSupabaseStore(fakeSupabase(db))
      await store.recordItem('run-1', board('failed', reason), { found: 0, new: 0, gone: 0 })
      expect(db.companies[0]).toEqual(COMPANY)
    },
  )

  it('leaves the company alone when an ok scope is recorded', async () => {
    const db: Tables = { companies: [{ ...COMPANY }] }
    const store = createSupabaseStore(fakeSupabase(db))
    await store.recordItem('run-1', board('ok'), { found: 0, new: 0, gone: 0 })
    expect(db.companies[0]).toEqual(COMPANY)
  })
})
