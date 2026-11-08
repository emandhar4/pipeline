import type { Database } from '@/lib/database.types';

export type TaskKind = Database['public']['Enums']['task_kind'];

export type TaskRow = {
  id: string;
  kind: TaskKind | null;
  title: string | null;
  due_at: string | null;
  status: Database['public']['Enums']['task_status'] | null;
  snoozed_until: string | null;
  ref_table: string | null;
  ref_id: string | null;
};

/** Lower number = shown first when due dates tie. */
const KIND_PRIORITY: Record<TaskKind, number> = {
  interview: 0,
  assessment: 1,
  closing_soon: 2,
  follow_up: 3,
  outreach: 4,
  onboarding: 5,
  other: 6,
};

function kindRank(kind: TaskKind | null): number {
  return kind ? KIND_PRIORITY[kind] : KIND_PRIORITY.other;
}

export function isOverdue(task: TaskRow, now: Date): boolean {
  return task.due_at !== null && new Date(task.due_at).getTime() < now.getTime();
}

/** Open tasks plus snoozed ones whose snooze has ended: overdue first, then due date (nulls last), then kind. */
export function rankToday(tasks: TaskRow[], now: Date): TaskRow[] {
  const t = now.getTime();
  const visible = tasks.filter((task) => {
    if (task.status === 'open' || task.status === null) return true;
    if (task.status === 'snoozed') {
      return task.snoozed_until !== null && new Date(task.snoozed_until).getTime() <= t;
    }
    return false;
  });
  const due = (task: TaskRow) => (task.due_at ? new Date(task.due_at).getTime() : Infinity);
  return visible.sort((a, b) => {
    const overdueDiff = Number(isOverdue(b, now)) - Number(isOverdue(a, now));
    if (overdueDiff !== 0) return overdueDiff;
    if (due(a) !== due(b)) return due(a) < due(b) ? -1 : 1;
    return kindRank(a.kind) - kindRank(b.kind);
  });
}
