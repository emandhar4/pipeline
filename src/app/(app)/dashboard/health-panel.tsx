import { agingOut, channelConversion, daysSinceActivity, funnel, type AppRow } from '@/lib/dashboard/health';
import { getApplicationsWithEvents } from '@/lib/dashboard/queries';

const STAGE_LABEL = {
  applied: 'Applied',
  screened: 'Screened',
  interviewed: 'Interviewed',
  final: 'Final round',
  offer: 'Offer',
} as const;

function AgingList({ title, apps, now, empty }: { title: string; apps: AppRow[]; now: Date; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      {apps.length === 0 ? (
        <p className="mt-1 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {apps.map((a) => (
            <li key={a.id} className="flex items-baseline gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{a.company_name ?? 'Unnamed company'}</span>
                {a.title ? <span className="text-muted">, {a.title}</span> : null}
              </span>
              <span className="shrink-0 text-muted">{daysSinceActivity(a, now)} days quiet</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function rate(c: { applied: number; advanced: number }) {
  return c.applied === 0 ? 'none yet' : `${Math.round((c.advanced / c.applied) * 100)}%`;
}

export async function HealthPanel() {
  const { apps, events } = await getApplicationsWithEvents();
  const now = new Date();
  const stages = funnel(apps, events);
  const channels = channelConversion(apps, events);
  const { stale, noResponse } = agingOut(apps, now);
  const max = Math.max(1, ...stages.map((s) => s.count));
  const hasApps = stages[0].count > 0;

  return (
    <section aria-labelledby="health-title" className="panel">
      <h2 id="health-title" className="panel-title">
        Pipeline health
      </h2>
      {!hasApps ? <p className="panel-note">Applications you add will show up here.</p> : null}

      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">Where applications got to</h3>
          <ul className="mt-3 space-y-2.5">
            {stages.map((s) => (
              <li key={s.stage} className="grid grid-cols-[6.5rem_1fr_1.5rem] items-center gap-3 text-sm">
                <span className="text-muted">{STAGE_LABEL[s.stage]}</span>
                <span className="bar-track" aria-hidden="true">
                  <span className="bar-fill block" style={{ width: `${(s.count / max) * 100}%` }} />
                </span>
                <span className="text-right font-medium tabular-nums">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-medium">Cold applications vs referrals</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {(
              [
                ['Cold', channels.cold],
                ['Referral', channels.referral],
              ] as const
            ).map(([label, c]) => (
              <div key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="mt-0.5 font-medium">
                  {c.advanced} of {c.applied} reached a screen
                </dd>
                <dd className="text-muted">{rate(c)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {stale.length + noResponse.length > 0 ? (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <AgingList title="Going stale" apps={stale} now={now} empty="Nothing here." />
          <AgingList title="No response yet" apps={noResponse} now={now} empty="Nothing here." />
        </div>
      ) : null}
    </section>
  );
}
