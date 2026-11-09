import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { FetchResult, Http } from '@/finder/http'
import { BOARD_URLS, fetchBoard, fetchSimplify } from '@/finder/sources'
import type { BoardCompany } from '@/finder/types'

const fx = (name: string) => JSON.parse(readFileSync(`tests/fixtures/finder/${name}.json`, 'utf8'))

type Handler = (url: string, body?: unknown) => FetchResult<unknown>
function fakeHttp(handler: Handler, opts: { robots?: boolean; now?: number } = {}) {
  const calls: Array<{ method: 'GET' | 'POST'; url: string; body?: unknown }> = []
  const http: Http = {
    getJson: async <T,>(url: string) => {
      calls.push({ method: 'GET', url })
      return handler(url) as FetchResult<T>
    },
    postJson: async <T,>(url: string, body: unknown) => {
      calls.push({ method: 'POST', url, body })
      return handler(url, body) as FetchResult<T>
    },
    getText: async () => ({ ok: false, reason: 'unused' }),
    robotsAllows: async () => opts.robots ?? true,
    now: () => opts.now ?? Date.UTC(2026, 10, 8, 12),
  }
  return { http, calls }
}
const ok = (data: unknown): FetchResult<unknown> => ({ ok: true, data, status: 200 })
const company = (ats: BoardCompany['ats'], token: string, meta: Record<string, unknown> = {}): BoardCompany => ({
  id: `id-${token}`,
  name: 'Example Co',
  ats,
  token,
  meta,
})

describe('simplify adapter', () => {
  it('normalizes rows and keeps inactive ones flagged', async () => {
    const { http, calls } = fakeHttp(() => ok(fx('simplify-intern')))
    const r = await fetchSimplify(http, 'intern')
    expect(calls[0].url).toBe(
      'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json',
    )
    expect(r).toMatchObject({ scope: 'simplify:intern', source: 'simplify', companyId: null, status: 'ok', fetched: 5 })
    const byId = Object.fromEntries(r.postings.map((p) => [p.externalId.slice(-1), p]))
    expect(byId['1']).toMatchObject({
      company: 'Example Robotics',
      title: 'Software Engineer Intern',
      applyUrl: 'https://boards.greenhouse.io/examplerobotics/jobs/4001',
      postedDate: '2026-10-30',
      terms: ['Summer 2027'],
      level: 'internship',
      active: true,
      remote: 'remote',
      states: ['TX'],
    })
    expect(byId['1'].fieldSlugs).toContain('software-engineering')
    expect(byId['2'].terms).toEqual([])
    expect(byId['2'].fieldSlugs.length).toBeGreaterThan(0)
    expect(byId['3'].active).toBe(false)
    expect(byId['4'].active).toBe(false)
    expect(byId['5'].active).toBe(true)
    expect(byId['5'].level).toBe('internship') // the Simplify kind hint outranks the experienced-title words
  })

  it('uses the new-grad repo and level', async () => {
    const { http, calls } = fakeHttp(() => ok([{ id: 'x1', company_name: 'Sample Co', title: 'Analyst', locations: ['Dallas, TX'], url: 'https://careers.example.test/1', date_posted: 1793318400, active: true, is_visible: true, category: 'Software' }]))
    const r = await fetchSimplify(http, 'newgrad')
    expect(calls[0].url).toContain('SimplifyJobs/New-Grad-Positions')
    expect(r.scope).toBe('simplify:newgrad')
    expect(r.postings[0].level).toBe('new_grad')
  })

  it('fails on http error and bad shape', async () => {
    const a = await fetchSimplify(fakeHttp(() => ({ ok: false, reason: 'HTTP 503 after 3 retries', status: 503 })).http, 'intern')
    expect(a).toMatchObject({ status: 'failed', reason: 'HTTP 503 after 3 retries', postings: [] })
    const b = await fetchSimplify(fakeHttp(() => ok({ nope: true })).http, 'intern')
    expect(b).toMatchObject({ status: 'failed', reason: 'unexpected response shape', postings: [] })
  })
})

describe('greenhouse adapter', () => {
  it('parses jobs', async () => {
    const { http, calls } = fakeHttp(() => ok(fx('greenhouse')))
    const r = await fetchBoard(http, company('greenhouse', 'examplerobotics'))
    expect(calls[0].url).toBe('https://boards-api.greenhouse.io/v1/boards/examplerobotics/jobs?pay_transparency=true')
    expect(r).toMatchObject({ scope: 'greenhouse:examplerobotics', source: 'greenhouse', companyId: 'id-examplerobotics', status: 'ok', fetched: 4 })
    const [a, b, c, d] = r.postings
    expect(a).toMatchObject({
      externalId: '4001',
      applyUrl: 'https://boards.greenhouse.io/examplerobotics/jobs/4001',
      postedDate: '2026-10-20',
      level: 'internship',
      terms: ['Summer 2027'],
      states: ['TX'],
      payMinCents: 4500,
      payMaxCents: 5500,
      payPeriod: 'hour',
      active: true,
    })
    expect(b).toMatchObject({ level: 'new_grad', remote: 'remote', locationUnknown: false, payMinCents: 9500000, payPeriod: 'year' })
    expect(c).toMatchObject({ level: 'experienced', payMinCents: null, payPeriod: null })
    expect(d).toMatchObject({ locationUnknown: true, locations: [] })
  })
  it('rejects a body without jobs', async () => {
    const r = await fetchBoard(fakeHttp(() => ok({ foo: [] })).http, company('greenhouse', 't'))
    expect(r).toMatchObject({ status: 'failed', reason: 'unexpected response shape', postings: [] })
  })
  it('reports http failure', async () => {
    const r = await fetchBoard(fakeHttp(() => ({ ok: false, reason: 'HTTP 404', status: 404 })).http, company('greenhouse', 't'))
    expect(r).toMatchObject({ status: 'failed', reason: 'HTTP 404', postings: [] })
  })
})

describe('lever adapter', () => {
  it('parses postings', async () => {
    const { http, calls } = fakeHttp(() => ok(fx('lever')))
    const r = await fetchBoard(http, company('lever', 'examplelabs'))
    expect(calls[0].url).toBe('https://api.lever.co/v0/postings/examplelabs?mode=json')
    expect(r.fetched).toBe(3)
    const [a, b, c] = r.postings
    expect(a).toMatchObject({ title: 'Product Design Intern', level: 'internship', remote: 'hybrid', postedDate: '2026-10-31', states: ['CA'] })
    expect(a.locations).toEqual(['San Francisco, CA', 'Remote'])
    expect(a.applyUrl).toContain('jobs.lever.co/examplelabs/')
    expect(b).toMatchObject({ level: 'internship', remote: 'remote', locationUnknown: false, payMinCents: 3500, payMaxCents: 4200, payPeriod: 'hour' })
    expect(c).toMatchObject({ level: 'experienced', remote: 'onsite' })
  })
  it('uses the EU host', async () => {
    const { http, calls } = fakeHttp(() => ok([]))
    await fetchBoard(http, company('lever', 'eulabs', { region: 'eu' }))
    expect(calls[0].url).toBe('https://api.eu.lever.co/v0/postings/eulabs?mode=json')
  })
  it('rejects a non-array body', async () => {
    const r = await fetchBoard(fakeHttp(() => ok({ jobs: [] })).http, company('lever', 't'))
    expect(r).toMatchObject({ status: 'failed', reason: 'unexpected response shape' })
  })
})

describe('ashby adapter', () => {
  it('skips unlisted, merges secondary locations, reads compensation', async () => {
    const { http, calls } = fakeHttp(() => ok(fx('ashby')))
    const r = await fetchBoard(http, company('ashby', 'exampleai'))
    expect(calls[0].url).toBe('https://api.ashbyhq.com/posting-api/job-board/exampleai?includeCompensation=true')
    expect(r.postings).toHaveLength(2)
    const [a, b] = r.postings
    expect(a.locations).toEqual(['Boston, MA', 'New York, NY', 'Toronto, Canada'])
    expect(a).toMatchObject({ level: 'internship', remote: 'hybrid', postedDate: '2026-10-28', payMinCents: 5000, payMaxCents: 6000, payPeriod: 'hour' })
    expect(a.states).toEqual(['MA', 'NY'])
    expect(a.countries).toContain('CA')
    expect(b).toMatchObject({ remote: 'remote', payMinCents: 18000000, payPeriod: 'year', level: 'unknown' })
  })
  it('rejects bad shape', async () => {
    const r = await fetchBoard(fakeHttp(() => ok([])).http, company('ashby', 't'))
    expect(r.reason).toBe('unexpected response shape')
  })
})

describe('smartrecruiters adapter', () => {
  it('follows offset until totalFound is reached', async () => {
    const { http, calls } = fakeHttp((url) => (url.includes('offset=0') ? ok(fx('smartrecruiters-page1')) : ok(fx('smartrecruiters-page2'))))
    const r = await fetchBoard(http, company('smartrecruiters', 'ExampleBank'))
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.smartrecruiters.com/v1/companies/ExampleBank/postings?limit=100&offset=0',
      'https://api.smartrecruiters.com/v1/companies/ExampleBank/postings?limit=100&offset=2',
    ])
    expect(r).toMatchObject({ status: 'ok', fetched: 3, complete: true, scope: 'smartrecruiters:ExampleBank' })
    const [a, b, c] = r.postings
    expect(a).toMatchObject({ level: 'internship', states: ['IL'], applyUrl: 'https://jobs.smartrecruiters.com/ExampleBank/743999000000001', postedDate: '2026-10-22' })
    expect(b).toMatchObject({ level: 'experienced', remote: 'hybrid' })
    expect(c).toMatchObject({ level: 'new_grad', remote: 'remote', countries: ['GB'] })
  })
  it('caps at 10 pages', async () => {
    const { http, calls } = fakeHttp(() => ok({ totalFound: 5000, content: [{ id: 'x', name: 'Job' }] }))
    const r = await fetchBoard(http, company('smartrecruiters', 't'))
    expect(calls).toHaveLength(10)
    expect(calls[9].url).toContain('offset=9')
    expect(r).toMatchObject({ status: 'ok', complete: false })
  })
  it('fails the scope when a later page fails', async () => {
    const { http } = fakeHttp((url) => (url.includes('offset=0') ? ok(fx('smartrecruiters-page1')) : { ok: false, reason: 'HTTP 500' }))
    const r = await fetchBoard(http, company('smartrecruiters', 't'))
    expect(r).toMatchObject({ status: 'failed', reason: 'HTTP 500', postings: [] })
  })
  it('rejects bad shape', async () => {
    const r = await fetchBoard(fakeHttp(() => ok({ foo: 1 })).http, company('smartrecruiters', 't'))
    expect(r.reason).toBe('unexpected response shape')
  })
})

describe('recruitee adapter', () => {
  it('skips unpublished offers and reads flags and salary', async () => {
    const { http, calls } = fakeHttp(() => ok(fx('recruitee')))
    const r = await fetchBoard(http, company('recruitee', 'exampleco'))
    expect(calls[0].url).toBe('https://exampleco.recruitee.com/api/offers/')
    expect(r.postings).toHaveLength(2)
    const [a, b] = r.postings
    expect(a).toMatchObject({ level: 'internship', remote: 'hybrid', postedDate: '2026-10-12', payMinCents: 2000, payMaxCents: 2500, payPeriod: 'hour', applyUrl: 'https://exampleco.recruitee.com/o/marketing-intern/c/new' })
    expect(b).toMatchObject({ remote: 'remote', states: ['OR'], level: 'unknown' })
  })
  it('rejects bad shape', async () => {
    const r = await fetchBoard(fakeHttp(() => ok({ jobs: [] })).http, company('recruitee', 't'))
    expect(r.reason).toBe('unexpected response shape')
  })
})

describe('workable adapter', () => {
  it('parses the widget feed', async () => {
    const { http, calls } = fakeHttp(() => ok(fx('workable')))
    const r = await fetchBoard(http, company('workable', 'examplehealth'))
    expect(calls[0].url).toBe('https://apply.workable.com/api/v1/widget/accounts/examplehealth')
    expect(r.postings).toHaveLength(3)
    const [a, b, c] = r.postings
    expect(a).toMatchObject({ externalId: 'AB12CD34EF', level: 'internship', states: ['TN'], postedDate: '2026-10-15', applyUrl: 'https://apply.workable.com/examplehealth/j/AB12CD34EF/apply/' })
    expect(b).toMatchObject({ remote: 'remote', locationUnknown: false })
    expect(c).toMatchObject({ level: 'experienced', states: ['OH'] })
  })
  it('rejects bad shape', async () => {
    const r = await fetchBoard(fakeHttp(() => ok([])).http, company('workable', 't'))
    expect(r.reason).toBe('unexpected response shape')
  })
})

describe('workday adapter', () => {
  const meta = { host: 'example.wd5.myworkdayjobs.com', tenant: 'example', site: 'Careers' }
  const endpoint = 'https://example.wd5.myworkdayjobs.com/wday/cxs/example/Careers/jobs'
  const NOW = Date.UTC(2026, 10, 8, 12)

  const handler: Handler = (_url, body) => {
    const b = body as { searchText: string; offset: number }
    if (b.searchText === 'intern') return ok(fx(b.offset === 0 ? 'workday-intern-page1' : 'workday-intern-page2'))
    return ok(fx('workday-graduate-page1'))
  }

  it('pages intern then graduate, dedupes and parses dates', async () => {
    const { http, calls } = fakeHttp(handler, { now: NOW })
    const r = await fetchBoard(http, company('workday', 'example', meta))
    expect(calls.map((c) => [c.url, c.body])).toEqual([
      [endpoint, { appliedFacets: {}, limit: 20, offset: 0, searchText: 'intern' }],
      [endpoint, { appliedFacets: {}, limit: 20, offset: 20, searchText: 'intern' }],
      [endpoint, { appliedFacets: {}, limit: 20, offset: 0, searchText: 'graduate' }],
    ])
    expect(r).toMatchObject({ scope: 'workday:example', source: 'workday', status: 'ok', fetched: 29 })
    // 20 + 5 intern + 4 graduate rows, one of which repeats an intern path
    expect(r.postings).toHaveLength(28)
    const [today, yesterday, thirtyPlus, d26] = r.postings
    expect(today.postedDate).toBe('2026-11-08')
    expect(yesterday.postedDate).toBe('2026-11-07')
    expect(thirtyPlus.postedDate).toBe('2026-10-09')
    expect(thirtyPlus.locationUnknown).toBe(true)
    expect(d26.postedDate).toBe('2026-10-13')
    expect(d26.applyUrl).toMatch(/^https:\/\/example\.wd5\.myworkdayjobs\.com\/en-US\/Careers\/job\//)
    expect(d26).toMatchObject({ level: 'internship', states: ['TX'] })
  })

  it('external ids are unique per tenant: host + externalPath', async () => {
    const one = { jobPostings: [{ title: 'Software Intern', externalPath: '/job/Austin-TX/Intern_R1', postedOn: 'Posted Today' }] }
    const metaB = { host: 'other.wd1.myworkdayjobs.com', tenant: 'other', site: 'Jobs' }
    const a = await fetchBoard(fakeHttp(() => ok(one)).http, company('workday', 'example', meta))
    const b = await fetchBoard(fakeHttp(() => ok(one)).http, company('workday', 'other', metaB))
    expect(a.postings[0].externalId).toBe('example.wd5.myworkdayjobs.com/job/Austin-TX/Intern_R1')
    expect(b.postings[0].externalId).toBe('other.wd1.myworkdayjobs.com/job/Austin-TX/Intern_R1')
  })

  it('stops at 3 pages per search', async () => {
    const full = { jobPostings: Array.from({ length: 20 }, (_, i) => ({ title: 'Intern', externalPath: `/job/x/${Math.random()}-${i}`, postedOn: 'Posted Today' })) }
    const { http, calls } = fakeHttp(() => ok(full))
    await fetchBoard(http, company('workday', 'example', meta))
    expect(calls).toHaveLength(6)
  })

  it('skips when robots.txt disallows', async () => {
    const { http, calls } = fakeHttp(handler, { robots: false })
    const r = await fetchBoard(http, company('workday', 'example', meta))
    expect(r).toMatchObject({ status: 'skipped', reason: 'robots.txt disallows', postings: [] })
    expect(calls).toHaveLength(0)
  })

  it('fails on http error, bad shape and bad meta', async () => {
    const a = await fetchBoard(fakeHttp(() => ({ ok: false, reason: 'HTTP 500 after 3 retries' })).http, company('workday', 'example', meta))
    expect(a).toMatchObject({ status: 'failed', reason: 'HTTP 500 after 3 retries', postings: [] })
    const b = await fetchBoard(fakeHttp(() => ok({ total: 1 })).http, company('workday', 'example', meta))
    expect(b).toMatchObject({ status: 'failed', reason: 'unexpected response shape' })
    const c = await fetchBoard(fakeHttp(handler).http, company('workday', 'example', { host: 'evil.test' }))
    expect(c.status).toBe('failed')
  })
})

describe('fetchBoard misc', () => {
  it('skips ATS kinds without an adapter', async () => {
    const r = await fetchBoard(fakeHttp(() => ok({})).http, company('rippling', 't'))
    expect(r.status).toBe('skipped')
  })
  it('exposes board URLs', () => {
    expect(BOARD_URLS.greenhouse(company('greenhouse', 'abc'))).toContain('/boards/abc/jobs')
  })
})

describe('fix round 1', () => {
  const noIds = (n: number, extra: Record<string, unknown> = {}) => Array.from({ length: n }, (_, i) => ({ title: `Intern ${i}`, ...extra }))

  it('fails when every row lacks required fields (simplify, greenhouse, workday)', async () => {
    const a = await fetchSimplify(fakeHttp(() => ok(noIds(5, { company_name: 'X' }))).http, 'intern')
    expect(a).toMatchObject({ status: 'failed', reason: 'unexpected response shape', postings: [], complete: false })
    const b = await fetchBoard(fakeHttp(() => ok({ jobs: noIds(3) })).http, company('greenhouse', 't'))
    expect(b).toMatchObject({ status: 'failed', reason: 'unexpected response shape', postings: [] })
    const c = await fetchBoard(
      fakeHttp(() => ok({ jobPostings: noIds(3) })).http,
      company('workday', 'example', { host: 'example.wd5.myworkdayjobs.com', tenant: 'example', site: 'Careers' }),
    )
    expect(c).toMatchObject({ status: 'failed', reason: 'unexpected response shape', postings: [] })
  })

  it('fails when more than 20% of rows are rejected, but tolerates a few', async () => {
    const good = (i: number) => ({ id: i, title: `Intern ${i}`, location: { name: 'Austin, TX' }, absolute_url: 'https://boards.greenhouse.io/x/jobs/1' })
    const mixed = (bad: number) => ({ jobs: [...Array.from({ length: 10 }, (_, i) => good(i)), ...noIds(bad)] })
    const over = await fetchBoard(fakeHttp(() => ok(mixed(4))).http, company('greenhouse', 't'))
    expect(over).toMatchObject({ status: 'failed', reason: 'unexpected response shape' })
    const under = await fetchBoard(fakeHttp(() => ok(mixed(2))).http, company('greenhouse', 't'))
    expect(under).toMatchObject({ status: 'ok', complete: true })
    expect(under.postings).toHaveLength(10)
  })

  it('legit skips are not rejections (unlisted Ashby only)', async () => {
    const r = await fetchBoard(
      fakeHttp(() => ok({ jobs: [{ id: 'a', title: 'T', isListed: false }, { id: 'b', title: 'U', isListed: false }] })).http,
      company('ashby', 't'),
    )
    expect(r).toMatchObject({ status: 'ok', postings: [] })
  })

  it('marks failed and skipped results incomplete, normal ones complete', async () => {
    expect((await fetchBoard(fakeHttp(() => ok({ jobs: [] })).http, company('greenhouse', 't'))).complete).toBe(true)
    expect((await fetchBoard(fakeHttp(() => ({ ok: false, reason: 'HTTP 500' })).http, company('greenhouse', 't'))).complete).toBe(false)
    expect((await fetchBoard(fakeHttp(() => ok({})).http, company('rippling', 't'))).complete).toBe(false)
  })

  it('workday hitting the page cap with a full last page is ok but incomplete', async () => {
    const full = { jobPostings: Array.from({ length: 20 }, (_, i) => ({ title: 'Intern', externalPath: `/job/x/${Math.random()}-${i}` })) }
    const meta = { host: 'example.wd5.myworkdayjobs.com', tenant: 'example', site: 'Careers' }
    const r = await fetchBoard(fakeHttp(() => ok(full)).http, company('workday', 'example', meta))
    expect(r).toMatchObject({ status: 'ok', complete: false })
    const short = await fetchBoard(fakeHttp(() => ok({ jobPostings: full.jobPostings.slice(0, 5) })).http, company('workday', 'example', meta))
    expect(short).toMatchObject({ status: 'ok', complete: true })
  })

  it('greenhouse pay only for USD, and does not read a unit field', async () => {
    const job = (cur: unknown, unit?: string) => ({
      jobs: [{ id: 1, title: 'Intern', location: { name: 'Austin, TX' }, pay_input_ranges: [{ min_cents: 4500, max_cents: 5500, currency_type: cur, unit }] }],
    })
    const eur = await fetchBoard(fakeHttp(() => ok(job('EUR'))).http, company('greenhouse', 't'))
    expect(eur.postings[0]).toMatchObject({ payMinCents: null, payMaxCents: null, payPeriod: null })
    const usd = await fetchBoard(fakeHttp(() => ok(job('USD', 'year'))).http, company('greenhouse', 't'))
    expect(usd.postings[0]).toMatchObject({ payMinCents: 4500, payPeriod: 'hour' }) // unit ignored; magnitude rule
    const none = await fetchBoard(fakeHttp(() => ok(job(undefined))).http, company('greenhouse', 't'))
    expect(none.postings[0].payMinCents).toBe(4500)
  })

  it('stores no pay when the period cannot be determined', async () => {
    const lever = [{ id: 'l1', text: 'Intern', categories: { location: 'Austin, TX' }, salaryRange: { currency: 'USD', interval: 'per-fortnight', min: 3000, max: 4000 } }]
    const r = await fetchBoard(fakeHttp(() => ok(lever)).http, company('lever', 't'))
    expect(r.postings[0]).toMatchObject({ payMinCents: null, payMaxCents: null, payPeriod: null })
  })

  it('smartrecruiters pages by rows fetched and continues on a full page without totalFound', async () => {
    const page = (n: number) => ({ content: Array.from({ length: n }, (_, i) => ({ id: `id${Math.random()}-${i}`, name: 'Job' })) })
    const seen: string[] = []
    const { http } = fakeHttp((url) => {
      seen.push(url.split('?')[1])
      return ok(url.includes('offset=0') ? page(100) : page(30))
    })
    const r = await fetchBoard(http, company('smartrecruiters', 't'))
    expect(seen).toEqual(['limit=100&offset=0', 'limit=100&offset=100'])
    expect(r).toMatchObject({ status: 'ok', fetched: 130, complete: true })
  })
})
