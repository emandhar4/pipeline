export const USER_AGENT = 'PipelineFinder/1.0 (+https://github.com/emandhar4/pipeline)'

export type FetchResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; reason: string; status?: number }

export interface Http {
  getJson<T>(url: string): Promise<FetchResult<T>>
  postJson<T>(url: string, body: unknown): Promise<FetchResult<T>>
  getText(url: string): Promise<FetchResult<string>>
  robotsAllows(url: string): Promise<boolean>
  now(): number
}

export interface HttpOptions {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  /** Overrides keyed by exact hostname; `*.suffix` keys match any subdomain. */
  spacingMs?: Record<string, number>
}

const DEFAULT_SPACING_MS = 500
const DEFAULT_SPACING_RULES: Record<string, number> = {
  'api.lever.co': 1000,
  '*.myworkdayjobs.com': 2000,
}
const BACKOFF_MS = [2000, 8000, 30_000]
const MAX_RETRY_AFTER_MS = 60_000
const TIMEOUT_MS = 30_000

function spacingFor(host: string, rules: Record<string, number>): number {
  if (host in rules) return rules[host]
  for (const [pattern, ms] of Object.entries(rules)) {
    if (pattern.startsWith('*.') && host.endsWith(pattern.slice(1))) return ms
  }
  return DEFAULT_SPACING_MS
}

function retryAfterMs(header: string | null, nowMs: number): number | null {
  const value = header?.trim()
  if (!value) return null
  if (/^\d+(\.\d+)?$/.test(value)) return Math.min(Number(value) * 1000, MAX_RETRY_AFTER_MS)
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return null
  const date = Date.parse(value)
  if (Number.isNaN(date)) return null
  return Math.min(Math.max(date - nowMs, 0), MAX_RETRY_AFTER_MS)
}

function describeError(err: unknown): { retryable: true; reason: string } {
  const e = err as { name?: string; code?: string; cause?: { code?: string } } | null
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return { retryable: true, reason: 'timeout' }
  const code = e?.cause?.code ?? e?.code
  return { retryable: true, reason: `network error: ${code ?? 'unknown'}` }
}

/** Parses `User-agent: *` groups and returns their non-empty Disallow prefixes. */
function parseRobots(text: string): string[] {
  const disallow: string[] = []
  let agents: string[] = []
  let inRules = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === 'user-agent') {
      if (inRules) {
        agents = []
        inRules = false
      }
      agents.push(value.toLowerCase())
    } else if (key === 'disallow' || key === 'allow') {
      inRules = true
      if (key === 'disallow' && value && agents.includes('*')) disallow.push(value)
    }
  }
  return disallow
}

export function createHttp(opts: HttpOptions = {}): Http {
  const fetchImpl = opts.fetchImpl ?? fetch
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = opts.now ?? Date.now
  const rules = { ...DEFAULT_SPACING_RULES, ...opts.spacingMs }

  const tails = new Map<string, Promise<void>>()
  const lastAt = new Map<string, number>()
  const cooldownUntil = new Map<string, number>()

  /**
   * Holds the host's slot for one attempt (so concurrent callers queue behind it), waits for the
   * host spacing and any cooldown, and returns the release function.
   */
  async function acquire(host: string): Promise<() => void> {
    const prev = tails.get(host) ?? Promise.resolve()
    let release!: () => void
    const mine = new Promise<void>((r) => (release = r))
    tails.set(
      host,
      prev.then(() => mine),
    )
    await prev
    try {
      const t = now()
      const last = lastAt.get(host)
      const spacingWait = last === undefined ? 0 : spacingFor(host, rules) - (t - last)
      const coolWait = (cooldownUntil.get(host) ?? 0) - t
      const wait = Math.max(spacingWait, coolWait)
      if (wait > 0) await sleep(wait)
      lastAt.set(host, now())
    } catch (err) {
      release()
      throw err
    }
    return release
  }

  async function request(url: string, init: RequestInit): Promise<FetchResult<string>> {
    let host: string
    try {
      host = new URL(url).hostname
    } catch {
      return { ok: false, reason: 'invalid URL' }
    }
    let last: { reason: string; status?: number } = { reason: 'network error: unknown' }
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      const release = await acquire(host)
      let waitMs = BACKOFF_MS[attempt]
      try {
        const headers = new Headers(init.headers)
        headers.set('User-Agent', USER_AGENT)
        const res = await fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
        if (res.ok) return { ok: true, data: await res.text(), status: res.status }
        try {
          await res.body?.cancel()
        } catch {
          // body already consumed or locked
        }
        if (res.status !== 429 && res.status < 500) {
          return { ok: false, status: res.status, reason: `HTTP ${res.status}` }
        }
        waitMs = retryAfterMs(res.headers.get('retry-after'), now()) ?? waitMs
        last = { status: res.status, reason: `HTTP ${res.status} after ${BACKOFF_MS.length} retries` }
        if (attempt < BACKOFF_MS.length) cooldownUntil.set(host, now() + waitMs)
      } catch (err) {
        last = { reason: describeError(err).reason }
      } finally {
        release()
      }
      if (attempt < BACKOFF_MS.length) await sleep(waitMs)
    }
    return { ok: false, ...last }
  }

  async function json<T>(url: string, init: RequestInit): Promise<FetchResult<T>> {
    const res = await request(url, init)
    if (!res.ok) return res
    try {
      return { ok: true, data: JSON.parse(res.data) as T, status: res.status }
    } catch {
      return { ok: false, status: res.status, reason: 'invalid JSON' }
    }
  }

  const robotsCache = new Map<string, Promise<string[] | null>>()

  return {
    now,
    getJson: <T>(url: string) => json<T>(url, { headers: { Accept: 'application/json' } }),
    postJson: <T>(url: string, body: unknown) =>
      json<T>(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    getText: (url: string) => request(url, {}),
    async robotsAllows(url: string) {
      let u: URL
      try {
        u = new URL(url)
      } catch {
        return false
      }
      let rules = robotsCache.get(u.host)
      if (!rules) {
        rules = request(`${u.protocol}//${u.host}/robots.txt`, {}).then((r) => {
          if (r.ok) return parseRobots(r.data)
          // No robots.txt (4xx) allows everything; an unreachable one is treated as "do not crawl".
          return r.status !== undefined && r.status < 500 && r.status !== 429 ? [] : null
        })
        robotsCache.set(u.host, rules)
      }
      const prefixes = await rules
      if (prefixes === null) return false
      const path = u.pathname + u.search
      return !prefixes.some((p) => path.startsWith(p))
    },
  }
}
