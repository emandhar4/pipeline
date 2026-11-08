import { getTasks } from '@/lib/dashboard/queries';
import { isOverdue, rankToday, type TaskKind } from '@/lib/dashboard/today';

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
  const tasks = await getTasks();
  const now = new Date();
  const items = rankToday(tasks, now);

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
    </section>
  );
}
