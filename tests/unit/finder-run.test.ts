import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FetchResult, Http } from '@/finder/http'
import { interleaveByHost, runFinder } from '@/finder/run'
import { keptPostings, runItemRow, stampFor } from '@/finder/keep'
import type { Store, Totals } from '@/finder/store'
import type { BoardCompany, NormalizedPosting, ScopeResult } from '@/finder/types'

const SIMPLIFY_ROW = (id: string) => ({
  id,
  company_name: 'Acme Robotics',
  title: 'Software Engineering Intern',
  locations: ['Boston, MA'],
  url: `https://boards.greenhouse.io/acme/jobs/${id}`,
  date_posted: 1_762_000_000,
  terms: ['Summer 2027'],
  active: true,
  is_visible: true,
  category: 'Software Engineering',
})

const GH_JOBS = {
  jobs: [
    {
      id: 11,
      title: 'Data Science Intern',
      location: { name: 'Austin, TX' },
      absolute_url: 'https://boards.greenhouse.io/beta/jobs/11',
      updated_at: '2026-11-01T00:00:00Z',
    },
  ],
}

type Handler = (url: string) => FetchResult<unknown>
function fakeHttp(handler: Handler): Http {
  return {
    getJson: async <T,>(url: string) => handler(url) as FetchResult<T>,
    postJson: async <T,>(url: string) => handler(url) as FetchResult<T>,
    getText: async () => ({ ok: false, reason: 'unused' }),
    robotsAllows: async () => true,
    now: () => Date.UTC(2026, 10, 8, 12),
  }
}

const okHandler: Handler = (url) => {
  if (url.includes('Summer2027-Internships')) return { ok: true, status: 200, data: [SIMPLIFY_ROW('s1'), SIMPLIFY_ROW('s2')] }
  if (url.includes('New-Grad-Positions')) return { ok: true, status: 200, data: [] }
  if (url.includes('greenhouse.io')) return { ok: true, status: 200, data: GH_JOBS }
  return { ok: false, status: 404, reason: 'HTTP 404' }
}

const TOTALS: Totals = { found: 3, new: 1, seen: 0, gone: 0, failed_scopes: 0 }

function fakeStore(over: Partial<Store> = {}) {
  const calls: string[] = []
  const companies: BoardCompany[] = [
    { id: 'c-1', name: 'Beta', ats: 'greenhouse', token: 'beta', meta: {} },
  ]
  const store: Store = {
    startRun: async () => {
      calls.push('startRun')
      return { id: 'run-1', startedAt: '2026-11-08T12:00:00.000Z' }
    },
    failRun: async () => {
      calls.push('failRun')
    },
    companiesToFetch: async () => companies,
    companiesToResolve: async () => [],
    saveResolution: async () => {
      calls.push('saveResolution')
    },
    watchedCompanyIds: async () => new Set<string>(),
    savePostings: async (_run, r) => {
      calls.push(`savePostings:${r.scope}`)
      return { found: r.postings.length, new: 0, gone: 0 }
    },
    recordItem: async (_run, r) => {
      calls.push(`recordItem:${r.scope}`)
    },
    finishRun: async () => {
      calls.push('finishRun')
      return TOTALS
    },
    userIdsToMatch: async () => ['u-111', 'u-222'],
    refreshMatches: async (id) => {
      calls.push(`refreshMatches:${id}`)
    },
    prune: async () => {
      calls.push('prune')
    },
    ...over,
  }
  return { store, calls }
}

const WRITES = ['startRun', 'failRun', 'saveResolution', 'savePostings', 'recordItem', 'finishRun', 'refreshMatches', 'prune']

describe('runFinder', () => {
  it('a failed scope is reported, not zero', async () => {
    const http = fakeHttp((url) =>
      url.includes('greenhouse.io') ? { ok: false, status: 503, reason: 'HTTP 503 after 3 retries' } : okHandler(url),
    )
    const { store, calls } = fakeStore()
    const summary = await runFinder({ http, store, log: () => {} }, { trigger: 'test' })
    const gh = summary.scopes.find((s) => s.scope === 'greenhouse:beta')
    expect(gh).toMatchObject({ status: 'failed', reason: 'HTTP 503 after 3 retries', found: 0, new: 0 })
    expect(calls).toContain('recordItem:greenhouse:beta')
    expect(calls).not.toContain('savePostings:greenhouse:beta')
    expect(calls).toContain('finishRun')
    expect(summary.totals).toEqual(TOTALS)
  })

  it('matches refresh after finish', async () => {
    const { store, calls } = fakeStore()
    await runFinder({ http: fakeHttp(okHandler), store, log: () => {} }, { trigger: 'test' })
    const finish = calls.indexOf('finishRun')
    const refresh = calls.findIndex((c) => c.startsWith('refreshMatches'))
    expect(finish).toBeGreaterThan(-1)
    expect(refresh).toBeGreaterThan(finish)
    expect(calls.filter((c) => c.startsWith('refreshMatches'))).toHaveLength(2)
    expect(calls.findIndex((c) => c.startsWith('recordItem'))).toBeLessThan(finish)
  })

  it('prune runs last', async () => {
    const { store, calls } = fakeStore()
    await runFinder({ http: fakeHttp(okHandler), store, log: () => {} }, { trigger: 'test' })
    expect(calls.at(-1)).toBe('prune')
  })

  it('a refresh error for one user does not stop the others or prune', async () => {
    const { store, calls } = fakeStore({
      refreshMatches: async (id) => {
        if (id === 'u-111') throw new Error('boom')
        calls.push(`refreshMatches:${id}`)
      },
    })
    await runFinder({ http: fakeHttp(okHandler), store, log: () => {} }, { trigger: 'test' })
    expect(calls).toContain('refreshMatches:u-222')
    expect(calls.at(-1)).toBe('prune')
  })

  it('dry run writes nothing', async () => {
    const { store, calls } = fakeStore()
    const summary = await runFinder({ http: fakeHttp(okHandler), store, log: () => {} }, { trigger: 'test', dryRun: true })
    expect(calls.filter((c) => WRITES.some((w) => c.startsWith(w)))).toEqual([])
    expect(summary.runId).toBeNull()
    expect(summary.scopes.find((s) => s.scope === 'simplify:intern')).toMatchObject({ status: 'ok', found: 2 })
    expect(summary.scopes.find((s) => s.scope === 'greenhouse:beta')).toMatchObject({ status: 'ok', found: 1 })
    expect(summary.totals.found).toBe(3)
  })

  it('only filters by source name or scope', async () => {
    const { store } = fakeStore()
    const a = await runFinder({ http: fakeHttp(okHandler), store, log: () => {} }, { trigger: 'test', dryRun: true, only: ['simplify'] })
    expect(a.scopes.map((s) => s.scope)).toEqual(['simplify:intern', 'simplify:newgrad'])
    const b = await runFinder({ http: fakeHttp(okHandler), store, log: () => {} }, { trigger: 'test', dryRun: true, only: ['greenhouse:beta'] })
    expect(b.scopes.map((s) => s.scope)).toEqual(['greenhouse:beta'])
  })

  it('crash marks the run failed', async () => {
    const { store, calls } = fakeStore({
      companiesToFetch: async () => {
        throw new Error('db down')
      },
    })
    await expect(runFinder({ http: fakeHttp(okHandler), store, log: () => {} }, { trigger: 'test' })).rejects.toThrow('db down')
    expect(calls).toContain('failRun')
    expect(calls).not.toContain('finishRun')
  })

  it('log lines contain no user ids', async () => {
    const lines: string[] = []
    const { store } = fakeStore({
      refreshMatches: async (id) => {
        if (id === 'u-222') throw new Error(`no profile for u-222`)
      },
    })
    await runFinder({ http: fakeHttp(okHandler), store, log: (l) => lines.push(l) }, { trigger: 'test' })
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) {
      expect(l).not.toContain('u-111')
      expect(l).not.toContain('u-222')
    }
  })
})

describe('interleaveByHost', () => {
  it('takes one board from each host in turn', () => {
    const c = (ats: BoardCompany['ats'], token: string, meta: Record<string, unknown> = {}): BoardCompany => ({
      id: token,
      name: token,
      ats,
      token,
      meta,
    })
    const out = interleaveByHost([
      c('greenhouse', 'g1'),
      c('greenhouse', 'g2'),
      c('greenhouse', 'g3'),
      c('lever', 'l1'),
      c('workday', 'w1', { host: 'a.wd1.myworkdayjobs.com', tenant: 'a', site: 's' }),
      c('workday', 'w2', { host: 'b.wd5.myworkdayjobs.com', tenant: 'b', site: 's' }),
    ])
    expect(out.map((x) => x.token)).toEqual(['g1', 'l1', 'w1', 'w2', 'g2', 'g3'])
  })
})

describe('src/app never imports src/finder', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name)
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|js|mjs)$/.test(name) ? [p] : []
    })
  }
  it('no import path under src/app or src/lib contains finder/', () => {
    const offenders: string[] = []
    const importRe = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g
    for (const f of [...files('src/app'), ...files('src/lib')]) {
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(importRe)) {
        if (/(^|[/@])finder(\/|$)/.test(m[1])) offenders.push(`${f}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('keep and run item rules', () => {
  const p = (externalId: string, level: NormalizedPosting['level'], active = true): NormalizedPosting => ({
    externalId,
    company: 'Acme',
    title: 'Engineer',
    locations: [],
    states: [],
    countries: [],
    remote: 'unknown',
    locationUnknown: true,
    applyUrl: null,
    sourceUrl: null,
    postedDate: null,
    payMinCents: null,
    payMaxCents: null,
    payPeriod: null,
    terms: [],
    level,
    fieldSlugs: [],
    active,
    sponsorship: null,
  })
  const scope = (over: Partial<ScopeResult>): ScopeResult => ({
    scope: 'smartrecruiters:acme',
    source: 'smartrecruiters',
    companyId: 'c-1',
    status: 'ok',
    fetched: 1000,
    complete: true,
    postings: [],
    ...over,
  })

  it('keeps early-career roles, experienced/unknown only when watched, and splits inactive rows', () => {
    const r = scope({ postings: [p('a', 'internship'), p('b', 'new_grad'), p('c', 'experienced'), p('d', 'unknown'), p('e', 'internship', false)] })
    const plain = keptPostings(r, false)
    expect(plain.active.map((x) => x.externalId)).toEqual(['a', 'b'])
    expect(plain.inactive.map((x) => x.externalId)).toEqual(['e'])
    expect(keptPostings(r, true).active.map((x) => x.externalId)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('a partial scope is recorded as skipped so its postings never go gone', () => {
    expect(runItemRow(scope({ complete: false }), { found: 40, new: 2, gone: 0 })).toMatchObject({
      status: 'skipped',
      error: 'partial: stopped at 1000 rows',
      found: 40,
      new: 2,
      fetched: 1000,
    })
    expect(runItemRow(scope({}), { found: 40, new: 2, gone: 0 })).toMatchObject({ status: 'ok', error: null })
    expect(runItemRow(scope({ status: 'failed', reason: 'HTTP 404', complete: false, fetched: 0 }), { found: 0, new: 0, gone: 0 })).toMatchObject({
      status: 'failed',
      error: 'HTTP 404',
    })
  })
})

describe('fix round 1', () => {
  it('a failed recordItem or saveResolution does not abort the run', async () => {
    const lines: string[] = []
    let thrown = false
    const { store, calls } = fakeStore({
      companiesToResolve: async () => [{ id: 'c-9', name: 'Gamma Labs', careersUrl: null }],
      saveResolution: async () => {
        throw new Error('db hiccup')
      },
      recordItem: async (_run, r) => {
        if (!thrown) {
          thrown = true
          throw new Error('db hiccup')
        }
        calls.push(`recordItem:${r.scope}`)
      },
    })
    const http = fakeHttp((url) => (url.includes('gamma') ? { ok: false, status: 404, reason: 'HTTP 404' } : okHandler(url)))
    const summary = await runFinder({ http, store, log: (l) => lines.push(l) }, { trigger: 'test', resolveLimit: 1 })
    expect(calls).toContain('finishRun')
    expect(calls.filter((c) => c.startsWith('refreshMatches'))).toHaveLength(2)
    expect(calls.at(-1)).toBe('prune')
    expect(summary.runId).toBe('run-1')
    expect(lines.some((l) => l.includes('Gamma Labs'))).toBe(true)
    expect(lines.some((l) => l.includes('simplify:intern') && /not recorded/.test(l))).toBe(true)
    expect(lines.join('\n')).not.toContain('db hiccup')
  })

  it('postings flipped gone by inactive rows add to the gone total', async () => {
    const { store } = fakeStore({
      savePostings: async (_run, r) => ({ found: r.postings.length, new: 0, gone: r.scope === 'simplify:intern' ? 2 : 0 }),
    })
    const summary = await runFinder({ http: fakeHttp(okHandler), store, log: () => {} }, { trigger: 'test' })
    expect(summary.totals.gone).toBe(TOTALS.gone + 2)
    expect(summary.totals.found).toBe(TOTALS.found)
  })

  it('a save failure is reported and recorded as failed', async () => {
    const recorded: { scope: string; status: string; reason?: string }[] = []
    const { store } = fakeStore({
      savePostings: async (_run, r) => {
        if (r.scope === 'greenhouse:beta') throw new Error('insert postings: timeout')
        return { found: r.postings.length, new: 0, gone: 0 }
      },
      recordItem: async (_run, r) => {
        recorded.push({ scope: r.scope, status: r.status, reason: r.reason })
      },
    })
    const summary = await runFinder({ http: fakeHttp(okHandler), store, log: () => {} }, { trigger: 'test' })
    expect(summary.scopes.find((s) => s.scope === 'greenhouse:beta')).toMatchObject({
      status: 'failed',
      found: 0,
      reason: 'save failed: insert postings: timeout',
    })
    expect(recorded.find((r) => r.scope === 'greenhouse:beta')).toMatchObject({ status: 'failed', reason: 'save failed: insert postings: timeout' })
  })

  it('--only logs unknown source names and unmatched scopes', async () => {
    const lines: string[] = []
    const { store } = fakeStore()
    const s = await runFinder(
      { http: fakeHttp(okHandler), store, log: (l) => lines.push(l) },
      { trigger: 'test', dryRun: true, only: ['greenhous', 'lever:nope', 'greenhouse'] },
    )
    expect(s.scopes.map((x) => x.scope)).toEqual(['greenhouse:beta'])
    expect(lines.some((l) => l.startsWith('greenhous:') && /unmatched/.test(l))).toBe(true)
    expect(lines.some((l) => l.startsWith('lever:nope:') && /unmatched/.test(l))).toBe(true)
    expect(lines.some((l) => l.startsWith('greenhouse:') && /unmatched/.test(l))).toBe(false)
  })
})

describe('stampFor', () => {
  const started = '2026-11-08T12:00:00.000Z'
  it('uses startedAt when the client clock is behind it', () => {
    expect(stampFor(Date.parse(started) - 5000, started)).toBe(started)
  })
  it('uses the client clock when it is ahead of startedAt', () => {
    expect(stampFor(Date.parse(started) + 5000, started)).toBe('2026-11-08T12:00:05.000Z')
  })
})
