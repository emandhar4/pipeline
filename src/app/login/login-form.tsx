'use client';

import { useActionState } from 'react';
import { sendEmailLink, signInWithGoogle, type EmailLinkState } from './actions';

const initial: EmailLinkState = { status: 'idle' };

export function LoginForm({ next, error }: { next: string; error: string | null }) {
  const [state, emailAction, sending] = useActionState(sendEmailLink, initial);
  const message = state.status === 'error' ? state.message : error;

  return (
    <div className="flex flex-col gap-6">
      {message ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {message}
        </p>
      ) : null}

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="btn-primary w-full">
          Continue with Google
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      {state.status === 'sent' ? (
        <p role="status" className="text-sm text-muted">
          Check <span className="font-medium text-foreground">{state.email}</span> for a sign-in
          link.
        </p>
      ) : (
        <form action={emailAction} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="field"
          />
          <button type="submit" disabled={sending} className="btn-secondary">
            {sending ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      )}
    </div>
  );
}
