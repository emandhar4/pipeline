import { describe, expect, it } from 'vitest'
import { createHttp, USER_AGENT } from '@/finder/http'

function setup(responses: Array<Response | Error | ((url: string) => Response)>) {
  let t = 1_000_000
  const sleeps: number[] = []
  const calls: Array<{ url: string; init?: RequestInit }> = []
  let i = 0
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const r = responses[Math.min(i++, responses.length - 1)]
    if (r instanceof Error) throw r
    return typeof r === 'function' ? r(url) : r.clone()
  }) as typeof fetch
  const http = createHttp({
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms)
      t += ms
    },
    now: () => t,
  })
  return { http, sleeps, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers })

describe('finder http', () => {
  it('sends the user agent', async () => {
    const { http, calls } = setup([json({ a: 1 })])
    await http.getJson('https://example.com/a')
    await http.postJson('https://example.com/b', { q: 1 })
    expect(calls).toHaveLength(2)
    for (const c of calls) {
      expect(new Headers(c.init?.headers).get('user-agent')).toBe(USER_AGENT)
    }
    expect(calls[1].init?.method).toBe('POST')
    expect(calls[1].init?.body).toBe('{"q":1}')
  })

  it('exposes now()', () => {
    expect(createHttp({ now: () => 123 }).now()).toBe(123)
  })

  it('spaces requests per host', async () => {
    const s = setup([json({})])
    await s.http.getJson('https://example.com/a')
    expect(s.sleeps).toEqual([])
    await s.http.getJson('https://example.com/b')
    expect(s.sleeps).toEqual([500])
    await s.http.getJson('https://other.com/a')
    expect(s.sleeps).toEqual([500])
  })

  it('uses longer spacing for lever and workday', async () => {
    const s = setup([json({})])
    await s.http.getJson('https://api.lever.co/v0/postings/a')
    await s.http.getJson('https://api.lever.co/v0/postings/b')
    await s.http.getJson('https://x.wd1.myworkdayjobs.com/a')
    await s.http.getJson('https://x.wd1.myworkdayjobs.com/b')
    expect(s.sleeps).toEqual([1000, 2000])
  })

  it('retries 429 then succeeds', async () => {
    const s = setup([json('', 429), json('', 429), json({ ok: 1 })])
    const r = await s.http.getJson<{ ok: number }>('https://example.com/a')
    expect(r).toEqual({ ok: true, data: { ok: 1 }, status: 200 })
    expect(s.sleeps).toEqual([2000, 8000])
  })

  it('honors Retry-After', async () => {
    const s = setup([json('', 429, { 'Retry-After': '5' }), json({ ok: 1 })])
    const r = await s.http.getJson('https://example.com/a')
    expect(r.ok).toBe(true)
    expect(s.sleeps).toEqual([5000])
  })

  it('caps Retry-After at 60 s', async () => {
    const s = setup([json('', 503, { 'Retry-After': '600' }), json({})])
    await s.http.getJson('https://example.com/a')
    expect(s.sleeps).toEqual([60_000])
  })

  it('gives up after 3 retries', async () => {
    const s = setup([json('', 503)])
    const r = await s.http.getJson('https://example.com/a')
    expect(r).toEqual({ ok: false, status: 503, reason: 'HTTP 503 after 3 retries' })
    expect(s.sleeps).toEqual([2000, 8000, 30_000])
    expect(s.calls).toHaveLength(4)
  })

  it('404 is not retried', async () => {
    const s = setup([json('', 404)])
    const r = await s.http.getJson('https://example.com/a')
    expect(r).toEqual({ ok: false, status: 404, reason: 'HTTP 404' })
    expect(s.calls).toHaveLength(1)
  })

  it('bad JSON is a failure, not empty', async () => {
    const s = setup([json('<html>')])
    const r = await s.http.getJson('https://example.com/a')
    expect(r).toEqual({ ok: false, status: 200, reason: 'invalid JSON' })
  })

  it('reports network errors and timeouts', async () => {
    const net = Object.assign(new Error('x'), { cause: { code: 'ECONNRESET' } })
    const a = setup([net, net, net, net])
    expect(await a.http.getText('https://example.com/a')).toEqual({
      ok: false,
      reason: 'network error: ECONNRESET',
    })
    const to = Object.assign(new Error('t'), { name: 'TimeoutError' })
    const b = setup([to, json('hi')])
    expect(await b.http.getText('https://example.com/a')).toEqual({ ok: true, data: 'hi', status: 200 })
    const c = setup([to])
    expect(await c.http.getText('https://example.com/a')).toEqual({ ok: false, reason: 'timeout' })
  })

  describe('robotsAllows', () => {
    const robots = 'User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /wday/\nDisallow:\n'
    it('blocks disallowed prefixes only for the * group', async () => {
      const s = setup([new Response(robots)])
      expect(await s.http.robotsAllows('https://x.wd1.myworkdayjobs.com/wday/cxs/x/y/jobs')).toBe(false)
      expect(await s.http.robotsAllows('https://x.wd1.myworkdayjobs.com/en-US/x')).toBe(true)
      expect(s.calls).toHaveLength(1) // cached per host
      expect(s.calls[0].url).toBe('https://x.wd1.myworkdayjobs.com/robots.txt')
    })
    it('a missing robots.txt allows', async () => {
      const s = setup([json('', 404)])
      expect(await s.http.robotsAllows('https://x.wd1.myworkdayjobs.com/wday/cxs/x/y/jobs')).toBe(true)
    })
  })
})
