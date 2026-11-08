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
  let c: TestUser;

  beforeAll(async () => {
    a = await createTestUser('onbp-a');
    created.push(a);
    b = await createTestUser('onbp-b');
    created.push(b);
    c = await createTestUser('onbp-c');
    created.push(c);
  });

  afterAll(async () => {
    for (const u of created) await deleteTestUser(u.id, u.email);
  });

  it('step 1 stores grad_date as the first of the month and sets the step', async () => {
    await applyStep1(
      a.client,
      a.id,
      step1Schema.parse({
        career_stage: 'intern', school: ' State U ', school_id: '', major: 'IE', major_cip: '',
        grad_date: '2027-05', work_auth: 'citizen_or_pr', home_location: 'Austin', home_state: '',
        school_location: 'Dallas', school_state: '', work_anywhere_us: true, work_states: [],
        work_countries: [], open_to_remote: false,
      }),
    );
    const { data, error } = await a.client.from('profiles').select('*').eq('user_id', a.id).single();
    expect(error).toBeNull();
    expect(data?.grad_date).toBe('2027-05-01');
    expect(data?.school).toBe('State U');
    expect(data?.onboarding_step).toBe(1);
  });

  it('step 1 stores structured locations', async () => {
    await applyStep1(
      b.client,
      b.id,
      step1Schema.parse({
        career_stage: 'intern', school: 'State U', school_id: '', major: 'IE', major_cip: '',
        grad_date: '2027-05', work_auth: 'citizen_or_pr', home_location: 'Atlanta, GA', home_state: 'GA',
        school_location: 'Knoxville, TN', school_state: 'TN', work_anywhere_us: false,
        work_states: ['TN', 'GA'], work_countries: ['CA'], open_to_remote: false,
      }),
    );
    const { data, error } = await b.client
      .from('profiles')
      .select('home_state, school_state, in_state_school, work_anywhere_us, work_states, work_countries, open_to_remote, school_id, major_cip')
      .eq('user_id', b.id)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({
      home_state: 'GA',
      school_state: 'TN',
      in_state_school: false,
      work_anywhere_us: false,
      work_states: ['GA', 'TN'],
      work_countries: ['CA'],
      open_to_remote: false,
      school_id: null,
      major_cip: null,
    });
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

  it('does not mark step 2 done when a later write fails', async () => {
    await expect(
      applyStep2(
        c.client,
        c.id,
        step2Schema.parse({
          fields: [{ category_slug: 'no-such-category', label: 'X', weight: 'primary' }],
          industries: [],
          pay_amount: '30',
          pay_period: 'hour',
          season: 'Summer 2027',
        }),
      ),
    ).rejects.toThrow();
    const prof = await c.client.from('profiles').select('onboarding_step, pay_floor_cents').eq('user_id', c.id).single();
    expect(prof.data?.onboarding_step).toBe(0);
    expect(prof.data?.pay_floor_cents).toBe(3000);

    await applyStep2(
      c.client,
      c.id,
      step2Schema.parse({ fields: [f('Design')], industries: [], pay_amount: '', pay_period: 'year', season: 'Fall 2027' }),
    );
    const ok = await c.client.from('profiles').select('onboarding_step').eq('user_id', c.id).single();
    expect(ok.data?.onboarding_step).toBe(2);
  });

  it('never lowers onboarding_step, and a blank pay floor stores nulls', async () => {
    await applyStep1(
      a.client,
      a.id,
      step1Schema.parse({
        career_stage: 'intern', school: '', school_id: '', major: '', major_cip: '', grad_date: '',
        work_auth: 'citizen_or_pr', home_location: '', home_state: '', school_location: '',
        school_state: '', work_anywhere_us: false, work_states: [], work_countries: [],
        open_to_remote: true,
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
    // With A's id, B's profile update and deletes match no rows (RLS filters them, no error);
    // the insert violates RLS and must surface as a thrown error.
    await expect(
      applyStep2(
        b.client,
        a.id,
        step2Schema.parse({ fields: [f('Design')], industries: [], pay_amount: '', pay_period: 'year', season: 'Fall 2027' }),
      ),
    ).rejects.toThrow();
  });
});
