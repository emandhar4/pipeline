import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient(): SupabaseClient {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), noSession);
}

export async function createTestUser(
  tag: string,
): Promise<{ id: string; email: string; client: SupabaseClient }> {
  const admin = adminClient();
  const email = `pipeline-test+${tag}-${randomBytes(4).toString('hex')}@example.test`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) {
    throw new Error(`createUser failed: ${created.error?.message}`);
  }
  const id = created.data.user.id;

  try {
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error || !link.data.properties) {
      throw new Error(`generateLink failed: ${link.error?.message}`);
    }
    const client = createClient(
      env('NEXT_PUBLIC_SUPABASE_URL'),
      env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
      noSession,
    );
    const verified = await client.auth.verifyOtp({
      token_hash: link.data.properties.hashed_token,
      type: 'magiclink',
    });
    if (verified.error) throw new Error(`verifyOtp failed: ${verified.error.message}`);
    return { id, email, client };
  } catch (err) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
    throw err;
  }
}

export async function deleteTestUser(id: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);
}
