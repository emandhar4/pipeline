'use client';

import { useState, useTransition } from 'react';
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
  const [error, setError] = useState(false);
  const run = (state: 'saved' | 'new' | 'hidden') =>
    start(async () => {
      setError(false);
      const r = await setMatchState(matchId, state);
      if (!r.ok) setError(true);
    });
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
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
      {error ? (
        <span role="alert" className="field-error">
          Couldn&apos;t update this posting. Try again.
        </span>
      ) : null}
    </span>
  );
}
