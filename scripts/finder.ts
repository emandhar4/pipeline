// Usage: npx tsx scripts/finder.ts [--only simplify,greenhouse:<token>] [--dry-run] [--resolve-limit 150] [--trigger manual|schedule]
// The daily finder. Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (from .env.local when present,
// else the environment). Logs counts, sources, scopes and company names only: Actions logs are public.
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/database.types'
import { createHttp } from '../src/finder/http'
import { runFinder, type RunOptions, type RunSummary } from '../src/finder/run'
import { createSupabaseStore } from '../src/finder/store'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

function parseArgs(argv: string[]): RunOptions {
  const opts: RunOptions = { trigger: 'manual' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${a} needs a value`)
      return v
    }
    if (a === '--dry-run') opts.dryRun = true
    else if (a === '--only') opts.only = value().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--resolve-limit') {
      const n = Number(value())
      if (!Number.isInteger(n) || n < 0) throw new Error('--resolve-limit must be a whole number')
      opts.resolveLimit = n
    } else if (a === '--trigger') {
      const t = value()
      if (t !== 'manual' && t !== 'schedule') throw new Error('--trigger must be manual or schedule')
      opts.trigger = t
    } else throw new Error(`Unknown argument ${a}`)
  }
  return opts
}

function printSummary(s: RunSummary): void {
  const bySource = new Map<string, { ok: number; failed: number; skipped: number; found: number; new: number }>()
  for (const x of s.scopes) {
    const row = bySource.get(x.source) ?? { ok: 0, failed: 0, skipped: 0, found: 0, new: 0 }
    if (x.status === 'ok' || x.status === 'failed' || x.status === 'skipped') row[x.status]++
    row.found += x.found
    row.new += x.new
    bySource.set(x.source, row)
  }
  const cols = ['source', 'ok', 'failed', 'skipped', 'found', 'new']
  const rows = [...bySource.entries()].map(([src, r]) => [src, r.ok, r.failed, r.skipped, r.found, r.new].map(String))
  const width = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => r[i].length)))
  const line = (cells: string[]) => cells.map((c, i) => (i === 0 ? c.padEnd(width[i]) : c.padStart(width[i]))).join('  ')
  console.log('')
  console.log(line(cols))
  rows.forEach((r) => console.log(line(r)))
  const t = s.totals
  console.log(`\nTotals: found ${t.found}, new ${t.new}, seen ${t.seen}, gone ${t.gone}, failed scopes ${t.failed_scopes}`)

  const failed = s.scopes.filter((x) => x.status === 'failed')
  if (failed.length) {
    console.log(`\nFailed scopes (${failed.length}):`)
    for (const f of failed) console.log(`  ${f.scope}: ${f.reason ?? 'unknown error'}`)
  }
  const partial = s.scopes.filter((x) => x.status === 'skipped')
  if (partial.length) {
    console.log(`\nSkipped scopes (${partial.length}):`)
    for (const p of partial) console.log(`  ${p.scope}: ${p.reason ?? 'skipped'}`)
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
  const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const started = Date.now()
  const summary = await runFinder(
    { http: createHttp(), store: createSupabaseStore(client), log: (l) => console.log(l) },
    opts,
  )
  printSummary(summary)
  console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)} s.`)
}

main().catch((err: unknown) => {
  console.error(`Finder crashed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
