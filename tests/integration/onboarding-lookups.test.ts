import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

// lookups.ts is server-only; here it only needs the client passed in.
vi.mock('server-only', () => ({}));

import { resolveStepOneLookups } from '@/lib/onboarding/lookups';
import { step1Schema, type Step1 } from '@/lib/onboarding/schema';

type Client = Parameters<typeof resolveStepOneLookups>[0];

let user: { id: string; email: string; client: SupabaseClient };
let gaTechId: string | null = null;

beforeAll(async () => {
  user = await createTestUser('onb-lookups');
  const { data, error } = await adminClient()
    .from('schools')
    .select('id')
    .eq('name', 'Georgia Institute of Technology-Main Campus')
    .maybeSingle();
  if (error) throw new Error(`school lookup failed: ${error.message}`);
  gaTechId = data?.id ?? null;
});

afterAll(async () => {
  if (user) await deleteTestUser(user.id, user.email);
});

function step1(over: Partial<Record<string, unknown>> = {}): Step1 {
  return step1Schema.parse({
    career_stage: 'intern',
    school: '',
    school_id: '',
    major: '',
    major_cip: '',
    grad_date: '',
    work_auth: 'citizen_or_pr',
    home_location: '',
    home_state: '',
    school_location: '',
    school_state: '',
    work_anywhere_us: true,
    work_states: [],
    work_countries: [],
    work_style: 'either',
    ...over,
  });
}

const client = () => user.client as unknown as Client;

describe('resolveStepOneLookups', () => {
  it('replaces the school label with the database name', async (ctx) => {
    if (!gaTechId) return ctx.skip();
    const r = await resolveStepOneLookups(client(), step1({ school_id: gaTechId, school: 'whatever' }));
    expect(r).toEqual({
      ok: true,
      value: expect.objectContaining({
        school_id: gaTechId,
        school: 'Georgia Institute of Technology-Main Campus',
      }),
    });
  });

  it('rejects an unknown school id', async () => {
    const r = await resolveStepOneLookups(
      client(),
      step1({ school_id: crypto.randomUUID(), school: 'Made Up' }),
    );
    expect(r).toEqual({
      ok: false,
      errors: { school: 'Pick your school from the list again, or use what you typed.' },
    });
  });

  it('replaces the major label with the CIP title', async () => {
    const r = await resolveStepOneLookups(client(), step1({ major_cip: '52.0203', major: 'x' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.major_cip).toBe('52.0203');
    expect(r.value.major).not.toBe('x');
    expect(r.value.major.toLowerCase()).toContain('supply chain');
  });

  it('rejects an unknown CIP code', async () => {
    const r = await resolveStepOneLookups(client(), step1({ major_cip: '99.9999', major: 'Nope' }));
    expect(r).toEqual({
      ok: false,
      errors: { major: 'Pick your major from the list again, or use what you typed.' },
    });
  });

  it('leaves free text alone', async () => {
    const input = step1({ school: 'Universidad de Ejemplo', major: 'Basket Weaving' });
    const r = await resolveStepOneLookups(client(), input);
    expect(r).toEqual({ ok: true, value: input });
  });
});
