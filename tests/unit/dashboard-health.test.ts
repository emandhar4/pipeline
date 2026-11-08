import { describe, expect, it } from 'vitest';
import {
  agingOut,
  channelConversion,
  funnel,
  type AppRow,
  type EventRow,
} from '@/lib/dashboard/health';

const now = new Date('2026-11-08T12:00:00Z');
const day = 86_400_000;

function app(over: Partial<AppRow> & { id: string }): AppRow {
  return {
    stage: 'applied',
    outcome: null,
    channel: 'cold',
    applied_at: null,
    last_activity_at: now.toISOString(),
    company_name: 'Acme',
    title: 'Intern',
    ...over,
  };
}
const ev = (application_id: string, to_stage: EventRow['to_stage']): EventRow => ({
  application_id,
  from_stage: null,
  to_stage,
  occurred_at: now.toISOString(),
});

describe('funnel', () => {
  it('counts each application at every stage it reached, using events for closed ones', () => {
    const apps = [
      app({ id: 'a', stage: 'applied' }),
      app({ id: 'b', stage: 'screened' }),
      app({ id: 'c', stage: 'offer' }),
      app({ id: 'd', stage: 'closed', outcome: 'rejected' }),
      app({ id: 'e', stage: 'saved' }),
    ];
    const events = [ev('d', 'applied'), ev('d', 'screened'), ev('d', 'interviewed'), ev('d', 'closed')];
    const out = Object.fromEntries(funnel(apps, events).map((s) => [s.stage, s.count]));
    expect(out).toEqual({ applied: 4, screened: 3, interviewed: 2, final: 1, offer: 1 });
  });

  it('treats closed with no events as applied', () => {
    const out = funnel([app({ id: 'x', stage: 'closed' })], []);
    expect(out.map((s) => s.count)).toEqual([1, 0, 0, 0, 0]);
  });

  it('is all zeros with no applications', () => {
    expect(funnel([], []).every((s) => s.count === 0)).toBe(true);
  });
});

describe('channelConversion', () => {
  it('counts applied and advanced per channel', () => {
    const out = channelConversion([
      app({ id: '1', channel: 'cold', stage: 'applied' }),
      app({ id: '2', channel: 'cold', stage: 'screened' }),
      app({ id: '3', channel: 'referral', stage: 'applied' }),
    ]);
    expect(out).toEqual({
      cold: { applied: 2, advanced: 1 },
      referral: { applied: 1, advanced: 0 },
    });
  });
});

describe('agingOut', () => {
  const at = (days: number, over: Partial<AppRow> = {}) =>
    app({ id: `d${days}`, last_activity_at: new Date(now.getTime() - days * day).toISOString(), ...over });

  it('splits at 30 and 45 days', () => {
    const out = agingOut([at(29), at(30), at(44), at(45)], now);
    expect(out.stale.map((a) => a.id)).toEqual(['d30', 'd44']);
    expect(out.noResponse.map((a) => a.id)).toEqual(['d45']);
  });

  it('skips rejected outcomes and offer stage', () => {
    const out = agingOut(
      [at(50, { id: 'r', outcome: 'rejected' }), at(50, { id: 'o', stage: 'offer' }), at(50, { id: 's', stage: 'saved' })],
      now,
    );
    expect(out).toEqual({ stale: [], noResponse: [] });
  });

  it('falls back to applied_at when last_activity_at is null', () => {
    const applied = new Date(now.getTime() - 31 * day).toISOString().slice(0, 10);
    const a = app({ id: 'n', last_activity_at: null, applied_at: applied });
    expect(agingOut([a], now).stale.map((x) => x.id)).toEqual(['n']);
    expect(agingOut([app({ id: 'm', last_activity_at: null })], now)).toEqual({ stale: [], noResponse: [] });
  });

  it('uses whole days (floor)', () => {
    const a = app({ id: 'f', last_activity_at: new Date(now.getTime() - 29.9 * day).toISOString() });
    expect(agingOut([a], now).stale).toEqual([]);
  });
});
