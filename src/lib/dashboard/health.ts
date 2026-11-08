import type { Database } from '@/lib/database.types';

export type Stage = Database['public']['Enums']['app_stage'];
export type Channel = Database['public']['Enums']['app_channel'];

export type AppRow = {
  id: string;
  stage: Stage | null;
  outcome: Database['public']['Enums']['app_outcome'] | null;
  channel: Channel | null;
  applied_at: string | null;
  last_activity_at: string | null;
  company_name: string | null;
  title: string | null;
};

export type EventRow = {
  application_id: string;
  from_stage: Stage | null;
  to_stage: Stage | null;
  occurred_at: string | null;
};

export const FUNNEL_STAGES = ['applied', 'screened', 'interviewed', 'final', 'offer'] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

const ORDER: Record<FunnelStage, number> = { applied: 0, screened: 1, interviewed: 2, final: 3, offer: 4 };

function asFunnelStage(stage: Stage | null | undefined): FunnelStage | null {
  return stage && stage in ORDER ? (stage as FunnelStage) : null;
}

/**
 * The furthest funnel stage an application reached: the maximum over its current stage and its
 * events' to_stage, ignoring `saved` and `closed`. A closed application with no better evidence
 * counts as applied. Saved-only applications return null (not in the funnel).
 */
export function reachedStage(app: AppRow, events: EventRow[] = []): FunnelStage | null {
  let best: FunnelStage | null = asFunnelStage(app.stage);
  for (const e of events) {
    if (e.application_id !== app.id) continue;
    const s = asFunnelStage(e.to_stage);
    if (s && (best === null || ORDER[s] > ORDER[best])) best = s;
  }
  if (best === null && app.stage === 'closed') return 'applied';
  return best;
}

export function funnel(apps: AppRow[], events: EventRow[] = []): { stage: FunnelStage; count: number }[] {
  const byApp = new Map<string, EventRow[]>();
  for (const e of events) byApp.set(e.application_id, [...(byApp.get(e.application_id) ?? []), e]);
  const counts = FUNNEL_STAGES.map(() => 0);
  for (const app of apps) {
    const reached = reachedStage(app, byApp.get(app.id));
    if (reached === null) continue;
    for (let i = 0; i <= ORDER[reached]; i++) counts[i]++;
  }
  return FUNNEL_STAGES.map((stage, i) => ({ stage, count: counts[i] }));
}

type ChannelCount = { applied: number; advanced: number };

/** Per channel: applications sent, and how many reached screened or later. A missing channel is cold. */
export function channelConversion(
  apps: AppRow[],
  events: EventRow[] = [],
): { cold: ChannelCount; referral: ChannelCount } {
  const out = { cold: { applied: 0, advanced: 0 }, referral: { applied: 0, advanced: 0 } };
  for (const app of apps) {
    const reached = reachedStage(app, events);
    if (reached === null) continue;
    const bucket = app.channel === 'referral' ? out.referral : out.cold;
    bucket.applied++;
    if (ORDER[reached] >= ORDER.screened) bucket.advanced++;
  }
  return out;
}

const OPEN_STAGES: Stage[] = ['applied', 'screened', 'interviewed', 'final'];
const DAY_MS = 86_400_000;
export const STALE_DAYS = 30;
export const NO_RESPONSE_DAYS = 45;

export function daysSinceActivity(app: AppRow, now: Date): number | null {
  if (!app.last_activity_at) return null;
  return Math.floor((now.getTime() - new Date(app.last_activity_at).getTime()) / DAY_MS);
}

/** Live applications gone quiet: 30-44 days is stale, 45+ is no response. Never "rejected". */
export function agingOut(apps: AppRow[], now: Date): { stale: AppRow[]; noResponse: AppRow[] } {
  const stale: AppRow[] = [];
  const noResponse: AppRow[] = [];
  for (const app of apps) {
    if (app.outcome !== null || !app.stage || !OPEN_STAGES.includes(app.stage)) continue;
    const days = daysSinceActivity(app, now);
    if (days === null) continue;
    if (days >= NO_RESPONSE_DAYS) noResponse.push(app);
    else if (days >= STALE_DAYS) stale.push(app);
  }
  return { stale, noResponse };
}
