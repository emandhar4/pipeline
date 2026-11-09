import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * A tiny in-memory stand-in for the Supabase query builder, enough for src/finder/store.ts:
 * select/insert/upsert/update with eq, neq, gt, in, is, not-is-null, order, range, limit, single.
 * Rows are plain objects keyed by table; ids are generated on insert.
 */
export type Tables = Record<string, Record<string, unknown>[]>

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean
type Op =
  | { kind: 'select' }
  | { kind: 'insert'; rows: Row[] }
  | { kind: 'upsert'; rows: Row[]; onConflict: string[] }
  | { kind: 'update'; patch: Row }

let nextId = 1

class Query {
  private filters: Filter[] = []
  private returns = false
  private one: 'single' | 'maybe' | null = null
  private lim: number | null = null
  private from: number | null = null
  private to: number | null = null

  constructor(
    private db: Tables,
    private table: string,
    private op: Op,
  ) {}

  select() {
    this.returns = true
    return this
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v)
    return this
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v)
    return this
  }
  gt(col: string, v: number) {
    this.filters.push((r) => (r[col] as number) > v)
    return this
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]))
    return this
  }
  is(col: string, v: null) {
    this.filters.push((r) => (r[col] ?? null) === v)
    return this
  }
  not(col: string, _op: 'is', v: null) {
    this.filters.push((r) => (r[col] ?? null) !== v)
    return this
  }
  order() {
    return this
  }
  limit(n: number) {
    this.lim = n
    return this
  }
  range(from: number, to: number) {
    this.from = from
    this.to = to
    return this
  }
  single() {
    this.one = 'single'
    return this
  }
  maybeSingle() {
    this.one = 'maybe'
    return this
  }

  private run(): { data: unknown; error: { message: string } | null } {
    const rows = (this.db[this.table] ??= [])
    let out: Row[]
    const op = this.op
    if (op.kind === 'select') {
      out = rows.filter((r) => this.filters.every((f) => f(r)))
      if (this.from !== null) out = out.slice(this.from, this.to! + 1)
      if (this.lim !== null) out = out.slice(0, this.lim)
    } else if (op.kind === 'insert') {
      out = op.rows.map((r) => ({ id: `id-${nextId++}`, ...r }))
      rows.push(...out)
    } else if (op.kind === 'upsert') {
      out = op.rows.map((r) => {
        const hit = rows.find((e) => op.onConflict.every((c) => e[c] === r[c]))
        if (hit) return Object.assign(hit, r)
        const fresh = { id: `id-${nextId++}`, ...r }
        rows.push(fresh)
        return fresh
      })
    } else {
      out = rows.filter((r) => this.filters.every((f) => f(r)))
      out.forEach((r) => Object.assign(r, op.patch))
    }
    out = out.map((r) => ({ ...r }))
    if (this.one) {
      if (out.length > 1 || (this.one === 'single' && out.length === 0)) return { data: null, error: { message: 'not one row' } }
      return { data: out[0] ?? null, error: null }
    }
    return { data: op.kind === 'select' || this.returns ? out : null, error: null }
  }

  then<A, B>(ok: (v: { data: unknown; error: { message: string } | null }) => A, bad?: (e: unknown) => B) {
    return Promise.resolve(this.run()).then(ok, bad)
  }
}

export function fakeSupabase(db: Tables): SupabaseClient<Database> {
  const client = {
    from: (table: string) => ({
      select: () => new Query(db, table, { kind: 'select' }),
      insert: (rows: Row | Row[]) => new Query(db, table, { kind: 'insert', rows: [rows].flat() }),
      upsert: (rows: Row | Row[], opts: { onConflict: string }) =>
        new Query(db, table, { kind: 'upsert', rows: [rows].flat(), onConflict: opts.onConflict.split(',') }),
      update: (patch: Row) => new Query(db, table, { kind: 'update', patch }),
    }),
    rpc: async () => ({ data: null, error: null }),
  }
  return client as unknown as SupabaseClient<Database>
}
