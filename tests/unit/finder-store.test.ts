import { describe, expect, it } from 'vitest'
import { UNCHECKED } from '@/finder/resolve'
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
    sponsorship: null,
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

  it('does not reset a company whose token changed since the fetch', async () => {
    const moved = { ...COMPANY, ats_token: 'doctolib-new' }
    const db: Tables = { companies: [{ ...moved }] }
    const store = createSupabaseStore(fakeSupabase(db))
    await store.recordItem('run-1', board('failed', 'HTTP 404'), { found: 0, new: 0, gone: 0 })
    expect(db.companies[0]).toEqual(moved)
  })

  it("retires the scope's live source rows; a posting with no other live source goes gone", async () => {
    const db: Tables = { companies: [{ ...COMPANY }] }
    const store = createSupabaseStore(fakeSupabase(db))
    const ok = (postings: NormalizedPosting[]): ScopeResult => ({ ...board('ok'), fetched: postings.length, complete: true, postings })
    const only = posting({ externalId: 'gh-1', applyUrl: 'https://boards.greenhouse.io/doctolib/jobs/1' })
    const shared = posting({ externalId: 'gh-2', applyUrl: 'https://boards.greenhouse.io/doctolib/jobs/2' })
    const other = posting({ externalId: 'gh-3', applyUrl: 'https://boards.greenhouse.io/elsewhere/jobs/3' })
    await store.savePostings(RUN, ok([only, shared]), false)
    await store.savePostings(RUN, simplify('intern', [{ ...shared, externalId: 's-2' }]), false)
    await store.savePostings(RUN, { ...ok([other]), scope: 'greenhouse:elsewhere', companyId: 'co-2' }, false)

    await store.recordItem('run-2', board('failed', 'HTTP 404'), { found: 0, new: 0, gone: 0 })

    const src = (ext: string) => db.posting_sources.find((r) => r.external_id === ext)!
    const post = (ext: string) => db.postings.find((r) => r.id === src(ext).posting_id)!
    expect(src('gh-1').gone_at).not.toBeNull()
    expect(src('gh-2').gone_at).not.toBeNull()
    expect(post('gh-1').status).toBe('gone')
    expect(post('gh-2').status).toBe('new') // still live through Simplify
    expect(src('s-2').gone_at).toBeNull()
    expect(src('gh-3').gone_at).toBeNull()
    expect(post('gh-3').status).toBe('new')
  })

  it('leaves the company alone when an ok scope is recorded', async () => {
    const db: Tables = { companies: [{ ...COMPANY }] }
    const store = createSupabaseStore(fakeSupabase(db))
    await store.recordItem('run-1', board('ok'), { found: 0, new: 0, gone: 0 })
    expect(db.companies[0]).toEqual(COMPANY)
  })
})

describe('store: a posting seen again by another source', () => {
  function board(postings: NormalizedPosting[]): ScopeResult {
    return { scope: 'greenhouse:acme', source: 'greenhouse', companyId: 'co-1', status: 'ok', fetched: postings.length, complete: true, postings }
  }

  it('keeps the fields, terms and level Simplify found when a board sighting has poorer ones', async () => {
    const db: Tables = {}
    const store = createSupabaseStore(fakeSupabase(db))
    await store.savePostings(RUN, simplify('intern', [posting({ externalId: 's-1' })]), false)
    await store.savePostings(
      RUN,
      board([posting({ externalId: 'gh-1', title: 'Intern, Summer 2027', level: 'unknown', fieldSlugs: [], terms: [] })]),
      true,
    )

    expect(db.postings).toHaveLength(1)
    expect(db.postings[0]).toMatchObject({ level: 'internship', field_slugs: ['software-engineering'], terms: ['Summer 2027'] })
    expect(db.posting_sources).toHaveLength(2)
  })

  it("keeps the stored sponsorship when a later sighting has null, and takes a new non-null one", async () => {
    const db: Tables = {}
    const store = createSupabaseStore(fakeSupabase(db))
    await store.savePostings(RUN, simplify('intern', [posting({ externalId: 's-1', sponsorship: 'none' })]), false)
    await store.savePostings(RUN, board([posting({ externalId: 'gh-1', sponsorship: null })]), true)
    expect(db.postings[0].sponsorship).toBe('none')
    await store.savePostings(RUN, simplify('intern', [posting({ externalId: 's-1', sponsorship: 'offers' })]), false)
    expect(db.postings[0].sponsorship).toBe('offers')
  })

  it('unions fields and terms from both sources', async () => {
    const db: Tables = {}
    const store = createSupabaseStore(fakeSupabase(db))
    await store.savePostings(RUN, simplify('intern', [posting({ externalId: 's-1' })]), false)
    await store.savePostings(
      RUN,
      board([posting({ externalId: 'gh-1', fieldSlugs: ['data-science', 'software-engineering'], terms: ['Fall 2027'] })]),
      true,
    )
    expect(db.postings[0].field_slugs).toEqual(['software-engineering', 'data-science'])
    expect(db.postings[0].terms).toEqual(['Summer 2027', 'Fall 2027'])
  })

  it('replaces a stored unknown level with the new one, and keeps any other stored level', async () => {
    const db: Tables = {}
    const store = createSupabaseStore(fakeSupabase(db))
    await store.savePostings(RUN, board([posting({ externalId: 'gh-1', level: 'unknown' })]), true)
    await store.savePostings(RUN, simplify('intern', [posting({ externalId: 's-1', level: 'internship' })]), false)
    expect(db.postings[0].level).toBe('internship')

    await store.savePostings(RUN, board([posting({ externalId: 'gh-1', level: 'experienced' })]), true)
    expect(db.postings[0].level).toBe('internship')
  })
})

describe('store: resolver results', () => {
  const UNKNOWN = {
    id: 'co-9',
    name: 'Blocked Corp',
    ats: 'unknown',
    ats_token: null,
    ats_meta: {},
    coverage: 'unknown',
    coverage_reason: null,
    resolved_at: null,
    watchers: 0,
    updated_at: '2026-11-01T00:00:00.000Z',
  }

  it('a transient result leaves coverage unknown but touches updated_at, moving the company to the back of the queue', async () => {
    const db: Tables = { companies: [{ ...UNKNOWN }] }
    const store = createSupabaseStore(fakeSupabase(db))
    await store.saveResolution('co-9', { notCovered: UNCHECKED })

    const { updated_at, ...rest } = db.companies[0]
    const { updated_at: before, ...unchanged } = UNKNOWN
    expect(rest).toEqual(unchanged)
    expect(Date.parse(updated_at as string)).toBeGreaterThan(Date.parse(before))
  })

  it('a transient result does not touch a company that is no longer unknown', async () => {
    const covered = { ...UNKNOWN, ats: 'lever', ats_token: 'blocked', coverage: 'covered' }
    const db: Tables = { companies: [{ ...covered }] }
    const store = createSupabaseStore(fakeSupabase(db))
    await store.saveResolution('co-9', { notCovered: UNCHECKED })
    expect(db.companies[0]).toEqual(covered)
  })
})
