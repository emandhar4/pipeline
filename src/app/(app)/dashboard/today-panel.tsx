import Link from 'next/link';
import { getTasks } from '@/lib/dashboard/queries';
import { isOverdue, rankToday, resumeNudge, type TaskKind } from '@/lib/dashboard/today';
import { getOnboardingState } from '@/lib/onboarding/profile';
import { latestResume } from '../onboarding/data';

const KIND_LABEL: Record<TaskKind, string> = {
  interview: 'Interview',
  assessment: 'Assessment',
  closing_soon: 'Closing soon',
  follow_up: 'Follow up',
  outreach: 'Outreach',
  onboarding: 'Getting started',
  other: 'Task',
};

const dueFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export async function TodayPanel() {
  const [tasks, resume, onboarding] = await Promise.all([
    getTasks(),
    latestResume(),
    getOnboardingState(),
  ]);
  const now = new Date();
  const items = rankToday(tasks, now);
  // Derived, not a task row; it goes away once a resume has been read.
  const nudge = resumeNudge({ hasResume: !!resume, setupDone: onboarding.step >= 2 });

  return (
    <section aria-labelledby="today-title" className="panel">
      <h2 id="today-title" className="panel-title">
        Today
      </h2>
      {items.length === 0 ? (
        <p className="panel-note">Nothing due. New tasks appear here as you apply and hear back.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {items.map((t) => {
            const overdue = isOverdue(t, now);
            return (
              <li key={t.id} className="flex items-baseline gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.title ?? 'Untitled task'}</span>
                  <span className="text-muted">{KIND_LABEL[t.kind ?? 'other']}</span>
                </span>
                {t.due_at ? (
                  <span className={overdue ? 'shrink-0 font-medium text-danger' : 'shrink-0 text-muted'}>
                    {overdue ? 'Overdue, ' : 'Due '}
                    {dueFormat.format(new Date(t.due_at))}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {nudge ? (
        <ul className={items.length === 0 ? 'mt-3' : 'divide-y divide-line border-t border-line'}>
          <li className="flex items-baseline gap-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <Link
                href={nudge.href}
                className="block font-medium underline decoration-line underline-offset-4 hover:decoration-foreground/40"
              >
                {nudge.text}
              </Link>
              <span className="text-muted">{KIND_LABEL.onboarding}</span>
            </span>
          </li>
        </ul>
      ) : null}
    </section>
  );
}
