// Usage: npx tsx scripts/set-ai-mode.ts <email> queue|off [--test]
// Sets profiles.ai_mode for one user (users cannot change it themselves). Service role, from
// .env.local or the environment. Refuses @example.test emails unless --test. Prints `ok` only.
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/database.types'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const USAGE = 'Usage: npx tsx scripts/set-ai-mode.ts <email> queue|off [--test]'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const args = process.argv.slice(2)
const test = args.includes('--test')
const positional = args.filter((a) => a !== '--test')
if (positional.length !== 2) fail(USAGE)
const email = positional[0].trim().toLowerCase()
const mode = positional[1]
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(USAGE)
if (mode !== 'queue' && mode !== 'off') fail(USAGE)
if (email.endsWith('@example.test') && !test) fail('Refusing an @example.test email without --test.')
if (!email.endsWith('@example.test') && test) fail('--test is only for @example.test emails.')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.')

async function findUserId(db: ReturnType<typeof createClient<Database>>): Promise<string | null> {
  // auth.users is not exposed over PostgREST; page through the admin API.
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) fail('Could not list users.')
    const hit = data.users.find((u) => u.email?.toLowerCase() === email)
    if (hit) return hit.id
    if (data.users.length < 1000) return null
  }
}

async function main(): Promise<void> {
  const db = createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } })
  const id = await findUserId(db)
  if (!id) fail('No user with that email.')
  const { data, error } = await db.from('profiles').update({ ai_mode: mode as 'queue' | 'off' }).eq('user_id', id).select('user_id')
  if (error || !data?.length) fail('Could not update the profile.')
  console.log('ok')
}

void main()
