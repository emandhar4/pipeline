'use client';

import { useTransition } from 'react';
import { setMatchState } from './match-actions';

export function MatchButtons({
  matchId,
  title,
  saved,
}: {
  matchId: string;
  title: string;
  saved: boolean;
}) {
  const [pending, start] = useTransition();
  const run = (state: 'saved' | 'new' | 'hidden') => start(() => void setMatchState(matchId, state));
  return (
    <span className="flex shrink-0 gap-1.5">
      <button
        type="button"
        className="btn-secondary btn-small"
        disabled={pending}
        aria-label={`${saved ? 'Unsave' : 'Save'} ${title}`}
        onClick={() => run(saved ? 'new' : 'saved')}
      >
        {saved ? 'Unsave' : 'Save'}
      </button>
      <button
        type="button"
        className="btn-secondary btn-small"
        disabled={pending}
        aria-label={`Hide ${title}`}
        onClick={() => run('hidden')}
      >
        Hide
      </button>
    </span>
  );
}
