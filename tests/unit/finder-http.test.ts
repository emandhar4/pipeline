import { describe, expect, it } from 'vitest'
import { createHttp, USER_AGENT } from '@/finder/http'

function setup(responses: Array<Response | Error | ((url: string) => Response)>) {
  let t = 1_000_000
  const sleeps: number[] = []
  const calls: Array<{ url: string; init?: RequestInit; at: number }> = []
  let i = 0
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init, at: t })
    const r = responses[Math.min(i++, responses.length - 1)]
    if (r instanceof Error) throw r
    if (typeof r === 'function') return r(url)
    // fresh response per call (a tee'd clone() never finishes cancel())
    return new Response(await r.clone().text(), { status: r.status, headers: r.headers })
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

  it('pauses every request to a throttled host (cooldown)', async () => {
    const s = setup([json('', 429), json({ ok: 1 })])
    const [a, b] = await Promise.all([
      s.http.getJson('https://example.com/a'),
      s.http.getJson('https://example.com/b'),
    ])
    expect(a.ok && b.ok).toBe(true)
    expect(s.calls).toHaveLength(3)
    const first = s.calls[0].at
    expect(s.calls[1].at - first).toBeGreaterThanOrEqual(2000)
    expect(s.calls[2].at - first).toBeGreaterThanOrEqual(2000)
  })

  it('honors spacing for concurrent requests and does not block other hosts', async () => {
    const s = setup([json({})])
    await Promise.all([
      s.http.getJson('https://example.com/1'),
      s.http.getJson('https://example.com/2'),
      s.http.getJson('https://example.com/3'),
      s.http.getJson('https://other.com/1'),
    ])
    const ex = s.calls.filter((c) => c.url.includes('example.com')).map((c) => c.at)
    expect(ex[1] - ex[0]).toBeGreaterThanOrEqual(500)
    expect(ex[2] - ex[1]).toBeGreaterThanOrEqual(500)
    const other = s.calls.find((c) => c.url.includes('other.com'))!
    expect(other.at - ex[0]).toBeLessThan(500)
  })

  it('computes HTTP-date Retry-After from the injected clock', async () => {
    const t0 = 1_000_000
    const date = new Date(t0 + 7000).toUTCString() // second precision
    const expected = Date.parse(date) - t0
    const s = setup([json('', 429, { 'Retry-After': date }), json({})])
    await s.http.getJson('https://example.com/a')
    expect(s.sleeps).toEqual([expected])
  })

  it('falls back to backoff on blank or invalid Retry-After', async () => {
    for (const v of ['   ', 'soon', '-5']) {
      const s = setup([json('', 429, { 'Retry-After': v }), json({})])
      await s.http.getJson('https://example.com/a')
      expect(s.sleeps).toEqual([2000])
    }
  })

  it('cancels unconsumed bodies on non-OK responses', async () => {
    let cancelled = 0
    const body = new ReadableStream({ cancel: () => void cancelled++ })
    const s = setup([new Response(body, { status: 404 })])
    // clone() would tee the stream, so serve the original response directly
    const http = createHttp({
      fetchImpl: (async () => new Response(body, { status: 404 })) as typeof fetch,
      sleep: async () => undefined,
    })
    expect(await http.getJson('https://example.com/a')).toEqual({ ok: false, status: 404, reason: 'HTTP 404' })
    expect(cancelled).toBe(1)
    expect(s.calls).toHaveLength(0)
  })

  it('returns invalid URL instead of throwing', async () => {
    const s = setup([json({})])
    expect(await s.http.getJson('not a url')).toEqual({ ok: false, reason: 'invalid URL' })
    expect(await s.http.postJson('::', {})).toEqual({ ok: false, reason: 'invalid URL' })
    expect(await s.http.getText('')).toEqual({ ok: false, reason: 'invalid URL' })
    expect(await s.http.robotsAllows('nope')).toBe(false)
    expect(s.calls).toHaveLength(0)
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
