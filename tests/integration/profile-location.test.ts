import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

type TestUser = { id: string; email: string; client: SupabaseClient };

describe('profile location columns', () => {
  let u: TestUser;

  beforeAll(async () => {
    u = await createTestUser('profloc');
  });

  afterAll(async () => {
    if (u) await deleteTestUser(u.id, u.email);
  });

  it('us_state_from_location matches stateFromLocation', async () => {
    const cases: [string, string | null][] = [
      ['Atlanta, GA', 'GA'],
      ['austin, texas', 'TX'],
      ['Washington, D.C.', null],
      ['Washington, DC', 'DC'],
      ['Toronto, ON', null],
      ['', null],
      ['Georgia', 'GA'],
    ];
    for (const [t, want] of cases) {
      const { data, error } = await u.client.rpc('us_state_from_location', { t });
      expect(error).toBeNull();
      expect(data, t).toBe(want);
    }
  });

  it('rejects forged state, country and work style values on a direct update', async () => {
    const bad: Record<string, unknown>[] = [
      { work_states: ['ZZ'] },
      { work_countries: ['US'] },
      { work_countries: [null] },
      { work_countries: ['us'] },
      { work_style: 'hybrid' },
    ];
    for (const patch of bad) {
      const res = await u.client.from('profiles').update(patch).eq('user_id', u.id);
      expect(res.error?.code, JSON.stringify(patch)).toBe('23514');
    }
    const ok = await u.client
      .from('profiles')
      .update({ work_states: ['GA'], work_countries: ['CA'], work_style: 'either' })
      .eq('user_id', u.id);
    expect(ok.error).toBeNull();
  });

  it('still cannot update ai_mode', async () => {
    const upd = await u.client.from('profiles').update({ ai_mode: 'api' }).eq('user_id', u.id).select();
    expect(upd.error !== null || upd.data!.length === 0).toBe(true);
    const after = await adminClient().from('profiles').select('ai_mode').eq('user_id', u.id).single();
    expect(after.data!.ai_mode).toBe('off');
  });
});
