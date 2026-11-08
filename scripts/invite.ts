// Usage: npx tsx scripts/invite.ts <email> [--note "..."]
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const args = process.argv.slice(2);
const noteIdx = args.indexOf('--note');
const note = noteIdx >= 0 ? args[noteIdx + 1] : undefined;
const positional = args.filter((_, i) => noteIdx < 0 || (i !== noteIdx && i !== noteIdx + 1));
const email = positional[0]?.trim().toLowerCase();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npx tsx scripts/invite.ts <email> [--note "..."]');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

async function main(): Promise<void> {
  const supabase = createClient(url!, key!, { auth: { persistSession: false } });
  const { error } = await supabase
    .from('invites')
    .upsert({ email, note: note ?? null }, { onConflict: 'email' });
  if (error) {
    console.error(`Failed to invite: ${error.message}`);
    process.exit(1);
  }
  console.log(`Invited ${email}`);
}

void main();
