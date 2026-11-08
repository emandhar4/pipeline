import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from './helpers';

// profile.ts is server-only and imports request-scoped helpers; we only call applyStepN here.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { applyStep1, applyStep2 } from '@/lib/onboarding/profile';
import { step1Schema, step2Schema } from '@/lib/onboarding/schema';

type TestUser = { id: string; email: string; client: SupabaseClient };

const f = (label: string, weight: 'primary' | 'secondary' = 'primary') => ({
  category_slug: null,
  label,
  weight,
});

describe('onboarding profile persistence', () => {
  const created: TestUser[] = [];
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await createTestUser('onbp-a');
    created.push(a);
    b = await createTestUser('onbp-b');
    created.push(b);
  });

  afterAll(async () => {
    for (const u of created) await deleteTestUser(u.id, u.email);
  });

  it('step 1 stores grad_date as the first of the month and sets the step', async () => {
    await applyStep1(
      a.client,
      a.id,
      step1Schema.parse({
        career_stage: 'intern', school: ' State U ', major: 'IE', grad_date: '2027-05',
        work_auth: 'citizen_or_pr', home_location: 'Austin', school_location: 'Dallas',
        in_state_school: true, relocate: 'anywhere',
      }),
    );
    const { data, error } = await a.client.from('profiles').select('*').eq('user_id', a.id).single();
    expect(error).toBeNull();
    expect(data?.grad_date).toBe('2027-05-01');
    expect(data?.school).toBe('State U');
    expect(data?.onboarding_step).toBe(1);
  });

  it('step 2 save replaces fields', async () => {
    const pay = { industries: [], pay_amount: '22.50', pay_period: 'hour', season: 'Summer 2027' };
    await applyStep2(
      a.client,
      a.id,
      step2Schema.parse({ ...pay, fields: [f('Consulting'), f('Energy'), f('Logistics', 'secondary')] }),
    );
    const three = await a.client.from('profile_fields').select('label');
    expect(three.data).toHaveLength(3);

    await applyStep2(
      a.client,
      a.id,
      step2Schema.parse({
        ...pay,
        industries: [{ industry: 'Energy', preference: 'prefer' }],
        fields: [f('Consulting')],
      }),
    );
    const one = await a.client.from('profile_fields').select('label');
    expect(one.data).toHaveLength(1);
    const inds = await a.client.from('profile_industries').select('industry');
    expect(inds.data).toHaveLength(1);

    const prof = await a.client.from('profiles').select('*').eq('user_id', a.id).single();
    expect(prof.data?.pay_floor_cents).toBe(2250);
    expect(prof.data?.pay_floor_period).toBe('hour');
    expect(prof.data?.season).toBe('Summer 2027');
    expect(prof.data?.onboarding_step).toBe(2);
  });

  it('never lowers onboarding_step, and a blank pay floor stores nulls', async () => {
    await applyStep1(
      a.client,
      a.id,
      step1Schema.parse({
        career_stage: 'intern', school: '', major: '', grad_date: '',
        work_auth: 'citizen_or_pr', home_location: '', school_location: '',
        in_state_school: false, relocate: 'no',
      }),
    );
    const p1 = await a.client.from('profiles').select('onboarding_step, grad_date').eq('user_id', a.id).single();
    expect(p1.data?.onboarding_step).toBe(2);
    expect(p1.data?.grad_date).toBeNull();

    await applyStep2(
      a.client,
      a.id,
      step2Schema.parse({ fields: [f('Consulting')], industries: [], pay_amount: '', pay_period: 'year', season: 'Full-time' }),
    );
    const p2 = await a.client.from('profiles').select('pay_floor_cents, pay_floor_period').eq('user_id', a.id).single();
    expect(p2.data).toEqual({ pay_floor_cents: null, pay_floor_period: null });
  });

  it("a user's step 2 save does not touch another user's rows", async () => {
    await applyStep2(
      b.client,
      b.id,
      step2Schema.parse({ fields: [f('Design'), f('Sales')], industries: [], pay_amount: '', pay_period: 'year', season: 'Fall 2027' }),
    );
    await applyStep2(
      a.client,
      a.id,
      step2Schema.parse({ fields: [f('Consulting')], industries: [], pay_amount: '', pay_period: 'year', season: 'Fall 2027' }),
    );
    const bRows = await b.client.from('profile_fields').select('label');
    expect(bRows.data).toHaveLength(2);
  });

  it('throws on a Supabase error instead of swallowing it', async () => {
    // user B writing with A's id is blocked by RLS on insert
    await expect(
      applyStep2(
        b.client,
        a.id,
        step2Schema.parse({ fields: [f('Design')], industries: [], pay_amount: '', pay_period: 'year', season: 'Fall 2027' }),
      ),
    ).rejects.toThrow();
  });
});
