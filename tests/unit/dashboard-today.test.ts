import { describe, expect, it } from 'vitest';
import { rankToday, resumeNudge, type TaskRow } from '@/lib/dashboard/today';

const now = new Date('2026-11-08T12:00:00Z');
const day = 86_400_000;
const iso = (offsetDays: number) => new Date(now.getTime() + offsetDays * day).toISOString();

function task(over: Partial<TaskRow> & { id: string }): TaskRow {
  return {
    kind: 'other',
    title: over.id,
    due_at: null,
    status: 'open',
    snoozed_until: null,
    ref_table: null,
    ref_id: null,
    ...over,
  };
}

describe('rankToday', () => {
  it('puts an overdue follow_up before a future interview', () => {
    const out = rankToday(
      [
        task({ id: 'interview', kind: 'interview', due_at: iso(2) }),
        task({ id: 'follow', kind: 'follow_up', due_at: iso(-1) }),
      ],
      now,
    );
    expect(out.map((t) => t.id)).toEqual(['follow', 'interview']);
  });

  it('excludes tasks snoozed into the future and includes ones whose snooze has passed', () => {
    const out = rankToday(
      [
        task({ id: 'future', status: 'snoozed', snoozed_until: iso(1) }),
        task({ id: 'past', status: 'snoozed', snoozed_until: iso(-1) }),
        task({ id: 'done', status: 'done' }),
        task({ id: 'open' }),
      ],
      now,
    );
    expect(out.map((t) => t.id).sort()).toEqual(['open', 'past']);
  });

  it('orders by due date, nulls last', () => {
    const out = rankToday(
      [
        task({ id: 'none' }),
        task({ id: 'later', due_at: iso(5) }),
        task({ id: 'sooner', due_at: iso(1) }),
      ],
      now,
    );
    expect(out.map((t) => t.id)).toEqual(['sooner', 'later', 'none']);
  });

  it('breaks ties by kind priority', () => {
    const due = iso(1);
    const kinds = ['other', 'onboarding', 'outreach', 'follow_up', 'closing_soon', 'assessment', 'interview'] as const;
    const out = rankToday(kinds.map((kind) => task({ id: kind, kind, due_at: due })), now);
    expect(out.map((t) => t.id)).toEqual([
      'interview',
      'assessment',
      'closing_soon',
      'follow_up',
      'outreach',
      'onboarding',
      'other',
    ]);
  });
});

describe('resumeNudge', () => {
  it('is null when the user has an uploaded resume', () => {
    expect(resumeNudge({ hasResume: true, setupDone: true })).toBeNull();
    expect(resumeNudge({ hasResume: true, setupDone: false })).toBeNull();
  });

  it('points to the profile once setup is done, and to the resume step before', () => {
    const text = 'Add your resume so Pipeline can suggest answers and fields.';
    expect(resumeNudge({ hasResume: false, setupDone: true })).toEqual({ text, href: '/profile#resume' });
    expect(resumeNudge({ hasResume: false, setupDone: false })).toEqual({
      text,
      href: '/onboarding?step=resume',
    });
  });
});
