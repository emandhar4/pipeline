'use client';

import { useActionState, useState } from 'react';
import { removeBar, saveBar, type BarFormState } from './bar-actions';

export type SavedBar = {
  company: string | null;
  role: string | null;
  pay_cents: number | null;
  pay_period: string | null;
};

/** "$30/hr" or "$85000/yr", the way a user would type it back. */
export function payText(cents: number | null, period: string | null): string {
  if (cents === null) return '';
  const dollars = cents / 100;
  const n = Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
  return `$${n}/${period === 'hour' ? 'hr' : 'yr'}`;
}

/** Remounts the form (dropping its action state) whenever a saved bar is removed. */
export function BarSection({ bar }: { bar: SavedBar | null }) {
  const [generation, setGeneration] = useState(0);
  const [hadBar, setHadBar] = useState(bar !== null);
  if (hadBar !== (bar !== null)) {
    setHadBar(bar !== null);
    if (bar === null) setGeneration((g) => g + 1);
  }
  return <BarForm key={generation} bar={bar} />;
}

function BarForm({ bar }: { bar: SavedBar | null }) {
  const [state, action, pending] = useActionState<BarFormState, FormData>(saveBar, {});
  const company = state.values?.company ?? bar?.company ?? '';
  const role = state.values?.role ?? bar?.role ?? '';
  const pay = state.values?.pay ?? payText(bar?.pay_cents ?? null, bar?.pay_period ?? null);
  return (
    <section id="bar" aria-labelledby="bar-heading" className="mt-16 flex flex-col gap-6">
      <h2 id="bar-heading" className="scroll-mt-6 text-lg font-semibold tracking-tight">
        Your bar
      </h2>
      <p className="max-w-prose text-sm text-muted">
        Already holding an offer? Postings must clearly beat it on role, pay or brand to show as worth it.
      </p>
      <form key={JSON.stringify(bar)} action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bar-company" className="text-sm font-medium">Company</label>
          <input
            id="bar-company"
            name="company"
            maxLength={120}
            defaultValue={company}
            autoComplete="off"
            className="field"
            aria-invalid={state.errors?.company ? true : undefined}
            aria-describedby={state.errors?.company ? 'bar-company-error' : undefined}
          />
          {state.errors?.company ? <p id="bar-company-error" className="field-error">{state.errors.company}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bar-role" className="text-sm font-medium">Role</label>
          <input
            id="bar-role"
            name="role"
            maxLength={120}
            defaultValue={role}
            autoComplete="off"
            className="field"
            aria-invalid={state.errors?.role ? true : undefined}
            aria-describedby={state.errors?.role ? 'bar-role-error' : undefined}
          />
          {state.errors?.role ? <p id="bar-role-error" className="field-error">{state.errors.role}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bar-pay" className="text-sm font-medium">Pay</label>
          <input
            id="bar-pay"
            name="pay"
            maxLength={40}
            defaultValue={pay}
            autoComplete="off"
            className="field w-48"
            aria-invalid={state.errors?.pay ? true : undefined}
            aria-describedby={['bar-pay-hint', state.errors?.pay ? 'bar-pay-error' : ''].filter(Boolean).join(' ')}
          />
          <p id="bar-pay-hint" className="hint">Like $30/hr or $85k/year. Optional.</p>
          {state.errors?.pay ? <p id="bar-pay-error" className="field-error">{state.errors.pay}</p> : null}
        </div>
        {state.errors?.bar ? <p role="alert" className="field-error">{state.errors.bar}</p> : null}
        {state.message ? <p role="alert" className="field-error">{state.message}</p> : null}
        {state.saved && !state.message ? <p role="status" className="hint">Saved</p> : null}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? 'Saving…' : 'Save bar'}
          </button>
          {bar ? (
            <button type="submit" formAction={removeBar} formNoValidate className="btn-secondary">
              Remove bar
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
