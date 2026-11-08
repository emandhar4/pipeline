import { describe, expect, it } from 'vitest'
import type { FetchResult, Http } from '@/finder/http'
import { resolveCompany } from '@/finder/resolve'

type Handler = (url: string) => FetchResult<unknown>
function fakeHttp(handler: Handler) {
  const calls: string[] = []
  const http: Http = {
    getJson: async <T,>(url: string) => {
      calls.push(url)
      return handler(url) as FetchResult<T>
    },
    postJson: async <T,>(url: string) => {
      calls.push(url)
      return handler(url) as FetchResult<T>
    },
    getText: async () => ({ ok: false, reason: 'unused' }),
    robotsAllows: async () => true,
    now: () => Date.UTC(2026, 10, 8, 12),
  }
  return { http, calls }
}
const notFound: FetchResult<unknown> = { ok: false, status: 404, reason: 'HTTP 404' }
const leverJobs = [
  {
    id: 'abc',
    text: 'Software Engineering Intern',
    categories: { location: 'Boston, MA', commitment: 'Intern' },
    hostedUrl: 'https://jobs.lever.co/acme-robotics/abc',
    applyUrl: 'https://jobs.lever.co/acme-robotics/abc/apply',
    createdAt: 1_762_000_000_000,
  },
]
const NO_BOARD = 'No public job board found from the name. Add its careers page link.'

describe('resolveCompany', () => {
  it('probes in order and a Lever hit on a later candidate wins', async () => {
    const { http, calls } = fakeHttp((url) =>
      url.startsWith('https://api.lever.co/v0/postings/acme-robotics') ? { ok: true, status: 200, data: leverJobs } : notFound,
    )
    const r = await resolveCompany(http, { name: 'Acme Robotics, Inc.', careersUrl: null })
    expect(r).toEqual({ ats: 'lever', token: 'acme-robotics', meta: {} })
    expect(calls[0]).toContain('greenhouse')
    expect(calls.at(-1)).toContain('api.lever.co/v0/postings/acme-robotics')
    expect(calls.some((u) => u.includes('/acme?') || u.endsWith('/acme'))).toBe(false)
  })

  it('does not accept an empty board found by name', async () => {
    const { http } = fakeHttp((url) =>
      url.includes('lever.co') ? { ok: true, status: 200, data: [] } : notFound,
    )
    expect(await resolveCompany(http, { name: 'Acme', careersUrl: null })).toEqual({ notCovered: NO_BOARD })
  })

  it('returns the not-found copy when every probe 404s', async () => {
    const { http } = fakeHttp(() => notFound)
    expect(await resolveCompany(http, { name: 'Acme Robotics', careersUrl: null })).toEqual({ notCovered: NO_BOARD })
  })

  it('does not record a transient outage as no board', async () => {
    const { http } = fakeHttp(() => ({ ok: false, reason: 'HTTP 503 after 3 retries', status: 503 }))
    expect(await resolveCompany(http, { name: 'Acme', careersUrl: null })).toEqual({
      notCovered: 'Could not check its job board this run.',
    })
  })

  it('treats a mix of 404 and one hit as found despite other failures', async () => {
    const { http } = fakeHttp((url) =>
      url.includes('greenhouse')
        ? { ok: false, reason: 'timeout' }
        : url.includes('api.lever.co')
          ? { ok: true, status: 200, data: leverJobs }
          : notFound,
    )
    expect(await resolveCompany(http, { name: 'Acme', careersUrl: null })).toEqual({ ats: 'lever', token: 'acme', meta: {} })
  })

  it('accepts an empty Greenhouse board when the user gave the link', async () => {
    const { http, calls } = fakeHttp(() => ({ ok: true, status: 200, data: { jobs: [] } }))
    const r = await resolveCompany(http, { name: 'Acme', careersUrl: 'https://boards.greenhouse.io/acme' })
    expect(r).toEqual({ ats: 'greenhouse', token: 'acme', meta: {} })
    expect(calls).toHaveLength(1)
  })

  it('rejects a recognized link whose board cannot be found', async () => {
    const { http } = fakeHttp(() => notFound)
    expect(await resolveCompany(http, { name: 'Acme', careersUrl: 'https://boards.greenhouse.io/acme' })).toEqual({
      notCovered: "That careers link uses a site Pipeline can't read yet.",
    })
  })

  it('rejects an unrecognized careers link without any request', async () => {
    const { http, calls } = fakeHttp(() => notFound)
    expect(await resolveCompany(http, { name: 'Acme', careersUrl: 'https://acme.example/careers' })).toEqual({
      notCovered: "That careers link uses a site Pipeline can't read yet.",
    })
    expect(calls).toHaveLength(0)
  })

  it('never throws', async () => {
    const http = fakeHttp(() => notFound).http
    http.getJson = async () => {
      throw new Error('boom')
    }
    await expect(resolveCompany(http, { name: 'Acme', careersUrl: null })).resolves.toHaveProperty('notCovered')
  })

  it('never probes a bare first word for multi-word names', async () => {
    const { http, calls } = fakeHttp(() => notFound)
    await resolveCompany(http, { name: 'Bank of America', careersUrl: null })
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.some((u) => /[/.]bank([/.?]|$)/.test(u.replace('bankofamerica', '').replace('bank-of-america', '')))).toBe(false)
  })

  it('reports unchecked when no hit and any probe was transient', async () => {
    let n = 0
    const { http } = fakeHttp(() => (++n === 5 ? { ok: false, status: 503, reason: 'HTTP 503 after 3 retries' } : notFound))
    expect(await resolveCompany(http, { name: 'Acme Robotics', careersUrl: null })).toEqual({
      notCovered: 'Could not check its job board this run.',
    })
    expect(n).toBe(12)
  })

  it.each([403, 408])('treats HTTP %i as transient', async (status) => {
    const { http } = fakeHttp(() => ({ ok: false, status, reason: `HTTP ${status}` }))
    expect(await resolveCompany(http, { name: 'Acme', careersUrl: null })).toEqual({
      notCovered: 'Could not check its job board this run.',
    })
  })

  // Reason strings copied from src/finder/http.ts (not exported there).
  it.each([
    ['HTTP 503 after 3 retries', 'Could not check its job board this run.'],
    ['timeout', 'Could not check its job board this run.'],
    ['network error: ECONNRESET', 'Could not check its job board this run.'],
    ['HTTP 404', NO_BOARD],
    ['invalid JSON', NO_BOARD],
    ['invalid URL', NO_BOARD],
  ])('classifies the http layer reason %s', async (reason, copy) => {
    const { http } = fakeHttp(() => ({ ok: false, reason }))
    expect(await resolveCompany(http, { name: 'Acme', careersUrl: null })).toEqual({ notCovered: copy })
  })

  it('resolves a Workday careers link via fetchBoard', async () => {
    const { http, calls } = fakeHttp(() => ({ ok: true, status: 200, data: { jobPostings: [], total: 0 } }))
    const r = await resolveCompany(http, { name: 'Acme', careersUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External' })
    expect(r).toEqual({
      ats: 'workday',
      token: 'acme',
      meta: { host: 'acme.wd5.myworkdayjobs.com', tenant: 'acme', site: 'External' },
    })
    expect(calls[0]).toBe('https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/jobs')
  })
})
